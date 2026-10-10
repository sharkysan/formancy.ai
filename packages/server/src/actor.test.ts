import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createMemoryStorage } from '@formancy/server-core'
import { API_KEY_HEADER, createApp } from './app.js'

/**
 * Who a request is, as the management plane decides it.
 *
 * CodeQL reports `js/user-controlled-bypass` where `actorOf` looks at whether an API key
 * header is present: a condition the client controls guards an authentication call. The
 * header only chooses WHICH check runs — a bearer token is verified, a key is looked up —
 * and a value that fails its check is no identity at all, so a request that controls the
 * condition gains nothing by it. These cases hold that, on a route that needs an identity,
 * so the alert's reasoning can be checked against something that fails rather than prose.
 */
let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

async function status(headers: Record<string, string>): Promise<number> {
  app ??= await createApp(createMemoryStorage(), {
    authSecret: 'a-test-secret-that-is-long-enough-to-sign',
  })
  const response = await app.inject({ method: 'GET', url: '/forms', headers })
  return response.statusCode
}

describe('a request to the management plane', () => {
  test('with no credential is unauthenticated', async () => {
    expect(await status({})).toBe(401)
  })

  test('with an API key nobody issued is unauthenticated, not let through', async () => {
    // The path the alert points at: the header is present, so the key is looked up, and
    // a key that is not found must leave the request with no identity.
    expect(await status({ [API_KEY_HEADER]: `fmc_${'z'.repeat(40)}` })).toBe(401)
  })

  test('with an empty API key header is unauthenticated', async () => {
    expect(await status({ [API_KEY_HEADER]: '' })).toBe(401)
  })

  test('with a bearer token the server did not sign is unauthenticated', async () => {
    expect(await status({ authorization: 'Bearer not-a-token' })).toBe(401)
  })

  test('with a bad bearer token is not rescued by an API key beside it', async () => {
    // One credential is read, the bearer first; a request cannot try a second one after
    // the first fails.
    expect(
      await status({ authorization: 'Bearer not-a-token', [API_KEY_HEADER]: `fmc_${'z'.repeat(40)}` }),
    ).toBe(401)
  })
})
