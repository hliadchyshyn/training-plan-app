import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { OAuth2Client } from 'google-auth-library'
import type { Role } from '@training-plan/shared'

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(['ATHLETE', 'TRAINER']).default('ATHLETE'),
  inviteCode: z.string().regex(/^[A-Z2-9]{6}$/).optional(),
})

const googleCredentialSchema = z.object({
  credential: z.string().min(10),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
})

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
if (!REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET environment variable is required')
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

type FastifyWithJwt = Parameters<FastifyPluginAsync>[0]

function signTokens(fastify: FastifyWithJwt, sub: string, email: string, role: Role) {
  const payload = { sub, email, role }
  const accessToken = fastify.jwt.sign(payload, { expiresIn: '2h' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = fastify.jwt.sign(payload, { secret: REFRESH_SECRET, expiresIn: '7d' } as any)
  return { accessToken, refreshToken }
}

const IS_PROD = process.env.NODE_ENV === 'production'

async function verifyGoogleToken(credential: string, clientId: string) {
  const client = new OAuth2Client(clientId)
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
  const payload = ticket.getPayload()
  if (!payload) throw new Error('Empty token payload')
  if (!payload.email_verified) throw new Error('Email not verified')
  return payload
}

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
  fastify.post('/register', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const email = body.email.toLowerCase()

    const existing = await fastify.prisma.user.findFirst({
      where: { email: { equals: body.email, mode: 'insensitive' } },
    })
    if (existing) return reply.status(409).send({ error: 'Email already registered' })

    // Resolve trainer by invite code (athletes only)
    let trainerId: string | undefined
    if (body.role === 'ATHLETE' && body.inviteCode) {
      const trainer = await fastify.prisma.user.findUnique({
        where: { inviteCode: body.inviteCode.toUpperCase() },
      })
      if (!trainer || trainer.role !== 'TRAINER') {
        return reply.status(400).send({ error: 'Невірний код тренера' })
      }
      trainerId = trainer.id
    }

    // Generate unique invite code for trainers
    let inviteCode: string | undefined
    if (body.role === 'TRAINER') {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
        const exists = await fastify.prisma.user.findUnique({ where: { inviteCode: code } })
        if (!exists) { inviteCode = code; break }
      }
      if (!inviteCode) throw new Error('Failed to generate unique invite code')
    }

    const passwordHash = await bcrypt.hash(body.password, 12)
    const user = await fastify.prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash,
        role: body.role,
        inviteCode,
        trainerId,
      },
      select: { id: true, email: true, name: true, role: true },
    })

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email, user.role)
    setRefreshCookie(reply, refreshToken)
    return { accessToken, user }
  })

  fastify.post('/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await fastify.prisma.user.findFirst({
      where: { email: { equals: body.email, mode: 'insensitive' } },
    })
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' })

    if (!user.passwordHash) return reply.status(401).send({ error: 'Use OAuth login' })
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload = fastify.jwt.verify(token, { secret: REFRESH_SECRET } as any) as typeof payload
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }

    const user = await fastify.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return reply.status(401).send({ error: 'User not found' })

    const accessToken = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: '2h' },
    )
    return { accessToken }
  })

  fastify.put('/password', { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    const userId = request.user.sub

    const user = await fastify.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    if (!user.passwordHash) return reply.status(400).send({ error: 'OAuth account has no password' })
    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash)
    if (!valid) return reply.status(400).send({ error: 'Невірний поточний пароль' })

    const passwordHash = await bcrypt.hash(body.newPassword, 12)
    await fastify.prisma.user.update({ where: { id: userId }, data: { passwordHash } })
    return { ok: true }
  })

  fastify.get('/me', { preHandler: fastify.authenticate }, async (request) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true, email: true, name: true, role: true,
        googleId: true, passwordHash: true, inviteCode: true,
        trainer: { select: { id: true, name: true } },
        stravaAccount: { select: { stravaAthleteId: true } },
      },
    })
    if (!user) return null
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      inviteCode: user.inviteCode ?? null,
      trainerName: user.trainer?.name ?? null,
      hasPassword: !!user.passwordHash,
      googleLinked: !!user.googleId,
      stravaLinked: !!user.stravaAccount,
    }
  })

  // POST /api/auth/invite-code/regenerate — generate a new invite code for trainer
  fastify.post('/invite-code/regenerate', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = await fastify.prisma.user.findUnique({ where: { id: request.user.sub } })
    if (!user || (user.role !== 'TRAINER' && user.role !== 'ADMIN')) {
      return reply.status(403).send({ error: 'Only trainers can regenerate invite codes' })
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      const existing = await fastify.prisma.user.findUnique({ where: { inviteCode: candidate } })
      if (!existing) { code = candidate; break }
    }
    if (!code) return reply.status(500).send({ error: 'Failed to generate unique invite code' })
    await fastify.prisma.user.update({ where: { id: request.user.sub }, data: { inviteCode: code } })
    return { inviteCode: code }
  })

  fastify.post('/logout', { preHandler: fastify.authenticate }, async (_request, reply) => {
    reply.clearCookie('refreshToken', { path: '/api/auth/refresh' })
    return { ok: true }
  })

  // POST /api/auth/google/link — link Google account to existing authenticated user
  fastify.post('/google/link', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { credential } = googleCredentialSchema.parse(request.body)

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) return reply.status(500).send({ error: 'Google auth not configured' })

    let payload: Awaited<ReturnType<typeof verifyGoogleToken>>
    try {
      payload = await verifyGoogleToken(credential, clientId)
    } catch {
      return reply.status(401).send({ error: 'Invalid Google token' })
    }

    const existing = await fastify.prisma.user.findUnique({ where: { googleId: payload.sub } })
    if (existing && existing.id !== request.user.sub) {
      return reply.status(409).send({ error: 'Цей Google акаунт вже прив\'язаний до іншого акаунту' })
    }

    await fastify.prisma.user.update({
      where: { id: request.user.sub },
      data: { googleId: payload.sub },
    })
    return { ok: true }
  })

  // DELETE /api/auth/google/link — unlink Google account
  fastify.delete('/google/link', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = await fastify.prisma.user.findUnique({ where: { id: request.user.sub } })
    if (!user?.passwordHash) {
      return reply.status(400).send({ error: 'Не можна від\'язати Google — немає пароля для входу' })
    }
    await fastify.prisma.user.update({ where: { id: request.user.sub }, data: { googleId: null } })
    return { ok: true }
  })

  // POST /api/auth/google — verify Google Identity token, create or find user
  fastify.post('/google', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const { credential } = googleCredentialSchema.parse(request.body)

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) return reply.status(500).send({ error: 'Google auth not configured' })

    let tokenPayload: Awaited<ReturnType<typeof verifyGoogleToken>>
    try {
      tokenPayload = await verifyGoogleToken(credential, clientId)
    } catch {
      return reply.status(401).send({ error: 'Invalid Google token' })
    }

    const googleId = tokenPayload.sub!
    const email = tokenPayload.email!
    const name = (tokenPayload.name ?? '').trim().slice(0, 200) || 'User'

    let user = await fastify.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email: { equals: email, mode: 'insensitive' } }] },
    })

    if (user) {
      // Link googleId if user registered via email before
      if (!user.googleId) {
        user = await fastify.prisma.user.update({ where: { id: user.id }, data: { googleId } })
      }
    } else {
      user = await fastify.prisma.user.create({
        data: { email, name, googleId },
      })
    }

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email, user.role)
    setRefreshCookie(reply, refreshToken)
    return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })
}
