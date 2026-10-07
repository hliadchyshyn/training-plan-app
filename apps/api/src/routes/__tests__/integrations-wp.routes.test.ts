import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { authPlugin } from '../../plugins/auth.js'
import { wpIntegrationRoutes } from '../integrations-wp.js'
import { signWpBridgePayload } from '../../utils/wpBridgeAuth.js'

vi.mock('../../utils/wpRaceClient.js', () => ({
  getWpBridgeConfig: vi.fn(),
  createWpRaceFetcher: vi.fn(() => vi.fn()),
}))
vi.mock('../../utils/wpRaceSync.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/wpRaceSync.js')>()
  return { ...actual, reconcileWpRaces: vi.fn() }
})

import { getWpBridgeConfig } from '../../utils/wpRaceClient.js'
import { reconcileWpRaces } from '../../utils/wpRaceSync.js'

const SECRET = 'bridge-secret'

const body = JSON.stringify({
  events: [
    { type: 'registration.deleted', id: 5 },
    { type: 'result.deleted', id: 6 },
  ],
})

function signedHeaders(payload: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)) {
  return {
    'content-type': 'application/json',
    'x-tsclub-timestamp': String(ts),
    'x-tsclub-signature': signWpBridgePayload(secret, ts, payload),
  }
}

function makePrisma() {
  const tx = {
    raceRegistration: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    raceResult: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  }
  return {
    tx,
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  }
}

let prisma: ReturnType<typeof makePrisma>

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(authPlugin)
  prisma = makePrisma()
  app.decorate('prisma', prisma as never)
  await app.register(wpIntegrationRoutes, { prefix: '/api/integrations/wp' })
  return app
}

describe('POST /api/integrations/wp/events', () => {
  const original = process.env.WP_BRIDGE_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WP_BRIDGE_SECRET = SECRET
  })
  afterEach(() => {
    process.env.WP_BRIDGE_SECRET = original
  })

  it('applies signed events in a transaction', async () => {
    const app = await buildApp()

    const res = await app.inject({ method: 'POST', url: '/api/integrations/wp/events', headers: signedHeaders(body), payload: body })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true, data: { applied: 2, skipped: 0, rejected: 0 } })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.tx.raceRegistration.deleteMany).toHaveBeenCalledWith({ where: { wpId: 5 } })
  })

  it('rejects a missing signature', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/events',
      headers: { 'content-type': 'application/json' },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a signature made with another secret', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/events',
      headers: signedHeaders(body, 'wrong'),
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('verifies against the raw bytes, not re-serialized JSON', async () => {
    const app = await buildApp()
    const spaced = body.replace(/,/g, ', ') // same JSON, different bytes
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/events',
      headers: signedHeaders(body),
      payload: spaced,
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a stale timestamp', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/events',
      headers: signedHeaders(body, SECRET, Math.floor(Date.now() / 1000) - 600),
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 for a signed but malformed envelope', async () => {
    const app = await buildApp()
    const bad = JSON.stringify({ events: [] })
    const res = await app.inject({ method: 'POST', url: '/api/integrations/wp/events', headers: signedHeaders(bad), payload: bad })
    expect(res.statusCode).toBe(400)
  })

  it('applies valid events and skips invalid ones in the same batch', async () => {
    const app = await buildApp()
    const mixed = JSON.stringify({ events: [{ type: 'nope' }, { type: 'registration.deleted', id: 5 }] })
    const res = await app.inject({ method: 'POST', url: '/api/integrations/wp/events', headers: signedHeaders(mixed), payload: mixed })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ applied: 1, skipped: 0, rejected: 1 })
  })

  it('does not open a transaction when every event is invalid', async () => {
    const app = await buildApp()
    const bad = JSON.stringify({ events: [{ type: 'nope' }] })
    const res = await app.inject({ method: 'POST', url: '/api/integrations/wp/events', headers: signedHeaders(bad), payload: bad })
    expect(res.json().data).toEqual({ applied: 0, skipped: 0, rejected: 1 })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/integrations/wp/events', headers: signedHeaders('{'), payload: '{' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 503 when the bridge secret is not configured', async () => {
    delete process.env.WP_BRIDGE_SECRET
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/integrations/wp/events', headers: signedHeaders(body), payload: body })
    expect(res.statusCode).toBe(503)
  })
})

describe('POST /api/integrations/wp/reconcile', () => {
  beforeEach(() => vi.clearAllMocks())

  const token = (app: FastifyInstance, role: 'ADMIN' | 'TRAINER') =>
    app.jwt.sign({ sub: 'u1', email: 'a@b.c', role })

  it('requires ADMIN', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/reconcile',
      headers: { authorization: `Bearer ${token(app, 'TRAINER')}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 503 when WP is not configured', async () => {
    vi.mocked(getWpBridgeConfig).mockReturnValue(null)
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/reconcile',
      headers: { authorization: `Bearer ${token(app, 'ADMIN')}` },
    })
    expect(res.statusCode).toBe(503)
  })

  it('runs a full reconcile when asked', async () => {
    vi.mocked(getWpBridgeConfig).mockReturnValue({ baseUrl: 'https://x', secret: 's' })
    vi.mocked(reconcileWpRaces).mockResolvedValue({ pages: 1, applied: 3, rejected: 0, deletedRegistrations: 0, deletedResults: 1 })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/reconcile',
      headers: { authorization: `Bearer ${token(app, 'ADMIN')}` },
      payload: { full: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.applied).toBe(3)
    expect(vi.mocked(reconcileWpRaces).mock.calls[0][2]).toMatchObject({ full: true })
  })

  it('maps WP failures to 502', async () => {
    vi.mocked(getWpBridgeConfig).mockReturnValue({ baseUrl: 'https://x', secret: 's' })
    vi.mocked(reconcileWpRaces).mockRejectedValue(new Error('timeout'))
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/wp/reconcile',
      headers: { authorization: `Bearer ${token(app, 'ADMIN')}` },
    })

    expect(res.statusCode).toBe(502)
  })
})
