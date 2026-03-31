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

  // GET /api/strava/login-url — Strava OAuth URL for unauthenticated users (login/register)
  fastify.get('/login-url', async () => {
    const redirectUri = process.env.STRAVA_LOGIN_REDIRECT_URI
      ?? `${process.env.API_BASE_URL ?? ''}/api/strava/login-callback`

    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all',
      state: 'login',
    })

    return { url: `${STRAVA_AUTH_URL}?${params.toString()}` }
  })

  // GET /api/strava/login-callback — Strava OAuth callback for login (no auth required)
  fastify.get('/login-callback', async (request, reply) => {
    const { code, error } = request.query as Record<string, string>
    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:5173'

    if (error || !code) {
      return reply.redirect(`${frontendBase}/login?error=strava_denied`)
    }

    try {
      const tokenResp = await axios.post(STRAVA_TOKEN_URL, {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      })

      const { access_token, refresh_token, expires_at, athlete } = tokenResp.data

      // Find user by stravaAthleteId, or create new account
      let user = await fastify.prisma.user.findFirst({
        where: { stravaAccount: { stravaAthleteId: BigInt(athlete.id) } },
      })

      if (!user) {
        // New user — create account from Strava profile
        const email = athlete.email ?? `strava_${athlete.id}@strava.local`
        const existing = await fastify.prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        })
        user = existing ?? await fastify.prisma.user.create({
          data: { email, name: `${athlete.firstname} ${athlete.lastname}`.trim() },
        })
      }

      // Upsert Strava tokens
      await fastify.prisma.stravaAccount.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          stravaAthleteId: BigInt(athlete.id),
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
          scope: 'activity:read_all',
        },
        update: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
        },
      })

      // Issue JWT and redirect to frontend with token
      const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret'
      const payload = { sub: user.id, email: user.email, role: user.role }
      const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refreshToken = fastify.jwt.sign(payload, { secret: REFRESH_SECRET, expiresIn: '7d' } as any)

      const IS_PROD = process.env.NODE_ENV === 'production'
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        path: '/api/auth/refresh',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: IS_PROD ? 'none' : 'lax',
        secure: IS_PROD,
      })

      return reply.redirect(`${frontendBase}/strava/login-callback?token=${accessToken}`)
    } catch {
      return reply.redirect(`${frontendBase}/login?error=strava_failed`)
    }
  })

  // GET /api/strava/callback — OAuth callback (for authenticated users connecting Strava)
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

  // POST /api/strava/login-exchange — exchange Strava code for JWT (frontend-handled OAuth)
  fastify.post('/login-exchange', async (request, reply) => {
    const { code } = request.body as { code?: string }
    if (!code) return reply.status(400).send({ error: 'Missing code' })

    const tokenResp = await axios.post(STRAVA_TOKEN_URL, {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    })

    const { access_token, refresh_token, expires_at, athlete } = tokenResp.data

    let user = await fastify.prisma.user.findFirst({
      where: { stravaAccount: { stravaAthleteId: BigInt(athlete.id) } },
    })

    if (!user) {
      const email = athlete.email ?? `strava_${athlete.id}@strava.local`
      const existing = await fastify.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      })
      user = existing ?? await fastify.prisma.user.create({
        data: { email, name: `${athlete.firstname} ${athlete.lastname}`.trim() },
      })
    }

    await fastify.prisma.stravaAccount.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        stravaAthleteId: BigInt(athlete.id),
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(expires_at * 1000),
        scope: 'activity:read_all',
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(expires_at * 1000),
      },
    })

    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret'
    const payload = { sub: user.id, email: user.email, role: user.role }
    const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshToken = fastify.jwt.sign(payload, { secret: REFRESH_SECRET, expiresIn: '7d' } as any)

    const IS_PROD = process.env.NODE_ENV === 'production'
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      path: '/api/auth/refresh',
      maxAge: 60 * 60 * 24 * 7,
      sameSite: IS_PROD ? 'none' : 'lax',
      secure: IS_PROD,
    })

    return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  // POST /api/strava/link — link Strava to authenticated user (frontend-handled OAuth)
  fastify.post('/link', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const { code } = request.body as { code?: string }
    if (!code) throw new Error('Missing code')

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

    syncActivities(userId, fastify.prisma, 8).then(() =>
      matchActivities(userId, fastify.prisma)
    ).catch(() => {})

    return { ok: true }
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
