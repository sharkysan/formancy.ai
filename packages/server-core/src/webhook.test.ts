import { describe, expect, test } from 'vitest'
import {
  EVENT_ID_HEADER,
  MAX_ATTEMPTS,
  SIGNATURE_HEADER,
  deliveryHeaders,
  retryDelayMs,
  signBody,
  verifySignature,
} from './webhook.js'

const SECRET = 'whsec_a_secret_a_receiver_also_holds'
const BODY = '{"id":"sub_1","data":{"email":"ada@example.ch"}}'
const NOW = 1_764_000_000

describe('signing', () => {
  test('a receiver holding the secret can verify what we send', () => {
    const header = `t=${String(NOW)},v1=${signBody(SECRET, NOW, BODY)}`

    expect(verifySignature({ secret: SECRET, body: BODY, header, nowSeconds: NOW })).toBe(true)
  })

  test('a changed body fails', () => {
    const header = `t=${String(NOW)},v1=${signBody(SECRET, NOW, BODY)}`

    expect(
      verifySignature({ secret: SECRET, body: `${BODY} `, header, nowSeconds: NOW }),
    ).toBe(false)
  })

  test('the wrong secret fails', () => {
    const header = `t=${String(NOW)},v1=${signBody('whsec_someone_elses', NOW, BODY)}`

    expect(verifySignature({ secret: SECRET, body: BODY, header, nowSeconds: NOW })).toBe(false)
  })

  test('the timestamp is inside the signature, so it cannot be edited', () => {
    const header = `t=${String(NOW)},v1=${signBody(SECRET, NOW, BODY)}`
    // Move the timestamp forward to defeat a replay window; the signature no
    // longer matches, because it was taken over `timestamp.body`.
    const forged = header.replace(String(NOW), String(NOW + 10))

    expect(verifySignature({ secret: SECRET, body: BODY, header: forged, nowSeconds: NOW + 10 })).toBe(
      false,
    )
  })

  test('an old signature is refused even though it is genuine', () => {
    const header = `t=${String(NOW - 3600)},v1=${signBody(SECRET, NOW - 3600, BODY)}`

    // Genuine but captured an hour ago. Without the window it would be
    // replayable forever.
    expect(verifySignature({ secret: SECRET, body: BODY, header, nowSeconds: NOW })).toBe(false)
    expect(
      verifySignature({ secret: SECRET, body: BODY, header, nowSeconds: NOW, toleranceSeconds: 7200 }),
    ).toBe(true)
  })

  test('a malformed header is refused rather than throwing', () => {
    for (const header of ['', 'garbage', 't=notanumber,v1=abc', 'v1=abc']) {
      expect(
        verifySignature({ secret: SECRET, body: BODY, header, nowSeconds: NOW }),
        header,
      ).toBe(false)
    }
  })
})

describe('delivery headers', () => {
  test('the event id is stable across retries, which is what lets a receiver dedupe', () => {
    const first = deliveryHeaders({ eventId: 'ev_1', secret: SECRET, body: BODY, timestampSeconds: NOW, attempt: 1 })
    const retry = deliveryHeaders({ eventId: 'ev_1', secret: SECRET, body: BODY, timestampSeconds: NOW, attempt: 4 })

    // A fresh id per attempt would turn our retry into their duplicate.
    expect(retry[EVENT_ID_HEADER]).toBe(first[EVENT_ID_HEADER])
    expect(retry[SIGNATURE_HEADER]).toBe(first[SIGNATURE_HEADER])
  })

  test('the attempt number is sent but not signed', () => {
    const first = deliveryHeaders({ eventId: 'ev_1', secret: SECRET, body: BODY, timestampSeconds: NOW, attempt: 1 })
    const retry = deliveryHeaders({ eventId: 'ev_1', secret: SECRET, body: BODY, timestampSeconds: NOW, attempt: 2 })

    expect(first['x-formancy-attempt']).toBe('1')
    expect(retry['x-formancy-attempt']).toBe('2')
    // If it were signed, a retry could not reuse the signature.
    expect(retry[SIGNATURE_HEADER]).toBe(first[SIGNATURE_HEADER])
  })

  test('what we send verifies with the reference verifier', () => {
    const headers = deliveryHeaders({ eventId: 'ev_1', secret: SECRET, body: BODY, timestampSeconds: NOW, attempt: 1 })

    expect(
      verifySignature({
        secret: SECRET,
        body: BODY,
        header: headers[SIGNATURE_HEADER]!,
        nowSeconds: NOW,
      }),
    ).toBe(true)
  })
})

describe('retry schedule', () => {
  test('backs off, so a struggling receiver is not hammered', () => {
    const noJitter = (): number => 0.999
    const delays = [1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, noJitter))

    expect(delays[1]).toBeGreaterThan(delays[0]!)
    expect(delays[3]).toBeGreaterThan(delays[2]!)
  })

  test('jitters, so every delivery queued by one outage does not retry at once', () => {
    // Full jitter across [0, base): the receiver coming back up meets a spread
    // of retries rather than all of them at the same instant.
    expect(retryDelayMs(3, () => 0)).toBe(0)
    expect(retryDelayMs(3, () => 0.5)).toBeLessThan(retryDelayMs(3, () => 0.99))
  })

  test('is capped, so attempt eight is hours rather than years away', () => {
    expect(retryDelayMs(MAX_ATTEMPTS, () => 0.999)).toBeLessThanOrEqual(6 * 60 * 60 * 1000)
  })
})

describe('interoperability', () => {
  test('the signature is a standard HMAC-SHA256, not something of our own', () => {
    // Computed independently with Node's crypto:
    //   createHmac('sha256', SECRET).update(`${NOW}.${BODY}`).digest('hex')
    //
    // Pinned as a literal so this test does not simply ask our implementation
    // whether it agrees with itself. A receiver using Stripe's documented
    // scheme — signed payload `timestamp.body`, hex HMAC-SHA256 — gets this.
    expect(signBody(SECRET, NOW, BODY)).toBe(
      'c332e0caa944441d2a62d7fb3b30f80e2fc2d315ef6b21f940ab80cf6f7bf0e4',
    )
  })
})
