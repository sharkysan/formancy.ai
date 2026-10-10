import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { FormSchema } from '@formancy/spec'
import { createMemoryStorage } from '@formancy/server-core'
import { createApp } from './app.js'

/**
 * A form's examples over HTTP, through `createApp` with the memory storage (0166).
 *
 * The use-cases decide who may read and change them, what an example is and what a publish
 * says about them; what is under test here is that the routes carry those answers — the
 * status, the body, and the warnings on a publish's `201` — and decide nothing of their own.
 * Real PostgreSQL is `server.integration.test.ts`'s.
 */
const SECRET = 'a-test-secret-that-is-long-enough-to-sign'
const ADMIN = { email: 'root@test.ch', password: 'root-password-1' }

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

const contact = (cel: string): FormSchema =>
  ({
    specVersion: '4',
    id: 'contact',
    title: 'Contact',
    model: {
      fields: [
        { key: 'email', type: 'text', label: 'Email', required: true },
        { key: 'country', type: 'text', label: 'Country' },
        { key: 'canton', type: 'text', label: 'Canton' },
      ],
    },
    logic: { rules: [{ target: 'canton', kind: 'visible', cel }] },
  }) as unknown as FormSchema

const EXAMPLES = {
  scenarios: [{ name: 'Switzerland asks for a canton', changes: { country: 'CH' }, valid: true, visible: { canton: true } }],
  sample: { email: 'jane@example.ch' },
}

/** A server with the contact form published, and a session for an admin and for a viewer. */
async function serve(): Promise<{ server: FastifyInstance; admin: string; viewer: string }> {
  const server = await createApp(createMemoryStorage(), {
    authSecret: SECRET,
    bootstrapAdmin: ADMIN,
    loginRateLimit: { max: 1_000, timeWindowMs: 60_000 },
  })
  app = server
  const login = async (email: string, password: string): Promise<string> =>
    ((await server.inject({ method: 'POST', url: '/auth/login', payload: { email, password } })).json() as { token: string }).token
  const admin = await login(ADMIN.email, ADMIN.password)
  await server.inject({
    method: 'POST',
    url: '/users',
    headers: { authorization: `Bearer ${admin}` },
    payload: { email: 'viewer@test.ch', password: 'viewer-password-1', role: 'viewer' },
  })
  await server.inject({
    method: 'POST',
    url: '/forms',
    headers: { authorization: `Bearer ${admin}` },
    payload: { path: 'contact', schema: contact('country == "CH"') },
  })
  return { server, admin, viewer: await login('viewer@test.ch', 'viewer-password-1') }
}

const as = (token: string | undefined): Record<string, string> =>
  token === undefined ? {} : { authorization: `Bearer ${token}` }

/** A GET, or a PUT of the examples, to `url` with `token`'s session. */
function send(server: FastifyInstance, method: 'GET' | 'PUT', url: string, token: string | undefined) {
  return server.inject({ method, url, headers: as(token), ...(method === 'PUT' ? { payload: EXAMPLES } : {}) })
}

describe('a form’s examples over HTTP', () => {
  test('are kept by PUT and read back by GET, with their sample', async () => {
    // A deployment's builder keeps them here, so they outlive the tab they were written in.
    const { server, admin } = await serve()

    const put = await server.inject({ method: 'PUT', url: '/f/contact/examples', headers: as(admin), payload: EXAMPLES })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toEqual(EXAMPLES)

    const get = await server.inject({ method: 'GET', url: '/f/contact/examples', headers: as(admin) })
    expect(get.statusCode).toBe(200)
    expect(get.json()).toEqual(EXAMPLES)
  })

  test('need a session, and the permission editing the form takes', async () => {
    // 401 and 403 as everywhere on the management plane: the difference tells a client
    // whether to sign in or to give up. The 403 is the use-case's answer, carried.
    const { server, viewer } = await serve()

    for (const method of ['GET', 'PUT'] as const) {
      expect((await send(server, method, '/f/contact/examples', undefined)).statusCode).toBe(401)
      const refused = await send(server, method, '/f/contact/examples', viewer)
      expect(refused.statusCode).toBe(403)
      expect(refused.json()).toEqual({ error: 'forbidden', action: 'form.publish' })
    }
  })

  test('are a 404 for a form the deployment does not have', async () => {
    const { server, admin } = await serve()
    for (const method of ['GET', 'PUT'] as const) {
      const response = await send(server, method, '/f/nowhere/examples', admin)
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'unknown_form' })
    }
  })

  test('refuse a list with something that is not an example, saying what, with a 422', async () => {
    // The sentences are the use-case's; a client shows them rather than "422".
    const { server, admin } = await serve()
    const response = await server.inject({
      method: 'PUT',
      url: '/f/contact/examples',
      headers: as(admin),
      payload: { scenarios: [{ name: 'Broken', valid: true }] },
    })
    expect(response.statusCode).toBe(422)
    const body = response.json() as { error: string; problems: string[] }
    expect(body.error).toBe('invalid_examples')
    expect(body.problems).toHaveLength(1)
    expect(body.problems[0]).toMatch(/^Example 1 \("Broken"\)/)
  })

  test('are run when the form is published, and the 201 names each that stops holding', async () => {
    // The rule turned round, published anyway — the warning is the use-case's, and the
    // route carries it on the 201 the way a rule reading a missing path is carried (0097).
    const { server, admin } = await serve()
    await server.inject({ method: 'PUT', url: '/f/contact/examples', headers: as(admin), payload: EXAMPLES })

    const published = await server.inject({
      method: 'POST',
      url: '/forms',
      headers: as(admin),
      payload: { path: 'contact', schema: contact('country != "CH"') },
    })

    expect(published.statusCode).toBe(201)
    const body = published.json() as { version: number; warnings?: string[] }
    expect(body.version).toBe(2)
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings?.[0]).toContain('"Switzerland asks for a canton"')
    const live = await server.inject({ method: 'GET', url: '/f/contact' })
    expect((live.json() as { version: number }).version).toBe(2)
  })
})
