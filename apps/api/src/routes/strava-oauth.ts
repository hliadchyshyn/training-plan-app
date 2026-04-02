import type { FastifyInstance } from 'fastify'
import axios from 'axios'
import { signTokens, setRefreshCookie, STRAVA_LOGIN_TOKEN_EXPIRY } from '../utils/auth-tokens.js'
import { syncActivities } from '../utils/strava.js'
import { matchActivities } from '../utils/stravaMatch.js'

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

interface StravaAthleteResponse {
  id: number
  firstname: string | null
  lastname: string | null
  email?: string
}

interface StravaOAuthTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete: StravaAthleteResponse
}

function buildAthleteName(athlete: StravaAthleteResponse): string {
  const first = (athlete.firstname ?? '').trim()
  const last = (athlete.lastname ?? '').trim()
  return [first, last].filter(Boolean).join(' ') || 'Strava User'
}

export async function stravaOAuthRoutes(fastify: FastifyInstance) {
  // GET /api/strava/login-url — Strava OAuth URL for unauthenticated users (login/register)
  fastify.get('/login-url', async () => {
    const redirectUri = process.env.STRAVA_LOGIN_REDIRECT_URI
      ?? `${process.env.API_BASE_URL ?? ''}/api/strava/login-callback`

    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all',
      state: 'login',
    })

    return { url: `${STRAVA_AUTH_URL}?${params.toString()}` }
  })

  // GET /api/strava/auth-url — returns Strava OAuth URL (called via axios, handles token refresh)
  fastify.get('/auth-url', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const redirectUri = process.env.STRAVA_REDIRECT_URI ?? `${process.env.API_BASE_URL ?? ''}/api/strava/callback`

    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'force',
      scope: 'activity:read_all',
      state: userId,
    })

    return { url: `${STRAVA_AUTH_URL}?${params.toString()}` }
  })

  // GET /api/strava/login-callback — Strava OAuth callback for login (no auth required)
  fastify.get('/login-callback', async (request, reply) => {
    const { code, error } = request.query as Record<string, string>
    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:5173'

    if (error || !code) {
      return reply.redirect(`${frontendBase}/login?error=strava_denied`)
    }

    try {
      const tokenResp = await axios.post<StravaOAuthTokenResponse>(STRAVA_TOKEN_URL, {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      })

      const { access_token, refresh_token, expires_at, athlete } = tokenResp.data

      let user = await fastify.prisma.user.findFirst({
        where: { stravaAccount: { stravaAthleteId: BigInt(athlete.id) } },
      })

      if (!user) {
        const email = athlete.email ?? `strava_${athlete.id}@strava.local`
        const existing = await fastify.prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        })
        user = existing ?? await fastify.prisma.user.create({
          data: { email, name: buildAthleteName(athlete) },
        })
      }

      await fastify.prisma.stravaAccount.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          stravaAthleteId: BigInt(athlete.id),
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
          scope: 'activity:read_all',
        },
        update: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
        },
      })

      const { accessToken, refreshToken } = signTokens(
        fastify, user.id, user.email, user.role, STRAVA_LOGIN_TOKEN_EXPIRY,
      )
      setRefreshCookie(reply, refreshToken)

      return reply.redirect(`${frontendBase}/strava/login-callback?token=${accessToken}`)
    } catch (err) {
      fastify.log.error({ err }, 'Strava login-callback failed')
      return reply.redirect(`${frontendBase}/login?error=strava_failed`)
    }
  })

  // GET /api/strava/callback — OAuth callback (for authenticated users connecting Strava)
  fastify.get('/callback', async (request, reply) => {
    const { code, state: userId, error } = request.query as Record<string, string>
    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:5173'

    if (error || !code || !userId) {
      return reply.redirect(`${frontendBase}/strava/connected?error=access_denied`)
    }

    try {
      const tokenResp = await axios.post<StravaOAuthTokenResponse>(STRAVA_TOKEN_URL, {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      })

      const { access_token, refresh_token, expires_at, athlete } = tokenResp.data

      await fastify.prisma.stravaAccount.upsert({
        where: { userId },
        create: {
          userId,
          stravaAthleteId: BigInt(athlete.id),
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
        },
        update: {
          stravaAthleteId: BigInt(athlete.id),
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
        },
      })

      syncActivities(userId, fastify.prisma, 8)
        .then(() => matchActivities(userId, fastify.prisma))
        .catch((err: unknown) => fastify.log.error({ err, userId }, 'Background Strava sync failed after connect'))

      return reply.redirect(`${frontendBase}/strava/connected`)
    } catch (err) {
      fastify.log.error({ err }, 'Strava callback token exchange failed')
      return reply.redirect(`${frontendBase}/strava/connected?error=token_exchange`)
    }
  })

  // POST /api/strava/login-exchange — exchange Strava code for JWT (frontend-handled OAuth)
  fastify.post('/login-exchange', async (request, reply) => {
    const { code } = request.body as { code?: string }
    if (!code) return reply.status(400).send({ error: 'Missing code' })

    let tokenResp: Awaited<ReturnType<typeof axios.post<StravaOAuthTokenResponse>>>
    try {
      tokenResp = await axios.post<StravaOAuthTokenResponse>(STRAVA_TOKEN_URL, {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      })
    } catch (err) {
      fastify.log.error({ err }, 'Strava login-exchange code exchange failed')
      return reply.status(400).send({ error: 'Strava code exchange failed. Code may be expired.' })
    }

    const { access_token, refresh_token, expires_at, athlete } = tokenResp.data

    let user = await fastify.prisma.user.findFirst({
      where: { stravaAccount: { stravaAthleteId: BigInt(athlete.id) } },
    })

    let isNewUser = false
    if (!user) {
      const email = athlete.email ?? `strava_${athlete.id}@strava.local`
      const existing = await fastify.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      })
      user = existing ?? await fastify.prisma.user.create({
        data: { email, name: buildAthleteName(athlete) },
      })
      isNewUser = !existing
    }

    await fastify.prisma.stravaAccount.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        stravaAthleteId: BigInt(athlete.id),
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(expires_at * 1000),
        scope: 'activity:read_all',
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(expires_at * 1000),
      },
    })

    const { accessToken, refreshToken } = signTokens(
      fastify, user.id, user.email, user.role, STRAVA_LOGIN_TOKEN_EXPIRY,
    )
    setRefreshCookie(reply, refreshToken)

    return { accessToken, isNewUser, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  // POST /api/strava/link — link Strava to authenticated user (frontend-handled OAuth)
  fastify.post('/link', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const { code } = request.body as { code?: string }
    if (!code) throw new Error('Missing code')

    let tokenResp: Awaited<ReturnType<typeof axios.post<StravaOAuthTokenResponse>>>
    try {
      tokenResp = await axios.post<StravaOAuthTokenResponse>(STRAVA_TOKEN_URL, {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      })
    } catch (err) {
      fastify.log.error({ err, userId }, 'Strava link code exchange failed')
      throw Object.assign(new Error('Strava code exchange failed'), { statusCode: 400 })
    }

    const { access_token, refresh_token, expires_at, athlete } = tokenResp.data

    await fastify.prisma.stravaAccount.upsert({
      where: { userId },
      create: {
        userId,
        stravaAthleteId: BigInt(athlete.id),
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(expires_at * 1000),
      },
      update: {
        stravaAthleteId: BigInt(athlete.id),
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(expires_at * 1000),
      },
    })

    syncActivities(userId, fastify.prisma, 8)
      .then(() => matchActivities(userId, fastify.prisma))
      .catch((err: unknown) => fastify.log.error({ err, userId }, 'Background Strava sync failed after link'))

    return { ok: true }
  })

  // DELETE /api/strava/disconnect
  fastify.delete('/disconnect', { preHandler: fastify.requireRole(['ATHLETE', 'TRAINER', 'ADMIN']) }, async (request) => {
    const userId = request.user.sub
    const account = await fastify.prisma.stravaAccount.findUnique({ where: { userId } })
    if (account) {
      await axios.post('https://www.strava.com/oauth/deauthorize', null, {
        params: { access_token: account.accessToken },
      }).catch((err: unknown) => fastify.log.warn({ err, userId }, 'Strava deauthorize request failed (may already be revoked)'))
      await fastify.prisma.stravaAccount.delete({ where: { userId } })
    }
    return { ok: true }
  })
}
