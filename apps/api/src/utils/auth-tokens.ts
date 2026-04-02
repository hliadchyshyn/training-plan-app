import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Role } from '@training-plan/shared'

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
if (!REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET environment variable is required')

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
export const IS_PROD = process.env.NODE_ENV === 'production'
export const ACCESS_TOKEN_EXPIRY = '2h'
export const STRAVA_LOGIN_TOKEN_EXPIRY = '15m'
export const REFRESH_TOKEN_EXPIRY = '7d'

export function signTokens(
  fastify: FastifyInstance,
  sub: string,
  email: string,
  role: Role,
  accessTokenExpiry = ACCESS_TOKEN_EXPIRY,
) {
  const payload = { sub, email, role }
  const accessToken = fastify.jwt.sign(payload, { expiresIn: accessTokenExpiry })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = fastify.jwt.sign(payload, { secret: REFRESH_SECRET, expiresIn: REFRESH_TOKEN_EXPIRY } as any)
  return { accessToken, refreshToken }
}

export function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie('refreshToken', token, {
    httpOnly: true,
    path: '/api/auth/refresh',
    maxAge: COOKIE_MAX_AGE,
    sameSite: IS_PROD ? 'none' : 'lax',
    secure: IS_PROD,
  })
}

export function verifyRefreshToken(
  fastify: FastifyInstance,
  token: string,
): { sub: string; email: string; role: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fastify.jwt.verify(token, { secret: REFRESH_SECRET } as any) as { sub: string; email: string; role: string }
}
