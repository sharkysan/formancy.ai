import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { channel } from 'node:diagnostics_channel'
import { Readable } from 'node:stream'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse, RouteOptions } from 'fastify'
import type { Completer } from '@formancy/server-core'
import { bootstrapSchema } from './db.js'
import { API_KEY_HEADER, createApp, SCHEMA_HASH_HEADER } from './app.js'
import { createPostgresStorage } from './postgres-storage.js'
import type { FileStore } from './file-store.js'

/**
 * A NUL character, U+0000, in what a request sends (0173).
 *
 * PostgreSQL holds no NUL in `text`, `22021`, nor in `jsonb`, `22P05`, so a lookup by a value
 * with one failed where the in-memory storage every other suite runs on finds no row, and a
 * write of one failed outright: each a `500` and a line at `error`, the public read of a form
 * among them. Only real SQL can see it, so this is against real PostgreSQL.
 *
 * The routes are read from the route table as Fastify registers them, as the rate limits'
 * guard reads them (0170), so a route added tomorrow with an address or a body is swept here
 * without anybody listing it — or fails the guard on the guard until it is given a body below.
 */
const NUL = '\u0000'

let container: StartedPostgreSqlContainer
let sql: postgres.Sql
let app: FastifyInstance
const routes: string[] = []
const written: string[] = []

const bytes = new Map<string, Buffer>()
const fileStore: FileStore = {
  put: async (key, body) => {
    bytes.set(key, body)
  },
  open: async (key) => {
    const found = bytes.get(key)
    return found === undefined ? undefined : Readable.from(found)
  },
  remove: async (key) => {
    bytes.delete(key)
  },
  sizeOf: async (key) => bytes.get(key)?.byteLength,
}

/** A model that answers anything, so its route reaches what it does with a body. */
const completer: Completer = { complete: () => Promise.resolve({ ok: true, text: '{}' }) }

const schema = {
  specVersion: '4',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email' },
      { key: 'country', type: 'text', label: 'Country' },
      { key: 'canton', type: 'text', label: 'Canton' },
      { key: 'evidence', type: 'file', label: 'Evidence' },
    ],
  },
  logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'country == "CH"' }] },
}

/** What every request here carries, so each reaches as far into its route as it can. */
let carried: Record<string, string> = {}
/** A draft, for the address of one and its key. */
let draft = { draftId: '', token: '' }

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  sql = postgres(container.getConnectionUri())
  await bootstrapSchema(sql)

  const initialization = channel('fastify.initialization')
  const watch = (message: unknown): void => {
    const { fastify } = message as { fastify: FastifyInstance }
    fastify.addHook('onRoute', (route: RouteOptions) => {
      for (const method of [route.method].flat()) routes.push(`${method} ${route.url}`)
    })
  }
  initialization.subscribe(watch)
  try {
    app = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      bootstrapAdmin: { email: 'root@test.ch', password: 'root-password-1' },
      // On, so the challenge's route reaches its lookup; a session skips it on a submission.
      challengeSecret: 'a-challenge-secret-long-enough-to-sign-with',
      submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
      loginRateLimit: { max: 10_000, timeWindowMs: 60_000 },
      fileStore,
      model: { provider: 'anthropic', model: 'claude-test', completer },
      log: { sink: { write: (line: string) => written.push(line) }, level: 'info' },
    })
  } finally {
    initialization.unsubscribe(watch)
  }

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'root@test.ch', password: 'root-password-1' },
  })
  const admin = { authorization: `Bearer ${(login.json() as { token: string }).token}` }
  const published = await app.inject({ method: 'POST', url: '/forms', headers: admin, payload: { path: 'contact-us', schema } })
  expect(published.statusCode).toBe(201)
  await app.inject({ method: 'PUT', url: '/f/contact-us/access', headers: admin, payload: { submit: 'public' } })
  draft = (await app.inject({ method: 'POST', url: '/f/contact-us/drafts' })).json() as typeof draft

  carried = {
    ...admin,
    [SCHEMA_HASH_HEADER]: (published.json() as { schemaHash: string }).schemaHash,
    'x-formancy-draft-token': draft.token,
  }
}, 180_000)

