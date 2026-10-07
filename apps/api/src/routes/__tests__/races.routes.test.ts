import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { authPlugin } from '../../plugins/auth.js'
import { raceRoutes } from '../races.js'

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

const registration = {
  id: 'r1',
  wpId: 1,
  wpUserId: 45,
  email: 'ivan@example.com',
  userName: null,
  anonsEventId: 77,
  eventTitle: 'Kyiv Half',
  eventDate: new Date('2026-10-25T00:00:00Z'),
  location: null,
  eventUrl: null,
  distance: 'Півмарафон',
  raceDistanceCode: 'HM',
  goalTimeRaw: '1:35:00',
  goalSeconds: 5700,
  notes: null,
  wpUpdatedAt: new Date(),
  syncedAt: new Date(),
}

function makePrisma() {
  return {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    raceRegistration: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    raceResult: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
  }
}

let prisma: ReturnType<typeof makePrisma>

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(authPlugin)
  prisma = makePrisma()
  app.decorate('prisma', prisma as never)
  await app.register(raceRoutes, { prefix: '/api/races' })
  return app
}

const auth = (app: FastifyInstance, role: 'ATHLETE' | 'TRAINER' | 'ADMIN', sub = 'me') => ({
  authorization: `Bearer ${app.jwt.sign({ sub, email: 'x@y.z', role })}`,
})

describe('GET /api/races', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/races' })
    expect(res.statusCode).toBe(401)
  })

  it('trainer: limits to own athletes by lowercased email', async () => {
    const app = await buildApp()
    prisma.user.findMany.mockResolvedValue([{ id: ATHLETE_ID, name: 'Іван', email: 'Ivan@Example.com' }])
    prisma.raceRegistration.findMany.mockResolvedValue([registration])

    const res = await app.inject({
      method: 'GET',
      url: '/api/races?from=2026-10-01&to=2026-10-31',
      headers: auth(app, 'TRAINER', 'trainer-1'),
    })

    expect(res.statusCode).toBe(200)
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ trainerId: 'trainer-1' })
    expect(prisma.raceRegistration.findMany.mock.calls[0][0].where).toEqual({
      eventDate: { gte: new Date('2026-10-01T00:00:00Z'), lte: new Date('2026-10-31T00:00:00Z') },
      email: { in: ['ivan@example.com'] },
    })
    const [entry] = res.json()
    expect(entry).toMatchObject({ key: 'reg-1', athlete: { id: ATHLETE_ID }, goalSeconds: 5700, result: null })
  })

  it('trainer: 404 for an athlete outside the team', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/races?athleteId=${OTHER_ID}`,
      headers: auth(app, 'TRAINER', 'trainer-1'),
    })
    expect(res.statusCode).toBe(404)
    expect(prisma.raceRegistration.findMany).not.toHaveBeenCalled()
  })

  it('trainer without athletes gets an empty list without querying races', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/races', headers: auth(app, 'TRAINER') })
    expect(res.json()).toEqual([])
    expect(prisma.raceRegistration.findMany).not.toHaveBeenCalled()
  })

  it('athlete: cannot read another athlete', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/races?athleteId=${OTHER_ID}`,
      headers: auth(app, 'ATHLETE', ATHLETE_ID),
    })
    expect(res.statusCode).toBe(403)
  })

  it('athlete: sees only self', async () => {
    const app = await buildApp()
    prisma.user.findMany.mockResolvedValue([{ id: ATHLETE_ID, name: 'Іван', email: 'ivan@example.com' }])
    await app.inject({ method: 'GET', url: '/api/races', headers: auth(app, 'ATHLETE', ATHLETE_ID) })
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: ATHLETE_ID })
  })

  it('admin: no email filter, athletes resolved case-insensitively', async () => {
    const app = await buildApp()
    prisma.raceRegistration.findMany.mockResolvedValue([registration])
    prisma.user.findMany.mockResolvedValue([{ id: ATHLETE_ID, name: 'Іван', email: 'IVAN@example.com' }])

    const res = await app.inject({ method: 'GET', url: '/api/races', headers: auth(app, 'ADMIN') })

    expect(prisma.raceRegistration.findMany.mock.calls[0][0].where.email).toBeUndefined()
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      email: { in: ['ivan@example.com'], mode: 'insensitive' },
    })
    expect(res.json()[0].athlete.id).toBe(ATHLETE_ID)
  })

  it('rejects an inverted or too long range', async () => {
    const app = await buildApp()
    const inverted = await app.inject({ method: 'GET', url: '/api/races?from=2026-10-10&to=2026-10-01', headers: auth(app, 'ADMIN') })
    const tooLong = await app.inject({ method: 'GET', url: '/api/races?from=2020-01-01&to=2026-01-01', headers: auth(app, 'ADMIN') })
    expect(inverted.statusCode).toBe(400)
    expect(tooLong.statusCode).toBe(400)
  })
})

describe('GET /api/races/unmatched', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is admin-only', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/races/unmatched', headers: auth(app, 'TRAINER') })
    expect(res.statusCode).toBe(403)
  })

  it('lists WP emails without a plans account, busiest first', async () => {
    const app = await buildApp()
    prisma.raceRegistration.groupBy.mockResolvedValue([
      { email: 'known@x.com', _count: { _all: 3 } },
      { email: 'a@x.com', _count: { _all: 1 } },
    ])
    prisma.raceResult.groupBy.mockResolvedValue([
      { email: 'b@x.com', _count: { _all: 4 } },
      { email: 'a@x.com', _count: { _all: 1 } },
    ])
    prisma.user.findMany.mockResolvedValue([{ email: 'Known@X.com' }])

    const res = await app.inject({ method: 'GET', url: '/api/races/unmatched', headers: auth(app, 'ADMIN') })

    expect(res.json()).toEqual([
      { email: 'b@x.com', registrations: 0, results: 4 },
      { email: 'a@x.com', registrations: 1, results: 1 },
    ])
  })
})
