import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { authPlugin } from '../../plugins/auth.js'
import { watchWorkoutsRoutes } from '../watchWorkouts.js'

vi.mock('@garmin/fitsdk', () => ({
  Encoder: class {},
}))

process.env.JWT_SECRET = 'test-secret'

function makeWatchWorkout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workout-1',
    creatorId: 'user-1',
    name: 'Intervals',
    sport: 'RUNNING',
    steps: [],
    sourceType: 'MANUAL',
    ...overrides,
  }
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    watchWorkout: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(makeWatchWorkout()),
      update: vi.fn(),
      delete: vi.fn(),
    },
    trainingPlan: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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
  await app.register(watchWorkoutsRoutes, { prefix: '/api/watch-workouts' })

  return app
}

function makeBearer(app: FastifyInstance, payload: { sub: string; email: string; role: 'ATHLETE' | 'TRAINER' | 'ADMIN' }) {
  return `Bearer ${app.jwt.sign(payload)}`
}

describe('watchWorkoutsRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prevents trainers from scheduling watch workouts into their own calendar', async () => {
    const trainingPlanCreate = vi.fn()
    const app = await buildApp({
      trainingPlan: { create: trainingPlanCreate },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/watch-workouts/workout-1/schedule',
      headers: {
        authorization: makeBearer(app, { sub: 'user-1', email: 'trainer@example.com', role: 'TRAINER' }),
      },
      payload: { date: '2026-04-29' },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'Only athletes can add watch workouts to their calendar' })
    expect(trainingPlanCreate).not.toHaveBeenCalled()

    await app.close()
  })

  it('allows athletes to schedule watch workouts into their calendar', async () => {
    const trainingPlanCreate = vi.fn().mockResolvedValue({ id: 'plan-1' })
    const app = await buildApp({
      trainingPlan: { create: trainingPlanCreate },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/watch-workouts/workout-1/schedule',
      headers: {
        authorization: makeBearer(app, { sub: 'user-1', email: 'athlete@example.com', role: 'ATHLETE' }),
      },
      payload: { date: '2026-04-29' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ planId: 'plan-1' })
    expect(trainingPlanCreate).toHaveBeenCalledOnce()

    await app.close()
  })
})
