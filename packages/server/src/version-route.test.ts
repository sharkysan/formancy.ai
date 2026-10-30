import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { FormSchema } from '@formancy/spec'
import { createMemoryStorage } from '@formancy/server-core'
import { createApp } from './app.js'

/**
 * One version's document over HTTP, through `createApp` with the memory storage (0207). The
 * use-case decides which version an address names; what is under test here is that the route
 * carries that answer, asks the reader for `form.read`, and decides nothing of its own.
 */
const SECRET = 'a-test-secret-that-is-long-enough-to-sign'
const ADMIN = { email: 'root@test.ch', password: 'root-password-1' }

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const contact = (title: string): FormSchema => ({
  specVersion: '5',
  id: 'contact',
  title,
  model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
})

async function serve(): Promise<{ server: FastifyInstance; admin: string }> {
  const server = await createApp(createMemoryStorage(), {
    authSecret: SECRET,
    bootstrapAdmin: ADMIN,
    loginRateLimit: { max: 1_000, timeWindowMs: 60_000 },
  })
  app = server
  const admin = (await server.inject({ method: 'POST', url: '/auth/login', payload: ADMIN })).json<{ token: string }>().token
  for (const title of ['Contact, first', 'Contact, second']) {
    await server.inject({ method: 'POST', url: '/forms', headers: { authorization: `Bearer ${admin}` }, payload: { path: 'contact', schema: contact(title) } })
  }
  return { server, admin }
}

describe('a version’s document over HTTP', () => {
  test('is the document that version was published with', async () => {
    const { server, admin } = await serve()
    const first = await server.inject({ method: 'GET', url: '/f/contact/versions/1', headers: { authorization: `Bearer ${admin}` } })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ version: 1, schema: { title: 'Contact, first' } })
  })

  // One answer for every address that names no version of this form, so a reader learns nothing
  // about versions elsewhere; another spelling of a number is no address at all.
  test('is 404 for a version this form has not published, under any spelling', async () => {
    const { server, admin } = await serve()
    for (const version of ['3', '01', '1.0']) {
      const reply = await server.inject({ method: 'GET', url: `/f/contact/versions/${version}`, headers: { authorization: `Bearer ${admin}` } })
      expect(reply.statusCode, version).toBe(404)
      expect(reply.json(), version).toEqual({ error: 'unknown_version' })
    }
    const nowhere = await server.inject({ method: 'GET', url: '/f/nowhere/versions/1', headers: { authorization: `Bearer ${admin}` } })
    expect(nowhere.json()).toEqual({ error: 'unknown_form' })
  })

  // A form's document is the management plane's, as its history is.
  test('is refused without a session', async () => {
    const { server } = await serve()
    expect((await server.inject({ method: 'GET', url: '/f/contact/versions/1' })).statusCode).toBe(401)
  })
})
