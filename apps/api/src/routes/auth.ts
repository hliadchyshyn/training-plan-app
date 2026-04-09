import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { OAuth2Client } from 'google-auth-library'
import type { Role } from '@training-plan/shared'
import { signTokens, setRefreshCookie, verifyRefreshToken, verifyWpSsoCookie, IS_PROD } from '../utils/auth-tokens.js'
import { BCRYPT_ROUNDS, INVITE_CODE_CHARS, INVITE_CODE_LENGTH, INVITE_CODE_MAX_RETRIES } from '../utils/constants.js'

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

async function verifyGoogleToken(credential: string, clientId: string) {
  const client = new OAuth2Client(clientId)
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
  const payload = ticket.getPayload()
  if (!payload) throw new Error('Empty token payload')
  if (!payload.email_verified) throw new Error('Email not verified')
  return payload
}

async function generateInviteCode(
  findUnique: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < INVITE_CODE_MAX_RETRIES; attempt++) {
    const code = Array.from(
      { length: INVITE_CODE_LENGTH },
      () => INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)],
    ).join('')
    if (!(await findUnique(code))) return code
  }
  throw new Error('Failed to generate unique invite code')
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
    } else if (body.role === 'ATHLETE' && process.env.DEFAULT_TRAINER_ID) {
      trainerId = process.env.DEFAULT_TRAINER_ID
    }

    // Generate unique invite code for trainers
    let inviteCode: string | undefined
    if (body.role === 'TRAINER') {
      inviteCode = await generateInviteCode(
        async (code) => !!(await fastify.prisma.user.findUnique({ where: { inviteCode: code } })),
      )
    }

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
    const user = await fastify.prisma.user.create({
      data: { email, name: body.name, passwordHash, role: body.role, inviteCode, trainerId },
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

    if (token) {
      let payload: { sub: string; email: string; role: string }
      try {
        payload = verifyRefreshToken(fastify, token)
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
    }

    // WP SSO fallback: auto-login via shared cookie set by WordPress
    const wpSsoSecret = process.env.WP_SSO_SECRET
    const wpSsoCookie = request.cookies.wp_sso
    if (wpSsoSecret && wpSsoCookie) {
      const parsed = verifyWpSsoCookie(wpSsoCookie, wpSsoSecret)
      if (!parsed) return reply.status(401).send({ error: 'Invalid WP SSO token' })

      const email = parsed.email.toLowerCase()
      const defaultTrainerId = process.env.DEFAULT_TRAINER_ID
      const user = await fastify.prisma.user.upsert({
        where: { email },
        create: {
          email,
          name: parsed.name,
          role: 'ATHLETE',
          ...(defaultTrainerId ? { trainerId: defaultTrainerId } : {}),
        },
        update: {},
      })

      const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email, user.role)
      setRefreshCookie(reply, refreshToken)
      reply.clearCookie('wp_sso', {
        path: '/',
        domain: IS_PROD ? '.tsclub.com.ua' : undefined,
        secure: IS_PROD,
        sameSite: 'lax',
      })
      return { accessToken }
    }

    return reply.status(401).send({ error: 'No refresh token' })
  })

  fastify.put('/password', { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    const userId = request.user.sub

    const user = await fastify.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    if (!user.passwordHash) return reply.status(400).send({ error: 'OAuth account has no password' })
    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash)
    if (!valid) return reply.status(400).send({ error: 'Невірний поточний пароль' })

    const passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS)
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
    const code = await generateInviteCode(
      async (candidate) => !!(await fastify.prisma.user.findUnique({ where: { inviteCode: candidate } })),
    )
    await fastify.prisma.user.update({ where: { id: request.user.sub }, data: { inviteCode: code } })
    return { inviteCode: code }
  })

  // POST /api/auth/wp-migrate — bulk-create WP users (server-to-server, guarded by shared secret)
  fastify.post('/wp-migrate', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const secret = process.env.WP_SSO_SECRET
    if (!secret) return reply.status(503).send({ error: 'WP SSO not configured' })
    if (request.headers['x-wp-sso-secret'] !== secret) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const body = z.object({
      users: z.array(z.object({ email: z.string().email(), name: z.string().min(1) })).min(1).max(1000),
      dryRun: z.boolean().default(false),
    }).parse(request.body)

    const normalized = body.users.map(u => ({ email: u.email.toLowerCase(), name: u.name }))

    if (body.dryRun) {
      const existing = await fastify.prisma.user.findMany({
        where: { email: { in: normalized.map(u => u.email) } },
        select: { email: true },
      })
      const existingSet = new Set(existing.map(u => u.email))
      const wouldCreate = normalized.filter(u => !existingSet.has(u.email)).length
      return { created: wouldCreate, existed: normalized.length - wouldCreate, failed: 0, dryRun: true }
    }

    const result = await fastify.prisma.user.createMany({
      data: normalized,
      skipDuplicates: true,
    })
    return { created: result.count, existed: normalized.length - result.count, failed: 0 }
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

    let isNewUser = false
    if (user) {
      if (!user.googleId) {
        user = await fastify.prisma.user.update({ where: { id: user.id }, data: { googleId } })
      }
    } else {
      user = await fastify.prisma.user.create({
        data: { email, name, googleId },
      })
      isNewUser = true
    }

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email, user.role)
    setRefreshCookie(reply, refreshToken)
    return { accessToken, isNewUser, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  // POST /api/auth/onboarding — set role and optional trainer invite code after OAuth registration
  fastify.post('/onboarding', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request, reply) => {
    const { role, inviteCode } = request.body as { role: 'ATHLETE' | 'TRAINER'; inviteCode?: string }
    const userId = request.user.sub

    let trainerId: string | undefined
    if (role === 'ATHLETE' && inviteCode) {
      const trainer = await fastify.prisma.user.findUnique({ where: { inviteCode: inviteCode.toUpperCase() } })
      if (!trainer || trainer.role !== 'TRAINER') {
        return reply.status(400).send({ error: 'Невірний код тренера' })
      }
      trainerId = trainer.id
    }

    let newInviteCode: string | undefined
    if (role === 'TRAINER') {
      newInviteCode = await generateInviteCode(
        async (code) => !!(await fastify.prisma.user.findUnique({ where: { inviteCode: code } })),
      )
    }

    const user = await fastify.prisma.user.update({
      where: { id: userId },
      data: { role, trainerId: trainerId ?? null, inviteCode: newInviteCode ?? undefined },
    })

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email, user.role as Role)
    setRefreshCookie(reply, refreshToken)
    return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })
}
