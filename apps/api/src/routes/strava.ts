import type { FastifyInstance } from 'fastify'
import { syncActivities } from '../utils/strava.js'
import { matchActivities } from '../utils/stravaMatch.js'
import axios from 'axios'

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

export async function stravaRoutes(fastify: FastifyInstance) {
  // GET /api/strava/status
  fastify.get('/status', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const account = await fastify.prisma.stravaAccount.findUnique({
      where: { userId },
      select: { id: true, stravaAthleteId: true, createdAt: true, updatedAt: true, scope: true },
    })
    if (!account) return { connected: false }
    return {
      connected: true,
      stravaAthleteId: account.stravaAthleteId.toString(),
      connectedAt: account.createdAt,
      lastSync: account.updatedAt,
    }
  })

  // GET /api/strava/auth-url — returns Strava OAuth URL (called via axios, handles token refresh)
  fastify.get('/auth-url', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const redirectUri = process.env.STRAVA_REDIRECT_URI ?? `${process.env.API_BASE_URL ?? ''}/api/strava/callback`

    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'force',
      scope: 'activity:read_all',
      state: userId,
    })

    return { url: `${STRAVA_AUTH_URL}?${params.toString()}` }
  })

  // GET /api/strava/callback — OAuth callback
  fastify.get('/callback', async (request, reply) => {
    const { code, state: userId, error } = request.query as Record<string, string>
    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:5173'

    if (error || !code || !userId) {
      return reply.redirect(`${frontendBase}/strava/connected?error=access_denied`)
    }

    try {
      const tokenResp = await axios.post(STRAVA_TOKEN_URL, {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      })

      const { access_token, refresh_token, expires_at, athlete } = tokenResp.data

      await fastify.prisma.stravaAccount.upsert({
        where: { userId },
        create: {
          userId,
          stravaAthleteId: BigInt(athlete.id),
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
        },
        update: {
          stravaAthleteId: BigInt(athlete.id),
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
        },
      })

      // Sync last 8 weeks in background
      syncActivities(userId, fastify.prisma, 8).then(() =>
        matchActivities(userId, fastify.prisma)
      ).catch(() => {})

      return reply.redirect(`${frontendBase}/strava/connected`)
    } catch {
      return reply.redirect(`${frontendBase}/strava/connected?error=token_exchange`)
    }
  })

  // DELETE /api/strava/disconnect
  fastify.delete('/disconnect', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const account = await fastify.prisma.stravaAccount.findUnique({ where: { userId } })
    if (account) {
      // Deauthorize with Strava to revoke tokens
      await axios.post('https://www.strava.com/oauth/deauthorize', null, {
        params: { access_token: account.accessToken },
      }).catch(() => {}) // ignore if already revoked
      await fastify.prisma.stravaAccount.delete({ where: { userId } })
    }
    return { ok: true }
  })

  // POST /api/strava/sync
  fastify.post('/sync', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const { weeks } = (request.body as { weeks?: number }) ?? {}

    const account = await fastify.prisma.stravaAccount.findUnique({ where: { userId } })
    if (!account) return { error: 'Not connected' }

    const { upserted } = await syncActivities(userId, fastify.prisma, weeks ?? 8)
    const matched = await matchActivities(userId, fastify.prisma)

    return { upserted, matched }
  })

  // GET /api/strava/webhook — Strava subscription validation
  fastify.get('/webhook', async (request, reply) => {
    const q = request.query as Record<string, string>
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === (process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? '')
    ) {
      return reply.send({ 'hub.challenge': q['hub.challenge'] })
    }
    return reply.status(403).send({ error: 'Forbidden' })
  })

  // POST /api/strava/webhook — Strava push event
  fastify.post('/webhook', async (request) => {
    const event = request.body as { object_type: string; object_id: number; owner_id: number; aspect_type: string }

    if (event.object_type === 'activity' && (event.aspect_type === 'create' || event.aspect_type === 'update')) {
      // Find user by stravaAthleteId and trigger sync
      const account = await fastify.prisma.stravaAccount.findUnique({
        where: { stravaAthleteId: BigInt(event.owner_id) },
      })
      if (account) {
        syncActivities(account.userId, fastify.prisma, 2).then(() =>
          matchActivities(account.userId, fastify.prisma)
        ).catch(() => {})
      }
    }

    return { ok: true }
  })

  // GET /api/strava/activities
  fastify.get('/activities', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number }

    const [items, total] = await Promise.all([
      fastify.prisma.stravaActivity.findMany({
        where: { athleteId: userId },
        orderBy: { startDate: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        select: {
          id: true, stravaId: true, name: true, type: true,
          startDateLocal: true, distance: true, movingTime: true,
          averageHeartrate: true, maxHeartrate: true, totalElevationGain: true,
          sessionId: true, matchConfidence: true, matchedAt: true,
        },
      }),
      fastify.prisma.stravaActivity.count({ where: { athleteId: userId } }),
    ])

    return { data: items.map((a) => ({ ...a, stravaId: a.stravaId.toString() })), total }
  })
}