afterAll(async () => {
  await app?.close()
  await sql?.end()
  await container?.stop()
})

/**
 * A request, its answer, and every line at `error` the server wrote while answering it.
 *
 * A refusal is the client's doing, so it is no line at `error`: a log kept for failures fills
 * with them otherwise, at the will of anybody who can send a request (0168).
 */
async function ask(request: InjectOptions): Promise<{ response: LightMyRequestResponse; errors: Array<Record<string, unknown>> }> {
  const from = written.length
  const response = await app.inject(request)
  const errors = written
    .slice(from)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line['level'] === 'error')
  return { response, errors }
}

/**
 * A body for each route that takes one, well-formed for it, so that a NUL put anywhere in it
 * reaches as far as the route would take it. A route that takes a body and is in neither this
 * nor `NOT_JSON` fails the guard on the guard below.
 */
const WELL_FORMED: Record<string, () => Record<string, unknown>> = {
  'POST /auth/login': () => ({ email: 'root@test.ch', password: 'root-password-1' }),
  'POST /users': () => ({ email: 'someone@test.ch', password: 'long-enough-password', role: 'viewer' }),
  'POST /api-keys': () => ({ name: 'ci', role: 'viewer' }),
  'POST /forms': () => ({ path: 'another-form', schema }),
  'PUT /f/:path/access': () => ({ submit: 'public', allowedOrigins: ['https://example.ch'] }),
  'PUT /f/:path/examples': () => ({
    scenarios: [{ name: 'Switzerland asks for a canton', changes: { country: 'CH' }, valid: true, visible: { canton: true } }],
    sample: { email: 'jane@example.ch' },
  }),
  'POST /f/:path/submissions': () => ({ email: 'a@b.ch', country: 'CH', canton: 'ZH' }),
  'POST /f/:path/drafts': () => ({}),
  'PUT /f/:path/drafts/:draftId': () => ({ email: 'a@b.ch', country: 'CH' }),
  'POST /f/:path/files': () => ({ field: 'evidence', name: 'a.pdf', size: 3, contentType: 'application/pdf' }),
  'POST /deliveries/:id/replay': () => ({}),
  'POST /model/complete': () => ({ kind: 'authoring', user: 'Add a field for a phone number' }),
}

/** Routes whose body is not JSON, with the reason it is not swept for a NUL. */
const NOT_JSON: Record<string, string> = {
  // A file is whatever the reader had, and a NUL byte is ordinary in one: a PDF has them.
  'PUT /f/:path/files/:id': 'the bytes of a file',
}

/** The route's address with each parameter filled: the real form, draft and so on, or `value` for `only`. */
function address(url: string, only?: string, value?: string): string {
  const real: Record<string, string> = { path: 'contact-us', draftId: draft.draftId, id: '00000000-0000-4000-8000-000000000000' }
  return url.replace(/:([A-Za-z]+)/g, (_, name: string) =>
    encodeURIComponent(name === only && value !== undefined ? value : (real[name] ?? name)),
  )
}

/**
 * `value` with a NUL put into one of its strings or one of its members' names, once for each,
 * and the JSON Pointer (RFC 6901) to where it was put.
 */
function withNul(value: unknown, at = ''): Array<{ pointer: string; body: unknown }> {
  const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1')
  if (typeof value === 'string') return [{ pointer: at, body: `${value.slice(0, 1)}${NUL}${value.slice(1)}` }]
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      withNul(item, `${at}/${String(index)}`).map(({ pointer, body }) => ({ pointer, body: value.with(index, body) })),
    )
  }
  if (typeof value === 'object' && value !== null) {
    const members = Object.entries(value)
    return members.flatMap(([key, item], index) => [
      { pointer: `${at}/${token(`${key}${NUL}`)}`, body: Object.fromEntries(members.with(index, [`${key}${NUL}`, item])) },
      ...withNul(item, `${at}/${token(key)}`).map(({ pointer, body }) => ({
        pointer,
        body: Object.fromEntries(members.with(index, [key, body])),
      })),
    ])
  }
  return []
}

/** A route of the table, as the method and the address pattern a request is sent with. */
function swept(route: string): { method: NonNullable<InjectOptions['method']>; url: string } {
  const [method = '', url = ''] = route.split(' ')
  return { method: method as NonNullable<InjectOptions['method']>, url }
}

