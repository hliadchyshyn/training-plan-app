import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
})

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

type FastifyWithJwt = Parameters<FastifyPluginAsync>[0]

function signTokens(fastify: FastifyWithJwt, sub: string, email: string, role: string) {
  const payload = { sub, email, role }
  const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' })
  const refreshToken = fastify.jwt.sign(payload, { secret: REFRESH_SECRET, expiresIn: '7d' })
  return { accessToken, refreshToken }
}

const IS_PROD = process.env.NODE_ENV === 'production'

function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie('refreshToken', token, {
    httpOnly: true,
    path: '/api/auth/refresh',
    maxAge: COOKIE_MAX_AGE,
    sameSite: IS_PROD ? 'none' : 'lax',
    secure: IS_PROD,
  })
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const email = body.email.toLowerCase()

    const existing = await fastify.prisma.user.findFirst({
      where: { email: { equals: body.email, mode: 'insensitive' } },
    })
    if (existing) return reply.status(409).send({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(body.password, 12)
    const user = await fastify.prisma.user.create({
      data: { email, name: body.name, passwordHash },
      select: { id: true, email: true, name: true, role: true },
    })

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email, user.role)
    setRefreshCookie(reply, refreshToken)
    return { accessToken, user }
  })

  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await fastify.prisma.user.findFirst({
      where: { email: { equals: body.email, mode: 'insensitive' } },
    })
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' })

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email, user.role)
    setRefreshCookie(reply, refreshToken)
    return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.post('/refresh', async (request, reply) => {
    const token = request.cookies.refreshToken
    if (!token) return reply.status(401).send({ error: 'No refresh token' })

    let payload: { sub: string; email: string; role: string }
    try {
      payload = fastify.jwt.verify(token, { secret: REFRESH_SECRET }) as typeof payload
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }

    const user = await fastify.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return reply.status(401).send({ error: 'User not found' })

    const accessToken = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' },
    )
    return { accessToken }
  })

  fastify.put('/password', { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    const userId = request.user.sub

    const user = await fastify.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash)
    if (!valid) return reply.status(400).send({ error: 'Невірний поточний пароль' })

    const passwordHash = await bcrypt.hash(body.newPassword, 12)
    await fastify.prisma.user.update({ where: { id: userId }, data: { passwordHash } })
    return { ok: true }
  })

  fastify.post('/logout', { preHandler: fastify.authenticate }, async (_request, reply) => {
    reply.clearCookie('refreshToken', { path: '/api/auth/refresh' })
    return { ok: true }
  })
}
