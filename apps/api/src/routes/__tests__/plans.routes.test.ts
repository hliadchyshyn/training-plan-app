import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { Prisma } from '@prisma/client'
import { authPlugin } from '../../plugins/auth.js'
import { planRoutes } from '../plans.js'

process.env.JWT_SECRET = 'test-secret'

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ trainerId: 'trainer-1' }),
    },
    individualPlan: {
      create: vi.fn().mockResolvedValue({ id: 'plan-1', days: [] }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    trainingPlan: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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

  app.setErrorHandler((error, _req, reply) => {
    if (error.name === 'ZodError' || (error.message?.startsWith('[') && error.message?.includes('"validation"'))) {
      try {
        return reply.status(400).send({ error: 'Validation error', details: JSON.parse(error.message) })
      } catch {
        return reply.status(400).send({ error: 'Validation error' })
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.status(409).send({ error: 'Conflict' })
    }
    const statusCode = error.statusCode ?? 500
    return reply.status(statusCode).send({ error: error.message ?? 'Internal Server Error' })
  })

  await app.register(planRoutes, { prefix: '/api/plans' })
  return app
}

function makeBearer(app: FastifyInstance) {
  return `Bearer ${app.jwt.sign({ sub: 'trainer-1', email: 'trainer@example.com', role: 'TRAINER' })}`
}

describe('planRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an individual plan when weekStart is a date-only Monday string', async () => {
    const individualPlanCreate = vi.fn().mockResolvedValue({ id: 'plan-1', days: [] })
    const app = await buildApp({
      individualPlan: { create: individualPlanCreate, findFirst: vi.fn().mockResolvedValue(null) },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/plans/individual',
      headers: { authorization: makeBearer(app) },
      payload: {
        athleteId: '5a263440-a53f-4bb4-b89a-765fef2d818f',
        weekStart: '2026-05-18',
        days: [{ dayOfWeek: 1, rawText: 'Easy run 40 min' }],
      },
    })

    expect(res.statusCode).toBe(201)
    expect(individualPlanCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        weekStart: new Date('2026-05-18'),
      }),
    }))

    await app.close()
  })

  it('rejects ISO datetimes for weekStart before writing an individual plan', async () => {
    const individualPlanCreate = vi.fn()
    const app = await buildApp({
      individualPlan: { create: individualPlanCreate },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/plans/individual',
      headers: { authorization: makeBearer(app) },
      payload: {
        athleteId: '5a263440-a53f-4bb4-b89a-765fef2d818f',
        weekStart: '2026-05-22T11:37:11.000Z',
        days: [{ dayOfWeek: 1, rawText: 'Easy run 40 min' }],
      },
    })

    expect(res.statusCode).toBe(400)
    expect(individualPlanCreate).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects creating an individual plan when one already exists for the athlete/week', async () => {
    const individualPlanCreate = vi.fn()
    const individualPlanFindFirst = vi.fn().mockResolvedValue({ id: 'existing-plan-1' })
    const app = await buildApp({
      individualPlan: { create: individualPlanCreate, findFirst: individualPlanFindFirst },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/plans/individual',
      headers: { authorization: makeBearer(app) },
      payload: {
        athleteId: '5a263440-a53f-4bb4-b89a-765fef2d818f',
        weekStart: '2026-05-18',
        days: [{ dayOfWeek: 1, rawText: 'Easy run 40 min' }],
      },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ existingPlanId: 'existing-plan-1' })
    expect(individualPlanCreate).not.toHaveBeenCalled()

    await app.close()
  })
})
