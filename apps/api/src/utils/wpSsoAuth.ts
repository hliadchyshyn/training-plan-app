import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { signTokens, setRefreshCookie, verifyWpSsoCookie, IS_PROD } from './auth-tokens.js'

export type WpSsoRefreshResult =
  | { status: 'not-applicable' }
  | { status: 'invalid' }
  | { status: 'success'; accessToken: string }

/**
 * Auto-login fallback for POST /refresh: exchanges the shared wp_sso cookie set by
 * WordPress for a session, used when there's no refreshToken cookie to fall back on.
 * Upserts the user (WP is the identity source of truth for these accounts), signs a
 * fresh session, and clears the one-time wp_sso cookie once it's been consumed.
 */
export async function attemptWpSsoRefresh(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<WpSsoRefreshResult> {
  const wpSsoSecret = process.env.WP_SSO_SECRET
  const wpSsoCookie = request.cookies.wp_sso
  if (!wpSsoSecret || !wpSsoCookie) return { status: 'not-applicable' }

  const parsed = verifyWpSsoCookie(wpSsoCookie, wpSsoSecret)
  if (!parsed) return { status: 'invalid' }

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

  return { status: 'success', accessToken }
}
