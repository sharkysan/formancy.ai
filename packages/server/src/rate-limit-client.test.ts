import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createMemoryStorage } from '@formancy/server-core'
import { createApp, SCHEMA_HASH_HEADER } from './app.js'

/**
 * Who a public rate limit counts.
 *
 * Every limit on the public plane is keyed by the client's address, and the
 * deployment view draws a reverse proxy in front of the server. Behind one, the
 * address on the socket is the proxy's for every request, so a server that
 * believes only the socket gives the whole internet one budget: thirty
 * submissions a minute between everybody, and the thirty-first respondent is
 * refused for something nobody did.
 *
 * The other direction is the one that makes this a security setting rather than
 * a convenience. `X-Forwarded-For` is a header, and anybody can send one. Believe
 * it from somebody who is not the proxy and every request can name a new
 * address, which is no limit at all.
 *
 * In memory rather than against Postgres: what is under test is who the HTTP
 * layer thinks the client is, and the form these requests ask for not existing
 * is what makes an admitted request answer 404.
 */
const PROXY = '10.0.0.2'

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

async function serve(trustProxy?: string[]): Promise<FastifyInstance> {
  app = await createApp(createMemoryStorage(), {
    authSecret: 'a-test-secret-that-is-long-enough-to-sign',
    submissionRateLimit: { max: 1, timeWindowMs: 60_000 },
    ...(trustProxy === undefined ? {} : { trustProxy }),
  })
  return app
}

/** One submission attempt that reached the server from `via`, carrying `forwardedFor`. */
async function submit(server: FastifyInstance, forwardedFor: string, via = PROXY): Promise<number> {
  const response = await server.inject({
    method: 'POST',
    url: '/f/contact-us/submissions',
    remoteAddress: via,
    headers: { [SCHEMA_HASH_HEADER]: 'whatever', 'x-forwarded-for': forwardedFor },
    payload: {},
  })
  return response.statusCode
}

describe('the client a public rate limit counts', () => {
  test('is the respondent the trusted proxy names, so two behind it are counted apart', async () => {
    // The defect: behind the proxy, the second respondent was refused because
    // the first had used the budget they shared.
    const server = await serve([PROXY])

    expect(await submit(server, '203.0.113.1')).toBe(404)
    expect(await submit(server, '203.0.113.2')).toBe(404)
    // And each still has a limit: separating respondents must not turn it off.
    expect(await submit(server, '203.0.113.1')).toBe(429)
  })

  test('is the socket when nothing is trusted, so everyone behind one address shares a budget', async () => {
    // The default, kept: with no proxy named, a forwarded address is a claim the
    // client makes about itself, and believing it would let every request pick
    // a fresh budget.
    const server = await serve()

    expect(await submit(server, '203.0.113.1')).toBe(404)
    expect(await submit(server, '203.0.113.2')).toBe(429)
  })

  test('is the socket for a client that reaches the server around the proxy', async () => {
    // Trusting the proxy is not trusting the header. A client connecting
    // directly — a published port the proxy was meant to front — that writes
    // its own X-Forwarded-For must not be able to choose a new address per
    // request.
    const server = await serve([PROXY])
    const direct = '198.51.100.9'

    expect(await submit(server, '203.0.113.1', direct)).toBe(404)
    expect(await submit(server, '203.0.113.2', direct)).toBe(429)
  })

  test('is whatever a client at the gateway writes, once a named range holds the gateway', async () => {
    // Why the self-hosting guide names the proxy's own address and never its
    // compose network's range (0156). Docker hands a connection to a published
    // port over from the network's gateway — measured from the machine itself
    // and from containers on other networks — and the range holds the gateway,
    // so each of those is believed about who it is. The same client, with only
    // the proxy's address named, is counted by the gateway it arrived from.
    const gateway = '172.30.0.1'
    const range = await serve(['172.30.0.0/24'])
    expect(await submit(range, '203.0.113.1', gateway)).toBe(404)
    expect(await submit(range, '203.0.113.2', gateway)).toBe(404)
    expect(await submit(range, '203.0.113.3', gateway)).toBe(404)
    await range.close()

    const pinned = await serve(['172.30.0.10'])
    expect(await submit(pinned, '203.0.113.1', gateway)).toBe(404)
    expect(await submit(pinned, '203.0.113.2', gateway)).toBe(429)
  })

  test('is what the proxy saw, not what the client wrote before it', async () => {
    // A proxy appends the address it saw to whatever X-Forwarded-For the client
    // sent. Only the last entry is the proxy's word; the ones before it are the
    // client's, and varying them must not buy a fresh budget.
    const server = await serve([PROXY])

    expect(await submit(server, '198.51.100.1, 203.0.113.1')).toBe(404)
    expect(await submit(server, '198.51.100.2, 203.0.113.1')).toBe(429)
  })
})
