import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createMemoryStorage } from '@formancy/server-core'
import { createApp } from './app.js'

/**
 * Where a body's NUL character is said to be, and that finding it cannot itself fail (0173).
 *
 * Through `createApp` with the in-memory storage, which holds a NUL as readily as anything
 * else: what is under test is the refusal at the edge and the pointer it answers with. What
 * PostgreSQL made of a NUL, and every route's answer, are `nul-character.integration.test.ts`'s.
 */
const NUL = '\u0000'

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

/** A request's body sent to a route that reads none, so only the refusal can answer it. */
async function sent(payload: string, contentType = 'application/json') {
  app ??= await createApp(createMemoryStorage(), { authSecret: 'a-test-secret-that-is-long-enough-to-sign' })
  return app.inject({ method: 'POST', url: '/f/contact/drafts', headers: { 'content-type': contentType }, payload })
}

describe('the pointer to a NUL', () => {
  test('escapes a name’s slash and tilde, as RFC 6901 spells them', async () => {
    // Unescaped, `/a/b` would point into a member `a` that the body does not have.
    const response = await sent(JSON.stringify({ 'a/b': { 'm~n': ['x', `y${NUL}`] } }))

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'nul_character', pointer: '/a~1b/m~0n/1' })
  })

  test('names the first NUL in the order the body was written', async () => {
    // One answer for one body, whichever way the members happen to be walked.
    const response = await sent(JSON.stringify({ first: ['ok', `no${NUL}`], second: `no${NUL}` }))

    expect(response.json()).toMatchObject({ pointer: '/first/1' })
  })

  test('is said in the sentence too, and the whole body is the empty pointer', async () => {
    // A client that shows only the message still says where; the empty pointer is the
    // document itself, a string sent as plain text.
    const top = await sent(`a${NUL}b`, 'text/plain')
    const deep = await sent(JSON.stringify({ answers: { name: `a${NUL}` } }))

    expect(top.json()).toMatchObject({ pointer: '' })
    expect((top.json() as { message: string }).message).toContain('the body itself')
    expect((deep.json() as { message: string }).message).toContain('/answers/name')
  })
})

describe('looking for a NUL', () => {
  test('in a body nested deeper than a call stack goes is still an answer, not a 500', async () => {
    // JSON.parse takes a body nested a hundred thousand deep without recursing; a walk that
    // recursed would throw where it did not, and every route would answer that body with a 500.
    const depth = 100_000
    const nested = (inner: string): string => `${'['.repeat(depth)}${inner}${']'.repeat(depth)}`

    const withNul = await sent(nested('"\\u0000"'))
    const without = await sent(nested('"fine"'))

    expect(withNul.statusCode).toBe(400)
    expect((withNul.json() as { pointer: string }).pointer).toBe('/0'.repeat(depth))
    // The draft route reads no body: an unknown form, past the walk.
    expect(without.statusCode).toBe(404)
  })

  test('passes a body with none to its route untouched', async () => {
    // The refusal is for the one character; every other request reaches its route as before.
    const response = await sent(JSON.stringify({ text: `\\u0000 ${String.fromCharCode(1)} é` }))

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'unknown_form' })
  })
})
