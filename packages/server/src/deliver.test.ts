import { describe, expect, test } from 'vitest'
import { deliver } from './deliver.js'

/**
 * The rebinding cases, which are the reason this code exists at all.
 *
 * Checking a URL and then handing it to `fetch` looks identical to this from
 * the outside and is worth nothing: the two DNS lookups are independent, and
 * an attacker only has to win the second one. These tests use an injected
 * resolver so the behaviour is pinned without the network.
 */
const BASE = {
  body: '{"id":"sub_1"}',
  secret: 'whsec_test',
  eventId: 'ev_1',
  attempt: 1,
  nowSeconds: 1_764_000_000,
}

describe('refusing before a connection is opened', () => {
  test('a name that resolves to loopback', async () => {
    const result = await deliver(
      { ...BASE, url: 'https://totally-legitimate.example/hook' },
      { resolve: async () => ['127.0.0.1'] },
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('127.0.0.1')
  })

  test('a name that resolves to the cloud metadata service', async () => {
    const result = await deliver(
      { ...BASE, url: 'https://example.ch/hook' },
      { resolve: async () => ['169.254.169.254'] },
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('169.254.169.254')
  })

  test('a name that resolves to BOTH a public and a private address', async () => {
    // The rebinding attack spelled out. Validating "the" address and picking
    // the public one, while the stack might use either, is no check at all —
    // so every returned address has to pass.
    const result = await deliver(
      { ...BASE, url: 'https://example.ch/hook' },
      { resolve: async () => ['93.184.216.34', '10.0.0.5'] },
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('10.0.0.5')
  })

  test('an IPv4-mapped private address, which looks public to a naive check', async () => {
    const result = await deliver(
      { ...BASE, url: 'https://example.ch/hook' },
      { resolve: async () => ['::ffff:10.0.0.5'] },
    )

    expect(result.ok).toBe(false)
  })

  test('a name that resolves to nothing', async () => {
    const result = await deliver(
      { ...BASE, url: 'https://example.ch/hook' },
      { resolve: async () => [] },
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('nothing')
  })
})

describe('refusing without resolving at all', () => {
  test('a literal private address', async () => {
    let resolved = false
    const result = await deliver(
      { ...BASE, url: 'https://127.0.0.1/hook' },
      {
        resolve: async () => {
          resolved = true
          return ['93.184.216.34']
        },
      },
    )

    expect(result.ok).toBe(false)
    // Cheap and early: no lookup needed to know this one.
    expect(resolved).toBe(false)
  })

  test('plain http, unless a deployment opts in', async () => {
    expect(
      (await deliver({ ...BASE, url: 'http://example.ch/hook' }, { resolve: async () => ['93.184.216.34'] }))
        .ok,
    ).toBe(false)
  })

  test('a scheme that is not http or https', async () => {
    expect(
      (await deliver({ ...BASE, url: 'file:///etc/passwd' }, { resolve: async () => [] })).ok,
    ).toBe(false)
  })

  test('credentials in the URL', async () => {
    expect(
      (
        await deliver(
          { ...BASE, url: 'https://user:pass@example.ch/hook' },
          { resolve: async () => ['93.184.216.34'] },
        )
      ).ok,
    ).toBe(false)
  })
})

describe('a resolver that fails', () => {
  test('is a failed delivery, not a thrown exception', async () => {
    const result = await deliver(
      { ...BASE, url: 'https://example.ch/hook' },
      {
        resolve: async () => {
          throw new Error('ENOTFOUND')
        },
      },
    )

    // A delivery worker that throws loses the job. A failed result retries.
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ENOTFOUND')
  })
})

/**
 * The escape hatch, and the reason it exists.
 *
 * Without it a receiver running as a sidecar on the same host — the case the
 * design itself names — simply cannot be delivered to, which is a worse
 * outcome than an opt-in nobody has to touch.
 */
describe('allowPrivateAddresses', () => {
  test('is off by default, so the guard is the default', async () => {
    const result = await deliver(
      { ...BASE, url: 'https://sidecar.internal/hook' },
      { resolve: async () => ['10.0.0.5'] },
    )

    expect(result.ok).toBe(false)
  })

  test('turning it on gets past the address check, not past everything', async () => {
    // It reaches the connection attempt and fails there, in a jsdom-free
    // environment with nothing listening — which is exactly as far as this
    // test can see, and proves the refusal was the address check.
    const result = await deliver(
      { ...BASE, url: 'https://127.0.0.1:1/hook' },
      { allowPrivateAddresses: true, resolve: async () => ['127.0.0.1'], timeoutMs: 500 },
    )

    expect(result.ok).toBe(false)
    expect(result.error).not.toContain('not reachable from here')
  })
})
