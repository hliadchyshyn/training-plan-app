import { describe, it, expect, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { Prisma } from '@prisma/client'
import { authPlugin } from '../../plugins/auth.js'
import { adminRoutes } from '../admin.js'

type UserRecord = {
  id: string
  email: string
  name: string
  role: 'ATHLETE' | 'TRAINER' | 'ADMIN'
  passwordHash: string | null
  googleId: string | null
  inviteCode: string | null
  trainerId: string | null
}

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'ATHLETE',
    passwordHash: 'hashed-password',
    googleId: null,
    inviteCode: null,
    trainerId: null,
    ...overrides,
  }
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockImplementation((args: { data: Partial<UserRecord> }) =>
        Promise.resolve(makeUser({ ...args.data })),
      ),
    },
    ...overrides,
  }
}

async function buildApp(prismaOverrides: Record<string, unknown> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(cookie)
  await app.register(authPlugin)

  app.decorate('prisma', makePrisma(prismaOverrides) as never)

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.status(409).send({ error: 'Conflict' })
    }
    const statusCode = error.statusCode ?? 500
    return reply.status(statusCode).send({ error: error.message ?? 'Internal Server Error' })
  })

  await app.register(adminRoutes, { prefix: '/api/admin' })
  await app.ready()
  return app
}

function makeBearer(app: FastifyInstance) {
  return `Bearer ${app.jwt.sign({ sub: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }, { expiresIn: '2h' })}`
}

describe('PUT /api/admin/users/:id/role', () => {
  it('generates invite code and clears trainer link when athlete becomes trainer', async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce(makeUser({ id: 'user-2', trainerId: 'trainer-9', inviteCode: null, role: 'ATHLETE' }))
      .mockResolvedValueOnce(null)

    const update = vi.fn().mockResolvedValue({
      id: 'user-2',
      email: 'athlete@example.com',
      name: 'Athlete',
      role: 'TRAINER',
      inviteCode: 'ABC123',
    })

    const app = await buildApp({
      user: {
        findMany: vi.fn(),
        findUnique,
        update,
      },
    })

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/users/user-2/role',
      headers: { authorization: makeBearer(app) },
      payload: { role: 'TRAINER' },
    })

    randomSpy.mockRestore()

    expect(res.statusCode).toBe(200)
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { role: 'TRAINER', inviteCode: 'AAAAAA', trainerId: null },
      select: { id: true, email: true, name: true, role: true, inviteCode: true },
    })

    await app.close()
  })
})
