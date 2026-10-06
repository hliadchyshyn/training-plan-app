import { createHmac } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attemptWpSsoRefresh } from '../wpSsoAuth.js'

const SECRET = 'wp-sso-test-secret'

function makeWpSsoCookie(email: string, name: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const nameB64 = Buffer.from(name, 'utf8').toString('base64')
  const hmac = createHmac('sha256', secret).update(`${email}:${nameB64}:${timestamp}`).digest('hex')
  return `${email}:${nameB64}:${timestamp}:${hmac}`
}

function makeFastify(userOverrides: Record<string, unknown> = {}) {
  return {
    prisma: {
      user: {
        upsert: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'athlete@example.com',
          role: 'ATHLETE',
          ...userOverrides,
        }),
      },
    },
    jwt: {
      sign: vi.fn().mockReturnValue('signed-token'),
    },
  }
}

function makeRequest(cookies: Record<string, string>) {
  return { cookies }
}

function makeReply() {
  return {
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  }
}

function run(
  fastify: ReturnType<typeof makeFastify>,
  request: ReturnType<typeof makeRequest>,
  reply: ReturnType<typeof makeReply>,
) {
  return attemptWpSsoRefresh(fastify as never, request as never, reply as never)
}

describe('attemptWpSsoRefresh', () => {
  beforeEach(() => {
    delete process.env.WP_SSO_SECRET
    delete process.env.DEFAULT_TRAINER_ID
  })

  it('is not applicable when WP_SSO_SECRET is unset', async () => {
    const result = await run(makeFastify(), makeRequest({}), makeReply())
    expect(result).toEqual({ status: 'not-applicable' })
  })

  it('is not applicable when there is no wp_sso cookie', async () => {
    process.env.WP_SSO_SECRET = SECRET
    const result = await run(makeFastify(), makeRequest({}), makeReply())
    expect(result).toEqual({ status: 'not-applicable' })
  })

  it('rejects a cookie signed with the wrong secret', async () => {
    process.env.WP_SSO_SECRET = SECRET
    const cookie = makeWpSsoCookie('athlete@example.com', 'Athlete', 'wrong-secret')
    const result = await run(makeFastify(), makeRequest({ wp_sso: cookie }), makeReply())
    expect(result).toEqual({ status: 'invalid' })
  })

  it('rejects an expired cookie', async () => {
    process.env.WP_SSO_SECRET = SECRET
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301
    const cookie = makeWpSsoCookie('athlete@example.com', 'Athlete', SECRET, staleTimestamp)
    const result = await run(makeFastify(), makeRequest({ wp_sso: cookie }), makeReply())
    expect(result).toEqual({ status: 'invalid' })
  })

  it('upserts the user, signs a session, and clears the wp_sso cookie on success', async () => {
    process.env.WP_SSO_SECRET = SECRET
    const fastify = makeFastify()
    const reply = makeReply()
    const cookie = makeWpSsoCookie('Athlete@Example.com', 'Athlete Name')

    const result = await run(fastify, makeRequest({ wp_sso: cookie }), reply)

    expect(result).toEqual({ status: 'success', accessToken: 'signed-token' })
    expect(fastify.prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'athlete@example.com' },
      create: expect.objectContaining({ email: 'athlete@example.com', name: 'Athlete Name', role: 'ATHLETE' }),
    }))
    expect(reply.setCookie).toHaveBeenCalledWith('refreshToken', 'signed-token', expect.any(Object))
    expect(reply.clearCookie).toHaveBeenCalledWith('wp_sso', expect.any(Object))
  })

  it('assigns DEFAULT_TRAINER_ID to newly created WP SSO users when configured', async () => {
    process.env.WP_SSO_SECRET = SECRET
    process.env.DEFAULT_TRAINER_ID = 'trainer-1'
    const fastify = makeFastify()
    const cookie = makeWpSsoCookie('athlete@example.com', 'Athlete')

    await run(fastify, makeRequest({ wp_sso: cookie }), makeReply())

    expect(fastify.prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ trainerId: 'trainer-1' }),
    }))
  })
})