describe('the routes', () => {
  test('are read from the route table, so the cases below check something', () => {
    // A guard on the guard: a hook that stopped seeing routes would leave every sweep below
    // passing over an empty list.
    expect(routes).toContain('GET /f/:path')
    expect(routes).toContain('POST /auth/login')
    expect(routes).toContain('PUT /f/:path/drafts/:draftId')
  })

  test('that take a body each have a well-formed one here, or are named as taking no JSON', () => {
    // A route added with a body and nothing here would be swept by nothing below.
    const bodied = [...new Set(routes)].filter((route) => !/^(GET|HEAD) /.test(route)).sort()
    expect(bodied).toEqual([...Object.keys(WELL_FORMED), ...Object.keys(NOT_JSON)].sort())
  })
})

describe('a NUL in an address', () => {
  test('on the public read of a form, which no limit counts, is a form that is not there', async () => {
    // The case #246 measured: anybody could write two lines at `error` a request, at will.
    const { response, errors } = await ask({ method: 'GET', url: '/f/contact%00-us' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'unknown_form' })
    expect(errors).toEqual([])
  })

  test('of every route, in every parameter, is answered as a name nothing has', async () => {
    // No path, draft or file can hold a NUL, so one names nothing: the route's own answer for
    // something that is not there, in the route's own order — a session asked for first where
    // one is needed. Compared with a name that is merely unknown rather than written down here,
    // so the case holds whatever each route says. Each was a `500` where the route looked it up.
    const different: string[] = []
    const compared: string[] = []
    for (const route of new Set(routes)) {
      const { method, url } = swept(route)
      if (method === 'HEAD') continue
      for (const [, parameter] of url.matchAll(/:([A-Za-z]+)/g)) {
        compared.push(`${route} :${String(parameter)}`)
        const body = WELL_FORMED[route]?.()
        const send = (value: string): InjectOptions => ({
          method,
          url: address(url, parameter, value),
          headers: carried,
          ...(body === undefined ? {} : { payload: body }),
        })
        const unknown = await ask(send('nothing-by-this-name'))
        const nul = await ask(send(`nothing${NUL}by-this-name`))
        if (nul.response.statusCode !== unknown.response.statusCode || nul.response.body !== unknown.response.body || nul.errors.length > 0) {
          different.push(`${route} :${String(parameter)}: ${String(nul.response.statusCode)} where unknown is ${String(unknown.response.statusCode)}`)
        }
      }
    }

    // Each kind of parameter was reached, so a pattern that stopped matching one is seen.
    expect(compared).toEqual(
      expect.arrayContaining(['GET /f/:path :path', 'PUT /f/:path/drafts/:draftId :draftId', 'POST /deliveries/:id/replay :id']),
    )
    expect(different).toEqual([])
  })

  test('without a session is still asked for one first', async () => {
    // The lookup finds nothing, so it changes no route's order: an anonymous request for a
    // form's submissions is told to sign in, never whether the form exists.
    const { response, errors } = await ask({ method: 'GET', url: '/f/contact%00-us/submissions' })

    expect(response.statusCode).toBe(401)
    expect(errors).toEqual([])
  })
})

