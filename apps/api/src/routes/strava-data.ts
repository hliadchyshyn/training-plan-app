import type { FastifyInstance } from 'fastify'
import { syncActivities } from '../utils/strava.js'
import { matchActivities } from '../utils/stravaMatch.js'

export async function stravaDataRoutes(fastify: FastifyInstance) {
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

  // POST /api/strava/sync
  fastify.post('/sync', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const { weeks } = (request.body as { weeks?: number }) ?? {}
    const sanitizedWeeks = Math.min(Math.max(1, weeks ?? 8), 52)

    const account = await fastify.prisma.stravaAccount.findUnique({ where: { userId } })
    if (!account) return { error: 'Not connected' }

    const { upserted } = await syncActivities(userId, fastify.prisma, sanitizedWeeks)
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
      const account = await fastify.prisma.stravaAccount.findUnique({
        where: { stravaAthleteId: BigInt(event.owner_id) },
      })
      if (account) {
        syncActivities(account.userId, fastify.prisma, 2)
          .then(() => matchActivities(account.userId, fastify.prisma))
          .catch((err: unknown) =>
            fastify.log.error({ err, userId: account.userId }, 'Background Strava sync failed on webhook event'),
          )
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
