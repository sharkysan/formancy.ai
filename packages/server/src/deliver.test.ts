import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
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

/**
 * Against a real socket.
 *
 * Everything above stops before a connection is opened, which left the half of
 * this module that actually delivers untested — and that is exactly the half
 * where the two bugs were. Neither could be caught without a socket: the Agent
 * has to come from the same undici instance as the fetch that uses it, and
 * undici calls the connect lookup with `{ all: true }` and wants an array of
 * `{ address, family }` back, not node:net's `(err, address, family)`. Both
 * fail only at connect time.
 *
 * A loopback server, so the escape hatches are on. They are what this
 * exercises as much as the delivery is.
 */
describe('delivering to something that answers', () => {
  let server: import('node:http').Server
  let port: number
  let received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }>
  let reply: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void

  const local = { allowHttp: true, allowPrivateAddresses: true, timeoutMs: 2000 }

  beforeAll(async () => {
    const { createServer } = await import('node:http')
    server = createServer((request, response) => {
      let body = ''
      request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
      request.on('end', () => {
        received.push({ headers: request.headers, body })
        reply(request, response)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  beforeEach(() => {
    received = []
    reply = (_request, response) => response.writeHead(204).end()
  })

  const to = (path = '/hook') => ({ ...BASE, url: `http://127.0.0.1:${String(port)}${path}` })

  test('a 2xx is a delivery', async () => {
    const result = await deliver(to(), local)

    expect(result).toEqual({ ok: true, status: 204 })
  })

  test('the receiver gets the signature, the event id and the attempt', async () => {
    await deliver(to(), local)

    const headers = received[0]?.headers ?? {}
    expect(headers['x-formancy-signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(headers['x-formancy-event-id']).toBe('ev_1')
    expect(headers['x-formancy-attempt']).toBe('1')
    expect(received[0]?.body).toBe(BASE.body)
  })

  test('a 5xx is a failure that says what it was, without the body', async () => {
    reply = (_request, response) => response.writeHead(503).end('the database is on fire')

    const result = await deliver(to(), local)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(503)
    // A receiver's body is not ours to repeat into an operator's action log.
    expect(result.error).not.toContain('fire')
  })

  test('a redirect is refused rather than followed', async () => {
    // A redirect is a second destination nothing has checked. Following one
    // would hand the whole address guard back to whoever wrote the URL.
    reply = (_request, response) => response.writeHead(302, { location: 'http://169.254.169.254/' }).end()

    const result = await deliver(to(), local)

    expect(result).toEqual({ ok: false, status: 302, error: 'Redirects are not followed.' })
  })

  test('a response larger than the cap is read to the cap and stopped', async () => {
    reply = (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      // Well past the 64 kB cap. An unbounded read is a memory exhaustion the
      // receiver controls.
      response.end('x'.repeat(256 * 1024))
    }

    const result = await deliver(to(), local)

    expect(result).toEqual({ ok: true, status: 200 })
  })

  test('a receiver that never answers times out rather than hanging the worker', async () => {
    reply = () => undefined

    const result = await deliver(to(), { ...local, timeoutMs: 150 })

    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  test('nothing listening is a failed delivery carrying the cause', async () => {
    const result = await deliver(
      { ...BASE, url: 'http://127.0.0.1:1/hook' },
      { ...local, timeoutMs: 500 },
    )

    expect(result.ok).toBe(false)
    // `fetch failed` on its own tells an operator nothing.
    expect(result.error).toMatch(/ECONNREFUSED|fetch failed/)
  })
})
