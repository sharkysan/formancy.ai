import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * What a webhook delivery looks like on the wire.
 *
 * The signature scheme is Stripe's, deliberately: receivers already have code
 * for it, and a scheme somebody has to implement from scratch is a scheme most
 * receivers will skip. Adopting a familiar one is the difference between a
 * verified webhook and a verified-in-principle one.
 */

export const EVENT_ID_HEADER = 'x-formancy-event-id'
export const SIGNATURE_HEADER = 'x-formancy-signature'

export interface DeliveryHeaders {
  [header: string]: string
}

/**
 * The signed payload is `timestamp.body`, not `body`.
 *
 * Without the timestamp inside the signature, a signature captured once stays
 * valid forever and can be replayed. With it, a receiver can reject anything
 * older than its tolerance, and the signature covers the timestamp it is
 * checking — so the timestamp cannot be edited either.
 */
export function signedPayload(timestampSeconds: number, body: string): string {
  return `${String(timestampSeconds)}.${body}`
}

/** Hex HMAC-SHA256 over the signed payload. */
export function signBody(secret: string, timestampSeconds: number, body: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(signedPayload(timestampSeconds, body))))
}

/**
 * The headers for one delivery attempt.
 *
 * The event id is stable across retries, which is what makes the receiver able
 * to be idempotent. Generating a fresh one per attempt would turn our retry
 * into their duplicate.
 */
export function deliveryHeaders(input: {
  eventId: string
  secret: string
  body: string
  timestampSeconds: number
  attempt: number
}): DeliveryHeaders {
  return {
    'content-type': 'application/json',
    [EVENT_ID_HEADER]: input.eventId,
    [SIGNATURE_HEADER]: `t=${String(input.timestampSeconds)},v1=${signBody(input.secret, input.timestampSeconds, input.body)}`,
    // Useful in a receiver's logs, and never part of the signature: a retry
    // must produce the same signature as the first attempt.
    'x-formancy-attempt': String(input.attempt),
  }
}

/**
 * Verify a delivery the way a receiver would.
 *
 * Exported because a scheme nobody can check is a scheme nobody does check —
 * this is the reference implementation, and the test for our own signing.
 */
export function verifySignature(input: {
  secret: string
  body: string
  header: string
  nowSeconds: number
  toleranceSeconds?: number
}): boolean {
  const parts = new Map(
    input.header.split(',').map((part) => {
      const at = part.indexOf('=')
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const
    }),
  )

  const timestamp = Number(parts.get('t'))
  const provided = parts.get('v1')
  if (!Number.isFinite(timestamp) || provided === undefined) return false

  const tolerance = input.toleranceSeconds ?? 300
  if (Math.abs(input.nowSeconds - timestamp) > tolerance) return false

  const expected = signBody(input.secret, timestamp, input.body)
  return timingSafeEqual(expected, provided)
}

/**
 * Compare without leaking where the first difference is.
 *
 * `a === b` on a hex string returns as soon as two characters differ, and the
 * time it takes says how many leading characters were right — enough, over
 * many attempts, to recover a signature a byte at a time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return difference === 0
}

/**
 * How long to wait before attempt n, in milliseconds.
 *
 * Exponential, capped, with jitter. The jitter is the part that matters at
 * scale: without it every delivery queued by the same outage retries at the
 * same instant, and the receiver coming back up is knocked over by the
 * thundering herd of everyone's retries.
 */
export function retryDelayMs(attempt: number, random: () => number): number {
  const base = Math.min(30_000 * 2 ** (attempt - 1), 6 * 60 * 60 * 1000)
  // Full jitter: anywhere in [0, base). Better than base±10% precisely because
  // it spreads the herd across the whole window.
  return Math.floor(base * random())
}

/** Eight attempts reach roughly 24 hours with this schedule. */
export const MAX_ATTEMPTS = 8
