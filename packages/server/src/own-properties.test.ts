import { afterEach, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createMemoryStorage } from '@formancy/server-core'
import type { Storage } from '@formancy/server-core'
import { schemaHash } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { createApp, SCHEMA_HASH_HEADER, SUBMISSION_TOKEN_HEADER } from './app.js'

/**
 * A key named after what every object has, posted straight at the API (0185).
 *
 * CodeQL's alerts 30 and 31 point at `setAt` in `@formancy/core` from the body of
 * `POST /forms`. The write they flag is no prototype pollution — it writes into a fresh
 * object, and Fastify refuses a body carrying `__proto__` with a 400 — but behind them
 * was a read that took an inherited member for an answer. These hold the server to the
 * fix, so the alerts can be judged against something that fails.
 */
let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

const ROOT = { email: 'root@test.ch', password: 'root-password-1' }

async function serve(storage: Storage = createMemoryStorage()): Promise<{ app: FastifyInstance; asRoot: Record<string, string> }> {
  app = await createApp(storage, {
    authSecret: 'a-test-secret-that-is-long-enough-to-sign',
    bootstrapAdmin: ROOT,
  })
  const { token } = (await app.inject({ method: 'POST', url: '/auth/login', payload: ROOT })).json<{
    token: string
  }>()
  return { app, asRoot: { authorization: `Bearer ${token}` } }
}

function form(id: string, fields: readonly unknown[], rules?: readonly unknown[]): Record<string, unknown> {
  return { specVersion: '4', id, title: id, model: { fields }, ...(rules === undefined ? {} : { logic: { rules } }) }
}

/** Publish a form open to anyone, through the API, as an operator would. */
async function publishPublic(app: FastifyInstance, asRoot: Record<string, string>, schema: Record<string, unknown>): Promise<void> {
  const path = schema['id'] as string
  const published = await app.inject({ method: 'POST', url: '/forms', headers: asRoot, payload: { path, schema } })
  expect(published.statusCode).toBe(201)
  await app.inject({ method: 'PUT', url: `/f/${path}/access`, headers: asRoot, payload: { submit: 'public' } })
}

/** An anonymous submission, sent as raw JSON, so a list or a key the parser refuses arrives as sent. */
async function submit(app: FastifyInstance, path: string, body: string) {
  const { schemaHash: hash, submissionToken } = (await app.inject({ method: 'GET', url: `/f/${path}` })).json<{
    schemaHash: string
    submissionToken: string
  }>()
  return app.inject({
    method: 'POST',
    url: `/f/${path}/submissions`,
    headers: {
      [SCHEMA_HASH_HEADER]: hash,
      [SUBMISSION_TOKEN_HEADER]: submissionToken,
      'content-type': 'application/json',
    },
    payload: body,
  })
}

/**
 * A version a release before 0185 published, put straight into the storage: no route
 * publishes one any more, and such versions are still stored wherever one was.
 */
async function storedBefore(storage: Storage, schema: Record<string, unknown>): Promise<void> {
  const id = schema['id'] as string
  const document = schema as unknown as FormSchema
  await storage.publishVersion({
    form: { id: `form-${id}`, path: id, currentVersionId: null, accessSubmit: 'public', allowedOrigins: null },
    version: { id: `version-${id}`, formId: `form-${id}`, version: 1, schema: document, schemaHash: schemaHash(document) },
  })
}

describe('a form with a required field keyed constructor', () => {
  test('answers 422 to an anonymous empty submission and stores nothing', async () => {
    // Measured against 0.6.0: `{}` was stored with 201 for this form, where the same form
    // keyed `contractor` was answered 422 — `function Object` counted as the answer.
    const { app, asRoot } = await serve()
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asRoot,
      payload: { path: 'works', schema: form('works', [{ key: 'constructor', type: 'text', label: 'Contractor', required: true }]) },
    })
    expect(published.statusCode).toBe(201)
    await app.inject({ method: 'PUT', url: '/f/works/access', headers: asRoot, payload: { submit: 'public' } })
    const { schemaHash, submissionToken } = (await app.inject({ method: 'GET', url: '/f/works' })).json<{
      schemaHash: string
      submissionToken: string
    }>()

    const posted = await app.inject({
      method: 'POST',
      url: '/f/works/submissions',
      headers: { [SCHEMA_HASH_HEADER]: schemaHash, [SUBMISSION_TOKEN_HEADER]: submissionToken },
      payload: {},
    })

    expect(posted.statusCode).toBe(422)
    expect(posted.json()).toEqual({ error: 'invalid', errors: { constructor: ['required'] } })
    const listed = await app.inject({ method: 'GET', url: '/f/works/submissions', headers: asRoot })
    expect(listed.json()).toEqual({ submissions: [] })
  })
})

