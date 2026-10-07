import { createHmac, timingSafeEqual } from 'crypto'

/**
 * HMAC signing shared with the WordPress bridge (tsclub.com.ua ↔ plans).
 *
 * signature = hex(HMAC-SHA256(secret, `${timestamp}.${payload}`))
 * payload   = raw request body for POSTs, raw query string (no "?") for GETs.
 */

export const WP_BRIDGE_TIMESTAMP_HEADER = 'x-tsclub-timestamp'
export const WP_BRIDGE_SIGNATURE_HEADER = 'x-tsclub-signature'
export const WP_BRIDGE_MAX_SKEW_SEC = 300

export function signWpBridgePayload(secret: string, timestamp: number, payload: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
}

export interface VerifyWpBridgeInput {
  secret: string
  timestamp: string | undefined
  signature: string | undefined
  payload: string
  nowSec?: number
}

export function verifyWpBridgeSignature({
  secret,
  timestamp,
  signature,
  payload,
  nowSec = Math.floor(Date.now() / 1000),
}: VerifyWpBridgeInput): boolean {
  if (!secret || !timestamp || !signature) return false
  if (!/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return false

  const ts = Number(timestamp)
  if (Math.abs(nowSec - ts) > WP_BRIDGE_MAX_SKEW_SEC) return false

  const expected = signWpBridgePayload(secret, ts, payload)
  return timingSafeEqual(Buffer.from(signature.toLowerCase(), 'hex'), Buffer.from(expected, 'hex'))
}

/** Headers for a request plans → WP (reconciliation pull). */
export function wpBridgeHeaders(secret: string, payload: string, nowSec = Math.floor(Date.now() / 1000)) {
  return {
    'X-TSClub-Timestamp': String(nowSec),
    'X-TSClub-Signature': signWpBridgePayload(secret, nowSec, payload),
  }
}
