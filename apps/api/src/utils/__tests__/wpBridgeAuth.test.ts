import { describe, expect, it } from 'vitest'
import { signWpBridgePayload, verifyWpBridgeSignature, wpBridgeHeaders } from '../wpBridgeAuth.js'

const SECRET = 'bridge-secret'
const NOW = 1_800_000_000
const BODY = '{"events":[]}'

function input(overrides: Partial<Parameters<typeof verifyWpBridgeSignature>[0]> = {}) {
  return {
    secret: SECRET,
    timestamp: String(NOW),
    signature: signWpBridgePayload(SECRET, NOW, BODY),
    payload: BODY,
    nowSec: NOW,
    ...overrides,
  }
}

describe('verifyWpBridgeSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyWpBridgeSignature(input())).toBe(true)
  })

  it('accepts an uppercase hex signature', () => {
    expect(verifyWpBridgeSignature(input({ signature: signWpBridgePayload(SECRET, NOW, BODY).toUpperCase() }))).toBe(true)
  })

  it('accepts a timestamp within the allowed skew', () => {
    expect(verifyWpBridgeSignature(input({ nowSec: NOW + 299 }))).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyWpBridgeSignature(input({ payload: '{"events":[1]}' }))).toBe(false)
  })

  it('rejects a wrong secret', () => {
    expect(verifyWpBridgeSignature(input({ secret: 'other' }))).toBe(false)
  })

  it('rejects an expired timestamp (replay)', () => {
    expect(verifyWpBridgeSignature(input({ nowSec: NOW + 301 }))).toBe(false)
  })

  it('rejects a timestamp from the future beyond skew', () => {
    expect(verifyWpBridgeSignature(input({ nowSec: NOW - 301 }))).toBe(false)
  })

  it('rejects missing headers', () => {
    expect(verifyWpBridgeSignature(input({ timestamp: undefined }))).toBe(false)
    expect(verifyWpBridgeSignature(input({ signature: undefined }))).toBe(false)
  })

  it('rejects an empty secret even if signed with it', () => {
    const sig = signWpBridgePayload('', NOW, BODY)
    expect(verifyWpBridgeSignature(input({ secret: '', signature: sig }))).toBe(false)
  })

  it('rejects malformed values without throwing', () => {
    expect(verifyWpBridgeSignature(input({ timestamp: 'abc' }))).toBe(false)
    expect(verifyWpBridgeSignature(input({ signature: 'zz' }))).toBe(false)
  })
})

describe('wpBridgeHeaders', () => {
  it('produces headers that verify', () => {
    const headers = wpBridgeHeaders(SECRET, 'updated_since=x&page=1', NOW)
    expect(
      verifyWpBridgeSignature({
        secret: SECRET,
        timestamp: headers['X-TSClub-Timestamp'],
        signature: headers['X-TSClub-Signature'],
        payload: 'updated_since=x&page=1',
        nowSec: NOW,
      }),
    ).toBe(true)
  })
})