describe('a form with a field keyed __proto__', () => {
  test('is refused at publish, at the key, rather than published to lose its answers', async () => {
    // It was published with 201, and every answer to it went nowhere: the engine wrote it
    // into the object's prototype, and a body carrying it is refused by the parser.
    const { app, asRoot } = await serve()
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asRoot,
      payload: {
        path: 'remarks',
        schema: form('remarks', [{ key: 'outer', type: 'group', label: 'Outer', fields: [{ key: '__proto__', type: 'text', label: 'Remarks' }] }]),
      },
    })

    expect(published.statusCode).toBe(422)
    expect(published.json()).toMatchObject({
      error: 'invalid_schema',
      errors: [{ path: '/model/fields/0/fields/0/key', code: 'key.unstorable', values: { key: '__proto__' } }],
    })
  })
})

describe('a form a list answers', () => {
  test('answers 422 to a group sent as a list for its required field keyed length', async () => {
    // A list holds its own `length`, which answered the question: `{ "address": [] }` was
    // stored with 201, a list where the form asks for a group.
    const { app, asRoot } = await serve()
    await publishPublic(
      app,
      asRoot,
      form('address', [
        {
          key: 'address',
          type: 'group',
          label: 'Address',
          fields: [{ key: 'length', type: 'text', label: 'Length', required: true }],
        },
      ]),
    )

    const posted = await submit(app, 'address', '{"address":[]}')

    expect(posted.statusCode).toBe(422)
    // The group is refused for its own shape too: a list where its object belongs (0189).
    expect(posted.json()).toEqual({ error: 'invalid', errors: { address: ['type'], 'address.length': ['required'] } })
  })

  test('and to a whole submission sent as a list, for a required field keyed length', async () => {
    // `[1, 2]` was stored as the submission, with its length for the answer.
    const { app, asRoot } = await serve()
    await publishPublic(app, asRoot, form('measure', [{ key: 'length', type: 'number', label: 'Length', required: true }]))

    const posted = await submit(app, 'measure', '[1,2]')

    expect(posted.statusCode).toBe(422)
    expect(posted.json()).toEqual({ error: 'invalid', errors: { length: ['required'] } })
  })
})

describe('a repeater with a member keyed constructor', () => {
  test('stores a good row its row rule passes, where it was refused as invalid', async () => {
    // The replay binds every member a row declares, `constructor` as null, and the expression
    // library told a map by its `constructor`: the row was no map to it, `item.qty > 0.0`
    // could not be evaluated, and the validate rule refused every submission with a row.
    const { app, asRoot } = await serve()
    await publishPublic(
      app,
      asRoot,
      form(
        'items',
        [
          {
            key: 'items',
            type: 'repeater',
            label: 'Items',
            fields: [
              { key: 'qty', type: 'number', label: 'Qty' },
              { key: 'constructor', type: 'text', label: 'Contractor' },
            ],
          },
        ],
        [{ target: 'items[].qty', kind: 'validate', cel: 'item.qty > 0.0', code: 'positive' }],
      ),
    )

    const posted = await submit(app, 'items', '{"items":[{"qty":2.5}]}')

    expect(posted.statusCode).toBe(201)
  })
})

describe('a version stored before __proto__ was refused', () => {
  test('with a field so keyed, answers its read and refuses every submission with 500', async () => {
    // The engine will not open it: its path model refuses the key, rather than lose what is
    // typed into the field. The read does not open the engine, so the form is still served
    // until the operator republishes it without the key. Asserted, so closing it is deliberate.
    const storage = createMemoryStorage()
    await storedBefore(
      storage,
      form('remarks', [
        { key: 'name', type: 'text', label: 'Name' },
        { key: '__proto__', type: 'text', label: 'Remarks' },
      ]),
    )
    const { app } = await serve(storage)

    expect((await app.inject({ method: 'GET', url: '/f/remarks' })).statusCode).toBe(200)
    expect((await submit(app, 'remarks', '{"name":"Ann"}')).statusCode).toBe(500)
  })

  test('with a matrix row so valued, opens, and no body Fastify parses can answer the row', async () => {
    // A row's value is a key of the answer and not a path, so the engine opens the version and
    // reads that key as the answer's own. Fastify's parser refuses a body carrying it with a
    // 400, so a required matrix is refused `required` for ever, and nothing is lost unsaid.
    const storage = createMemoryStorage()
    await storedBefore(
      storage,
      form('survey', [
        {
          key: 'rating',
          type: 'matrix',
          label: 'Rating',
          required: true,
          rows: [
            { value: 'taste', label: 'Taste' },
            { value: '__proto__', label: 'Price' },
          ],
          options: [{ value: 'good', label: 'Good' }],
        },
      ]),
    )
    const { app } = await serve(storage)

    const half = await submit(app, 'survey', '{"rating":{"taste":"good"}}')
    expect(half.statusCode).toBe(422)
    expect(half.json()).toEqual({ error: 'invalid', errors: { rating: ['required'] } })
    const whole = await submit(app, 'survey', '{"rating":{"taste":"good","__proto__":"good"}}')
    expect(whole.statusCode).toBe(400)
  })
})
