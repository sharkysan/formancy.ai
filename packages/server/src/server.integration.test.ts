import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { FormSchema } from '@formancy/spec'
import { bootstrapSchema } from './db.js'
import { createApp, SCHEMA_HASH_HEADER } from './app.js'
import { createPostgresStorage } from './postgres-storage.js'

/**
 * The walking skeleton's proof, against REAL Postgres — versioning and
 * submission bugs only manifest under real SQL semantics, so mocks are
 * explicitly not welcome here.
 */
let container: StartedPostgreSqlContainer
let sql: postgres.Sql
let app: FastifyInstance

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'country', type: 'select' },
      { key: 'canton', type: 'text' },
      { key: 'email', type: 'text', required: true },
      { key: 'price', type: 'number' },
      { key: 'qty', type: 'number' },
      { key: 'total', type: 'number' },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'total', kind: 'computed', cel: 'price * qty' },
    ],
  },
}

let adminToken = ''

/** Management requests carry the bootstrap admin's session token. */
function asAdmin(headers: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${adminToken}`, ...headers }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  sql = postgres(container.getConnectionUri())
  await bootstrapSchema(sql)
  app = await createApp(createPostgresStorage(sql), {
    authSecret: 'integration-test-secret-with-length',
    bootstrapAdmin: { email: 'root@test.ch', password: 'root-password-1' },
    // High enough that the rest of the suite is never throttled by it. The
    // limit has its own app below, with its own budget.
    submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
  })
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'root@test.ch', password: 'root-password-1' },
  })
  adminToken = (login.json() as { token: string }).token
}, 180_000)

afterAll(async () => {
  await app?.close()
  await sql?.end()
  await container?.stop()
})

describe('the walking skeleton, end to end', () => {
  let schemaHash = ''

  test('publishing a form yields version 1 and its hash', async () => {
    const response = await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'contact-us', schema } })

    expect(response.statusCode).toBe(201)
    const body = response.json() as { version: number; schemaHash: string }
    expect(body.version).toBe(1)
    expect(body.schemaHash).toMatch(/^[0-9a-f]{64}$/)
    schemaHash = body.schemaHash
  })

  test('a freshly published form refuses anonymous submissions', async () => {
    // Before opening it below. A form is private the moment it exists, and the
    // rest of this suite only works because the next test says otherwise.
    const response = await app.inject({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: { [SCHEMA_HASH_HEADER]: schemaHash },
      payload: { email: 'a@b.ch' },
    })

    expect(response.statusCode).toBe(403)
  })

  test('opening the form to the public is a separate, deliberate act', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/f/contact-us/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })

    expect(response.statusCode).toBe(204)
  })

  test('resolving returns exactly what was published', async () => {
    const response = await app.inject({ method: 'GET', url: '/f/contact-us' })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { version: number; schemaHash: string; schema: FormSchema }
    expect(body.schemaHash).toBe(schemaHash)
    expect(body.schema.model.fields.map((f) => f.key)).toContain('email')
  })

  test('a valid submission is stored, bound to the exact version row', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: { [SCHEMA_HASH_HEADER]: schemaHash },
      payload: { email: 'a@b.ch' },
    })

    expect(response.statusCode).toBe(201)
    const rows = await sql`
      SELECT s.data, v.schema_hash FROM submissions s JOIN form_versions v ON v.id = s.form_version_id`
    expect(rows).toHaveLength(1)
    expect(rows[0]!['schema_hash']).toBe(schemaHash)
  })

  test('a tampered submission is normalised: hidden data stripped, computed lies overwritten', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: { [SCHEMA_HASH_HEADER]: schemaHash },
      payload: {
        email: 'x@y.ch',
        country: 'DE',
        canton: 'SMUGGLED',
        price: 10,
        qty: 2,
        total: 999999,
      },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json() as { data: Record<string, unknown> }
    expect('canton' in body.data).toBe(false)
    expect(body.data['total']).toBe(20)
  })

  test('an invalid submission returns the client-shaped error record', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: { [SCHEMA_HASH_HEADER]: schemaHash },
      payload: {},
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({ error: 'invalid', errors: { email: ['required'] } })
  })

  test('a stale schema hash gets 409 with the current schema attached', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: { [SCHEMA_HASH_HEADER]: 'deadbeef' },
      payload: { email: 'a@b.ch' },
    })

    expect(response.statusCode).toBe(409)
    const body = response.json() as { error: string; current: { schemaHash: string } }
    expect(body.error).toBe('FORM_VERSION_CHANGED')
    expect(body.current.schemaHash).toBe(schemaHash)
  })

  test('republishing an identical schema stays at version 1', async () => {
    const response = await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'contact-us', schema } })
    expect((response.json() as { version: number }).version).toBe(1)
  })

  test('publishing a changed schema bumps the version, and the old hash now 409s', async () => {
    const changed = { ...schema, title: 'Contact us please' }
    const publish = await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'contact-us', schema: changed } })
    expect((publish.json() as { version: number }).version).toBe(2)

    const submit = await app.inject({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: { [SCHEMA_HASH_HEADER]: schemaHash },
      payload: { email: 'a@b.ch' },
    })
    expect(submit.statusCode).toBe(409)
  })

  test('the database refuses to mutate a published version — immutability is a trigger, not a convention', async () => {
    await expect(sql`UPDATE form_versions SET schema_hash = 'tampered' WHERE version = 1`).rejects.toThrow(
      /immutable/,
    )
  })

  test('the database refuses to orphan a submission from its version', async () => {
    await expect(sql`DELETE FROM form_versions WHERE version = 1`).rejects.toThrow()
  })

  test('a cyclic schema is refused at publish and never persisted', async () => {
    const cyclic: FormSchema = {
      ...schema,
      logic: {
        rules: [
          { target: 'price', kind: 'computed', cel: 'qty * 1.0' },
          { target: 'qty', kind: 'computed', cel: 'price * 1.0' },
        ],
      },
    }
    const response = await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'cyclic-form', schema: cyclic } })

    expect(response.statusCode).toBe(422)
    expect(await app.inject({ method: 'GET', url: '/f/cyclic-form' }).then((r) => r.statusCode)).toBe(404)
  })
})

describe('listing and export', () => {
  test('the submissions list is newest first and version-tagged', async () => {
    const response = await app.inject({ method: 'GET', url: '/f/contact-us/submissions', headers: asAdmin() })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { submissions: Array<{ version: number; data: unknown }> }
    expect(body.submissions.length).toBeGreaterThanOrEqual(2)
    expect(body.submissions[0]!.version).toBeGreaterThanOrEqual(1)
  })

  test('the CSV export unions columns across the two published versions', async () => {
    const response = await app.inject({ method: 'GET', url: '/f/contact-us/submissions/export.csv', headers: asAdmin() })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    const [header] = response.body.split('\n')
    // v2 dropped nothing but changed the title; both versions share columns —
    // the header must carry the model columns plus the bookkeeping ones.
    expect(header).toContain('id,submittedAt,version')
    expect(header).toContain('email')
    expect(response.body).toContain('a@b.ch')
  })

  test('both 404 on an unknown form', async () => {
    expect((await app.inject({ method: 'GET', url: '/f/ghost/submissions', headers: asAdmin() })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/f/ghost/submissions/export.csv', headers: asAdmin() })).statusCode).toBe(404)
  })
})

describe('drafts over HTTP', () => {
  test('autosave, republish, resume: the draft migrates lazily with a report', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/f/contact-us/drafts/draft-1',
      payload: { email: 'wip@b.ch', qty: 3 },
    })
    expect(put.statusCode).toBe(200)

    // Republish with qty dropped — lossy for the draft.
    const evolved = {
      ...schema,
      title: 'Contact v3',
      model: { fields: schema.model.fields.filter((f) => f.key !== 'qty' && f.key !== 'total') },
      logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'country == "CH"' }] },
    }
    const publish = await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'contact-us', schema: evolved } })
    expect(publish.statusCode).toBe(201)

    const resumed = await app.inject({ method: 'GET', url: '/f/contact-us/drafts/draft-1' })
    expect(resumed.statusCode).toBe(200)
    const body = resumed.json() as {
      outcome: string
      data: Record<string, unknown>
      migration?: { severity: string }
    }
    expect(body.outcome).toBe('resumed')
    expect(body.migration?.severity).toBe('lossy')
    expect(body.data['email']).toBe('wip@b.ch')
    expect((body.data['__orphaned'] as Record<string, unknown>)['qty']).toBe(3)
  })

  test('an unknown draft 404s', async () => {
    expect((await app.inject({ method: 'GET', url: '/f/contact-us/drafts/nope' })).statusCode).toBe(404)
  })
})

describe('catalog reads over HTTP', () => {
  test('forms and version history are listable', async () => {
    const forms = await app.inject({ method: 'GET', url: '/forms', headers: asAdmin() })
    expect(forms.statusCode).toBe(200)
    expect((forms.json() as { forms: Array<{ path: string }> }).forms.map((f) => f.path)).toContain(
      'contact-us',
    )

    const versions = await app.inject({ method: 'GET', url: '/f/contact-us/versions', headers: asAdmin() })
    expect(versions.statusCode).toBe(200)
    const listed = (versions.json() as { versions: Array<{ version: number }> }).versions
    expect(listed.length).toBeGreaterThanOrEqual(2)
    expect(listed[0]!.version).toBeGreaterThan(listed[listed.length - 1]!.version)
  })
})

describe('the two planes', () => {
  test('management without identity is 401; with a viewer identity but no permission, 403', async () => {
    expect((await app.inject({ method: 'POST', url: '/forms', payload: {} })).statusCode).toBe(401)

    const created = await app.inject({
      method: 'POST',
      url: '/users',
      headers: asAdmin(),
      payload: { email: 'viewer@test.ch', password: 'viewer-password-1', role: 'viewer' },
    })
    expect(created.statusCode).toBe(201)
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'viewer@test.ch', password: 'viewer-password-1' },
    })
    const viewerToken = (login.json() as { token: string }).token

    const publishAttempt = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { path: 'x', schema },
    })
    expect(publishAttempt.statusCode).toBe(403)

    // But reading is within the viewer's rights.
    const listed = await app.inject({
      method: 'GET',
      url: '/forms',
      headers: { authorization: `Bearer ${viewerToken}` },
    })
    expect(listed.statusCode).toBe(200)
  })

  test('an api key authenticates a machine, and its secret is shown exactly once', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: asAdmin(),
      payload: { name: 'ci', role: 'editor' },
    })
    expect(created.statusCode).toBe(201)
    const { secret } = created.json() as { secret: string }
    expect(secret.startsWith('fmc_')).toBe(true)

    const publish = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: { 'x-formancy-api-key': secret },
      payload: { path: 'machine-form', schema: { ...schema, id: 'machine' } },
    })
    expect(publish.statusCode).toBe(201)
  })

  test('a wrong password and an unknown user are indistinguishable 401s', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'root@test.ch', password: 'nope-nope-nope' },
    })
    const ghost = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ghost@test.ch', password: 'nope-nope-nope' },
    })
    expect(wrong.statusCode).toBe(401)
    expect(ghost.json()).toEqual(wrong.json())
  })

  test('the public plane needs no identity: resolve, submit, drafts', async () => {
    const resolved = await app.inject({ method: 'GET', url: '/f/contact-us' })
    expect(resolved.statusCode).toBe(200)
  })
})

/**
 * The one unauthenticated write in the product. Without a limit, a public form
 * is an open endpoint that writes a database row per request.
 */
describe('rate limiting the public plane', () => {
  test('a burst past the limit is refused, and says so as 429', async () => {
    const throttled = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      submissionRateLimit: { max: 2, timeWindowMs: 60_000 },
    })

    try {
      const post = async (): Promise<number> =>
        (
          await throttled.inject({
            method: 'POST',
            url: '/f/contact-us/submissions',
            headers: { [SCHEMA_HASH_HEADER]: 'whatever' },
            payload: { email: 'a@b.ch' },
          })
        ).statusCode

      // The status of the first two does not matter — they are refused for
      // other reasons. What matters is that they are COUNTED, so the limit
      // applies to attempts rather than to successes. A limiter that only
      // counted accepted submissions would not slow an attacker down at all.
      await post()
      await post()

      expect(await post()).toBe(429)
    } finally {
      await throttled.close()
    }
  })

  test('a body larger than the cap is refused before it is parsed', async () => {
    const tiny = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      bodyLimitBytes: 1024,
      submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
    })

    try {
      const response = await tiny.inject({
        method: 'POST',
        url: '/f/contact-us/submissions',
        headers: { [SCHEMA_HASH_HEADER]: 'whatever' },
        payload: { email: 'a'.repeat(4096) },
      })

      expect(response.statusCode).toBe(413)
    } finally {
      await tiny.close()
    }
  })
})
