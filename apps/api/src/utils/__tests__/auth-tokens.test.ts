import { describe, it, expect, vi, beforeEach } from 'vitest'

// env vars are set via vitest.config.ts before module load
import {
  signTokens,
  setRefreshCookie,
  verifyRefreshToken,
  COOKIE_MAX_AGE,
  IS_PROD,
  ACCESS_TOKEN_EXPIRY,
  STRAVA_LOGIN_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from '../auth-tokens.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFastify(signResult = 'signed-token', verifyResult: unknown = { sub: 'u1', email: 'a@b.com', role: 'ATHLETE' }) {
  return {
    jwt: {
      sign: vi.fn().mockReturnValue(signResult),
      verify: vi.fn().mockReturnValue(verifyResult),
    },
  }
}

function makeReply() {
  return { setCookie: vi.fn() }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth-tokens constants', () => {
  it('COOKIE_MAX_AGE equals 7 days in seconds', () => {
    expect(COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 7)
  })

  it('exports correct token expiry strings', () => {
    expect(ACCESS_TOKEN_EXPIRY).toBe('2h')
    expect(STRAVA_LOGIN_TOKEN_EXPIRY).toBe('15m')
    expect(REFRESH_TOKEN_EXPIRY).toBe('7d')
  })

  it('IS_PROD is false in test environment', () => {
    expect(IS_PROD).toBe(false)
  })
})

describe('signTokens', () => {
  it('calls jwt.sign twice — once for access, once for refresh', () => {
    const fastify = makeFastify()
    signTokens(fastify as never, 'user-1', 'user@test.com', 'ATHLETE')

    expect(fastify.jwt.sign).toHaveBeenCalledTimes(2)
  })

  it('returns accessToken and refreshToken', () => {
    const fastify = makeFastify('mock-token')
    const result = signTokens(fastify as never, 'u1', 'u@t.com', 'TRAINER')

    expect(result).toHaveProperty('accessToken', 'mock-token')
    expect(result).toHaveProperty('refreshToken', 'mock-token')
  })

  it('passes sub, email, role in the token payload', () => {
    const fastify = makeFastify()
    signTokens(fastify as never, 'user-42', 'test@mail.com', 'ADMIN')

    const firstCallPayload = fastify.jwt.sign.mock.calls[0][0]
    expect(firstCallPayload).toEqual({ sub: 'user-42', email: 'test@mail.com', role: 'ADMIN' })
  })

  it('uses ACCESS_TOKEN_EXPIRY by default for access token', () => {
    const fastify = makeFastify()
    signTokens(fastify as never, 'u1', 'u@t.com', 'ATHLETE')

    const firstCallOptions = fastify.jwt.sign.mock.calls[0][1]
    expect(firstCallOptions.expiresIn).toBe(ACCESS_TOKEN_EXPIRY)
  })

  it('uses custom expiry when provided (e.g. STRAVA_LOGIN_TOKEN_EXPIRY)', () => {
    const fastify = makeFastify()
    signTokens(fastify as never, 'u1', 'u@t.com', 'ATHLETE', STRAVA_LOGIN_TOKEN_EXPIRY)

    const firstCallOptions = fastify.jwt.sign.mock.calls[0][1]
    expect(firstCallOptions.expiresIn).toBe('15m')
  })

  it('uses REFRESH_TOKEN_EXPIRY for the refresh token', () => {
    const fastify = makeFastify()
    signTokens(fastify as never, 'u1', 'u@t.com', 'ATHLETE')

    const secondCallOptions = fastify.jwt.sign.mock.calls[1][1]
    expect(secondCallOptions.expiresIn).toBe(REFRESH_TOKEN_EXPIRY)
  })

  it('passes JWT_REFRESH_SECRET for refresh token signing', () => {
    const fastify = makeFastify()
    signTokens(fastify as never, 'u1', 'u@t.com', 'ATHLETE')

    const secondCallOptions = fastify.jwt.sign.mock.calls[1][1]
    expect(secondCallOptions.secret).toBe('test-refresh-secret')
  })
})

describe('setRefreshCookie', () => {
  it('calls reply.setCookie with the correct cookie name', () => {
    const reply = makeReply()
    setRefreshCookie(reply as never, 'my-refresh-token')

    expect(reply.setCookie).toHaveBeenCalledOnce()
    expect(reply.setCookie.mock.calls[0][0]).toBe('refreshToken')
  })

  it('sets the provided token value', () => {
    const reply = makeReply()
    setRefreshCookie(reply as never, 'abc123')

    expect(reply.setCookie.mock.calls[0][1]).toBe('abc123')
  })

  it('uses httpOnly=true', () => {
    const reply = makeReply()
    setRefreshCookie(reply as never, 'token')

    const opts = reply.setCookie.mock.calls[0][2]
    expect(opts.httpOnly).toBe(true)
  })

  it('restricts path to /api/auth/refresh', () => {
    const reply = makeReply()
    setRefreshCookie(reply as never, 'token')

    const opts = reply.setCookie.mock.calls[0][2]
    expect(opts.path).toBe('/api/auth/refresh')
  })

  it('sets maxAge to COOKIE_MAX_AGE', () => {
    const reply = makeReply()
    setRefreshCookie(reply as never, 'token')

    const opts = reply.setCookie.mock.calls[0][2]
    expect(opts.maxAge).toBe(COOKIE_MAX_AGE)
  })

  it('uses sameSite=lax and secure=false in non-production', () => {
    const reply = makeReply()
    setRefreshCookie(reply as never, 'token')

    const opts = reply.setCookie.mock.calls[0][2]
    expect(opts.sameSite).toBe('lax')
    expect(opts.secure).toBe(false)
  })
})

describe('verifyRefreshToken', () => {
  it('returns decoded payload from jwt.verify', () => {
    const payload = { sub: 'u-99', email: 'x@y.com', role: 'TRAINER' }
    const fastify = makeFastify('', payload)

    const result = verifyRefreshToken(fastify as never, 'some-token')

    expect(result).toEqual(payload)
  })

  it('passes JWT_REFRESH_SECRET to verify', () => {
    const fastify = makeFastify()
    verifyRefreshToken(fastify as never, 'some-token')

    const verifyOptions = fastify.jwt.verify.mock.calls[0][1]
    expect(verifyOptions.secret).toBe('test-refresh-secret')
  })

  it('propagates errors thrown by jwt.verify (e.g. expired token)', () => {
    const fastify = {
      jwt: { sign: vi.fn(), verify: vi.fn().mockImplementation(() => { throw new Error('jwt expired') }) },
    }

    expect(() => verifyRefreshToken(fastify as never, 'bad-token')).toThrow('jwt expired')
  })
})
