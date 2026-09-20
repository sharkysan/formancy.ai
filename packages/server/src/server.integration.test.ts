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
  specVersion: '0',
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

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  sql = postgres(container.getConnectionUri())
  await bootstrapSchema(sql)
  app = createApp(createPostgresStorage(sql))
}, 180_000)

afterAll(async () => {
  await app?.close()
  await sql?.end()
  await container?.stop()
})

describe('the walking skeleton, end to end', () => {
  let schemaHash = ''

  test('publishing a form yields version 1 and its hash', async () => {
    const response = await app.inject({ method: 'POST', url: '/forms', payload: { path: 'contact-us', schema } })

    expect(response.statusCode).toBe(201)
    const body = response.json() as { version: number; schemaHash: string }
    expect(body.version).toBe(1)
    expect(body.schemaHash).toMatch(/^[0-9a-f]{64}$/)
    schemaHash = body.schemaHash
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
    const response = await app.inject({ method: 'POST', url: '/forms', payload: { path: 'contact-us', schema } })
    expect((response.json() as { version: number }).version).toBe(1)
  })

  test('publishing a changed schema bumps the version, and the old hash now 409s', async () => {
    const changed = { ...schema, title: 'Contact us please' }
    const publish = await app.inject({ method: 'POST', url: '/forms', payload: { path: 'contact-us', schema: changed } })
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
    const response = await app.inject({ method: 'POST', url: '/forms', payload: { path: 'cyclic-form', schema: cyclic } })

    expect(response.statusCode).toBe(422)
    expect(await app.inject({ method: 'GET', url: '/f/cyclic-form' }).then((r) => r.statusCode)).toBe(404)
  })
})

describe('listing and export', () => {
  test('the submissions list is newest first and version-tagged', async () => {
    const response = await app.inject({ method: 'GET', url: '/f/contact-us/submissions' })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { submissions: Array<{ version: number; data: unknown }> }
    expect(body.submissions.length).toBeGreaterThanOrEqual(2)
    expect(body.submissions[0]!.version).toBeGreaterThanOrEqual(1)
  })

  test('the CSV export unions columns across the two published versions', async () => {
    const response = await app.inject({ method: 'GET', url: '/f/contact-us/submissions/export.csv' })

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
    expect((await app.inject({ method: 'GET', url: '/f/ghost/submissions' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/f/ghost/submissions/export.csv' })).statusCode).toBe(404)
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
    const publish = await app.inject({ method: 'POST', url: '/forms', payload: { path: 'contact-us', schema: evolved } })
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
