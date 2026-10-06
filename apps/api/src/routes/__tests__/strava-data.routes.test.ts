import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { authPlugin } from '../../plugins/auth.js'
import { stravaDataRoutes } from '../strava-data.js'

vi.mock('../../utils/strava.js', () => ({
  syncActivities: vi.fn().mockResolvedValue({ upserted: 0 }),
}))
vi.mock('../../utils/stravaMatch.js', () => ({
  matchActivities: vi.fn().mockResolvedValue(0),
}))

import { syncActivities } from '../../utils/strava.js'

process.env.JWT_SECRET = 'test-secret'

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    stravaAccount: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  }
}

async function buildApp(prismaOverrides: Record<string, unknown> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(authPlugin)

  app.decorate('prisma', makePrisma(prismaOverrides) as never)
  await app.register(stravaDataRoutes, { prefix: '/api/strava' })

  return app
}

const validEvent = {
  object_type: 'activity',
  object_id: 123,
  owner_id: 456,
  aspect_type: 'create',
  subscription_id: 999,
}

describe('POST /api/strava/webhook', () => {
  const originalSubId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = '999'
  })

  afterEach(() => {
    process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = originalSubId
  })

  it('rejects a malformed payload', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/strava/webhook',
      payload: { garbage: true },
    })

    expect(res.statusCode).toBe(400)
  })

  it('rejects an event whose subscription_id does not match our subscription', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/strava/webhook',
      payload: { ...validEvent, subscription_id: 111 },
    })

    expect(res.statusCode).toBe(403)
    expect(syncActivities).not.toHaveBeenCalled()
  })

  it('rejects any event when STRAVA_WEBHOOK_SUBSCRIPTION_ID is not configured', async () => {
    delete process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/strava/webhook',
      payload: validEvent,
    })

    expect(res.statusCode).toBe(403)
  })

  it('triggers a sync for a known account on a matching subscription_id', async () => {
    const findUnique = vi.fn().mockResolvedValue({ userId: 'user-1' })
    const app = await buildApp({ stravaAccount: { findUnique } })

    const res = await app.inject({
      method: 'POST',
      url: '/api/strava/webhook',
      payload: validEvent,
    })

    expect(res.statusCode).toBe(200)
    expect(findUnique).toHaveBeenCalledWith({ where: { stravaAthleteId: BigInt(456) } })
    await vi.waitFor(() => expect(syncActivities).toHaveBeenCalledWith('user-1', expect.anything(), 2))
  })

  it('does not sync when the account is unknown, even with a valid subscription_id', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/strava/webhook',
      payload: validEvent,
    })

    expect(res.statusCode).toBe(200)
    expect(syncActivities).not.toHaveBeenCalled()
  })
})
