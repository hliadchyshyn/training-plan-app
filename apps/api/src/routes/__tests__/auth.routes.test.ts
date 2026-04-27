import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { Prisma } from '@prisma/client'
import { authPlugin } from '../../plugins/auth.js'
import { authRoutes } from '../auth.js'

// ---------------------------------------------------------------------------
// Mock bcrypt so tests don't spend 12 rounds hashing
// ---------------------------------------------------------------------------

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args: { data: Partial<UserRecord> }) =>
        Promise.resolve(makeUser({ ...args.data })),
      ),
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

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.ready()
  return app
}

/** Generate a valid signed JWT for test requests */
function makeBearer(
  app: FastifyInstance,
  payload: { sub: string; email: string; role: 'ATHLETE' | 'TRAINER' | 'ADMIN' } = {
    sub: 'user-1',
    email: 'test@example.com',
    role: 'ATHLETE',
  },
) {
  return `Bearer ${app.jwt.sign(payload, { expiresIn: '2h' })}`
}

/** Generate a valid refresh token cookie string */
function makeRefreshCookie(app: FastifyInstance, payload = { sub: 'user-1', email: 'test@example.com', role: 'ATHLETE' }) {
  const token = (app.jwt as unknown as { sign: (p: unknown, opts: unknown) => string }).sign(
    payload,
    { secret: 'test-refresh-secret', expiresIn: '7d' },
  )
  return `refreshToken=${token}`
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe('POST /api/auth/register', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 200 with accessToken and user on valid registration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'new@example.com', name: 'New User', password: 'password123' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('accessToken')
    expect(body.user).toMatchObject({ email: 'new@example.com' })
  })

  it('returns 409 when email already exists', async () => {
    const app = await buildApp({
      user: { findFirst: vi.fn().mockResolvedValue(makeUser()), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'existing@example.com', name: 'Existing', password: 'password123' },
    })

    expect(res.statusCode).toBe(409)
    await app.close()
  })

  it('returns 400 for invalid email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', name: 'User', password: 'password123' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for password shorter than 8 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'new@example.com', name: 'User', password: 'short' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for name shorter than 2 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'new@example.com', name: 'A', password: 'password123' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when ATHLETE provides invalid invite code', async () => {
    const app = await buildApp({
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null), // trainer not found
        create: vi.fn(),
        update: vi.fn(),
      },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'new@example.com', name: 'Athlete', password: 'password123', role: 'ATHLETE', inviteCode: 'BADCOD' },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toContain('тренера')
    await app.close()
  })

  it('sets refreshToken cookie in the response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'new@example.com', name: 'New User', password: 'password123' },
    })

    expect(res.headers['set-cookie']).toBeDefined()
    expect(res.headers['set-cookie']).toMatch(/refreshToken=/)
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  it('returns 200 with accessToken on valid credentials', async () => {
    const user = makeUser()
    const app = await buildApp({
      user: { findFirst: vi.fn().mockResolvedValue(user), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('accessToken')
    await app.close()
  })

  it('returns 401 when user is not found', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 401 when password is wrong', async () => {
    const { default: bcrypt } = await import('bcrypt')
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never)

    const user = makeUser()
    const app = await buildApp({
      user: { findFirst: vi.fn().mockResolvedValue(user), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'wrong-password' },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 401 for OAuth user with no passwordHash', async () => {
    const user = makeUser({ passwordHash: null, googleId: 'google-123' })
    const app = await buildApp({
      user: { findFirst: vi.fn().mockResolvedValue(user), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'password123' },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toBe('Use OAuth login')
    await app.close()
  })

  it('returns 400 for missing email in request body', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'password123' },
    })

    expect(res.statusCode).toBe(400)
    await app.close()
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

describe('POST /api/auth/refresh', () => {
  it('returns 401 when no refresh cookie is present', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('No refresh token')
    await app.close()
  })

  it('returns 401 for an invalid/tampered refresh token', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: 'refreshToken=tampered.token.here' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('Invalid refresh token')
    await app.close()
  })

  it('returns 401 when user from token no longer exists in DB', async () => {
    const app = await buildApp({
      user: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    })

    const cookie = makeRefreshCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('User not found')
    await app.close()
  })

  it('returns 200 with new accessToken when token and user are valid', async () => {
    const user = makeUser()
    const app = await buildApp({
      user: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue(user), create: vi.fn(), update: vi.fn() },
    })

    const cookie = makeRefreshCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('accessToken')
    await app.close()
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  it('returns 401 without auth token', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 200 and clears cookie for authenticated user', async () => {
    const user = makeUser()
    const app = await buildApp({
      user: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue(user), create: vi.fn(), update: vi.fn() },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: makeBearer(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    // Cookie should be cleared (empty value)
    expect(res.headers['set-cookie']).toBeDefined()
    await app.close()
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe('GET /api/auth/me', () => {
  it('returns 401 without auth token', async () => {
    const app = await buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns user profile for authenticated user', async () => {
    const user = makeUser({
      googleId: null,
      inviteCode: null,
      stravaAccount: null,
      trainer: null,
    } as never)
    const app = await buildApp({
      user: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue(user), create: vi.fn(), update: vi.fn() },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: makeBearer(app) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({
      id: 'user-1',
      email: 'test@example.com',
      role: 'ATHLETE',
    })
    expect(body).toHaveProperty('hasPassword')
    expect(body).toHaveProperty('googleLinked')
    expect(body).toHaveProperty('stravaLinked')
    await app.close()
  })
})

// ---------------------------------------------------------------------------
// PUT /api/auth/trainer
// ---------------------------------------------------------------------------

describe('PUT /api/auth/trainer', () => {
  it('returns 401 without auth token', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/trainer',
      payload: { inviteCode: 'TEST01' },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('updates athlete trainer by invite code', async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce(makeUser({ role: 'ATHLETE' }))
      .mockResolvedValueOnce(makeUser({ id: 'trainer-1', role: 'TRAINER', inviteCode: 'TEST01', name: 'Coach' }))

    const update = vi.fn().mockResolvedValue({
      trainer: { id: 'trainer-1', name: 'Coach' },
    })

    const app = await buildApp({
      user: { findFirst: vi.fn(), findUnique, create: vi.fn(), update },
    })

    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/trainer',
      headers: { authorization: makeBearer(app) },
      payload: { inviteCode: 'TEST01' },
    })

    expect(res.statusCode).toBe(200)
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { trainerId: 'trainer-1' },
      select: { trainer: { select: { id: true, name: true } } },
    })
    expect(res.json()).toEqual({ ok: true, trainerName: 'Coach' })
    await app.close()
  })

  it('returns 400 for invalid trainer code', async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce(makeUser({ role: 'ATHLETE' }))
      .mockResolvedValueOnce(null)

    const app = await buildApp({
      user: { findFirst: vi.fn(), findUnique, create: vi.fn(), update: vi.fn() },
    })

    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/trainer',
      headers: { authorization: makeBearer(app) },
      payload: { inviteCode: 'BADCOD' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('тренера')
    await app.close()
  })

  it('returns 403 when non-athlete tries to update trainer', async () => {
    const app = await buildApp({
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(makeUser({ role: 'TRAINER' })),
        create: vi.fn(),
        update: vi.fn(),
      },
    })

    const res = await app.inject({
      method: 'PUT',
      url: '/api/auth/trainer',
      headers: { authorization: makeBearer(app, { sub: 'user-1', email: 'trainer@example.com', role: 'TRAINER' }) },
      payload: { inviteCode: 'TEST01' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})