describe('a NUL in a body', () => {
  test('is refused as malformed in every string and every name, saying where it sits', async () => {
    // Nothing a route keeps can hold one, and each string here was a `500` wherever the route
    // wrote it: a submission's answer, a draft, a schema, an example, a file's name or type, an
    // origin, a user's email, a key's name. Refused before the route runs — where a body that
    // does not parse is — so the answer depends on the body alone, and every route says it the
    // same way.
    const wrong: string[] = []
    for (const [route, body] of Object.entries(WELL_FORMED)) {
      const { method, url } = swept(route)
      // And a member of its own, so a body with no strings is swept too.
      const cases = [...withNul(body()), { pointer: `/extra${NUL}`, body: { ...body(), [`extra${NUL}`]: 'member' } }]
      for (const { pointer, body: sent } of cases) {
        const { response, errors } = await ask({
          method,
          url: address(url),
          headers: carried,
          payload: sent as Record<string, unknown>,
        })
        // A body that is not JSON — a `204`'s, which a refusal never is — points nowhere.
        const answer = (response.body.startsWith('{') ? response.json() : {}) as { error?: unknown; pointer?: unknown }
        if (response.statusCode !== 400 || answer.error !== 'nul_character' || answer.pointer !== pointer || errors.length > 0) {
          wrong.push(`${route} ${JSON.stringify(pointer)}: ${String(response.statusCode)} ${response.body.slice(0, 80)}`)
        }
      }
    }

    expect(wrong).toEqual([])
  })

  test('of a sign-in is answered alike for an address that has an account and one that does not', async () => {
    // 0031: a failed sign-in must not say whether an address has an account. The refusal is
    // decided by the body before any account is read, so it is the same answer for both.
    const known = await ask({ method: 'POST', url: '/auth/login', payload: { email: `root@test.ch${NUL}`, password: 'root-password-1' } })
    const unknown = await ask({ method: 'POST', url: '/auth/login', payload: { email: `nobody@test.ch${NUL}`, password: 'root-password-1' } })

    expect(known.response.statusCode).toBe(400)
    expect(known.response.json()).toMatchObject({ error: 'nul_character', pointer: '/email' })
    expect(known.response.body).toBe(unknown.response.body)
    expect([...known.errors, ...unknown.errors]).toEqual([])
  })

  test('sent as plain text, which a draft would keep as a string, is refused at the top of the body', async () => {
    // Fastify parses `text/plain` itself, and the draft route keeps whatever it is handed.
    const { response, errors } = await ask({
      method: 'PUT',
      url: `/f/contact-us/drafts/${draft.draftId}`,
      headers: { 'x-formancy-draft-token': draft.token, 'content-type': 'text/plain' },
      payload: `a${NUL}b`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'nul_character', pointer: '' })
    expect(errors).toEqual([])
  })
})

describe('what is not refused', () => {
  test('a file’s bytes may hold NUL bytes, and are kept', async () => {
    // A binary file has them. Refusing them would refuse most files anybody attaches.
    // Offered with the session, so whatever an earlier case did to the form's access stands aside.
    const offer = await app.inject({
      method: 'POST',
      url: '/f/contact-us/files',
      headers: carried,
      payload: { field: 'evidence', name: 'a.pdf', size: 4, contentType: 'application/pdf' },
    })
    const { id } = offer.json() as { id: string }

    const { response, errors } = await ask({
      method: 'PUT',
      url: `/f/contact-us/files/${id}`,
      headers: { 'content-type': 'application/pdf' },
      payload: Buffer.from([0x25, 0x00, 0x00, 0x46]),
    })

    expect(response.statusCode).toBe(204)
    expect(errors).toEqual([])
    expect([...bytes.values()]).toContainEqual(Buffer.from([0x25, 0x00, 0x00, 0x46]))
  })

  test('every other character, and the escape spelled out, are stored as they were sent', async () => {
    // Nothing that was stored before is changed: the rule is the one character PostgreSQL
    // cannot hold, not every control character, and not the six characters that spell its
    // escape — which a JSON body sends as text, and the submission keeps as text.
    const sent = `\\u0000 ${String.fromCharCode(1)}\t${String.fromCharCode(0x1f)} é 日本`
    const { response, errors } = await ask({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: carried,
      payload: { email: sent },
    })

    expect(response.statusCode).toBe(201)
    expect(errors).toEqual([])
    const [row] = await sql`SELECT data FROM submissions WHERE id = ${(response.json() as { id: string }).id}`
    expect((row!['data'] as { email: string }).email).toBe(sent)
  })
})

describe('a NUL in a header', () => {
  test('naming an API key names no key: the request has no identity', async () => {
    // Over a socket Node refuses a NUL in any header with a `400` before Fastify sees the
    // request; injected, it reached the key's lookup, `22021`. The lookup now finds nothing.
    const { response, errors } = await ask({ method: 'GET', url: '/forms', headers: { [API_KEY_HEADER]: `fmc_${NUL}abcdefghijkl` } })

    expect(response.statusCode).toBe(401)
    expect(errors).toEqual([])
  })
})
