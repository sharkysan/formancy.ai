import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { FormSchema } from '@formancy/spec'
import { bootstrapSchema } from './db.js'
import { solveChallenge } from '@formancy/server-core'
import { createApp, SCHEMA_HASH_HEADER } from './app.js'
import { createPostgresStorage } from './postgres-storage.js'
import type { FileStore } from './file-store.js'

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

/**
 * A file store in memory. What is under test here is the lifecycle and the
 * transaction, not the filesystem; the part that touches a disk has its own
 * tests.
 */
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
    loginRateLimit: { max: 10_000, timeWindowMs: 60_000 },
    fileStore,
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
  /** Start one and keep the key, which is now the only way in. */
  const start = async (): Promise<{ draftId: string; token: string }> => {
    const created = await app.inject({ method: 'POST', url: '/f/contact-us/drafts' })
    expect(created.statusCode).toBe(201)
    return created.json() as { draftId: string; token: string }
  }

  test('without the token, a draft can be neither read nor written', async () => {
    const { draftId, token } = await start()
    await app.inject({
      method: 'PUT',
      url: `/f/contact-us/drafts/${draftId}`,
      headers: { 'x-formancy-draft-token': token },
      payload: { email: 'private@b.ch' },
    })

    // This is the hole that was here: both routes were unauthenticated and the
    // id came from the caller, so knowing or guessing one was enough to read a
    // stranger's part-filled form and to overwrite it.
    const readNaked = await app.inject({ method: 'GET', url: `/f/contact-us/drafts/${draftId}` })
    expect(readNaked.statusCode).toBe(401)

    const writeNaked = await app.inject({
      method: 'PUT',
      url: `/f/contact-us/drafts/${draftId}`,
      payload: { email: 'attacker@b.ch' },
    })
    expect(writeNaked.statusCode).toBe(401)

    // And the answers are untouched.
    const mine = await app.inject({
      method: 'GET',
      url: `/f/contact-us/drafts/${draftId}`,
      headers: { 'x-formancy-draft-token': token },
    })
    expect((mine.json() as { data: Record<string, unknown> }).data['email']).toBe('private@b.ch')
  })

  test('a wrong token is answered like a draft that is not there', async () => {
    const { draftId } = await start()

    const wrong = await app.inject({
      method: 'GET',
      url: `/f/contact-us/drafts/${draftId}`,
      headers: { 'x-formancy-draft-token': 'deadbeef' },
    })

    // 404 rather than 403: answering differently would confirm which ids exist,
    // which is the enumeration this closed.
    expect(wrong.statusCode).toBe(404)
  })

  test("one draft's token does not open another", async () => {
    const mine = await start()
    const theirs = await start()

    const crossed = await app.inject({
      method: 'GET',
      url: `/f/contact-us/drafts/${theirs.draftId}`,
      headers: { 'x-formancy-draft-token': mine.token },
    })

    // A token that opened any draft would make one leaked token a key to all of
    // them, which is the same hole wearing a signature.
    expect(crossed.statusCode).toBe(404)
  })

  test('autosave, republish, resume: the draft migrates lazily with a report', async () => {
    const { draftId, token } = await start()
    const put = await app.inject({
      method: 'PUT',
      url: `/f/contact-us/drafts/${draftId}`,
      headers: { 'x-formancy-draft-token': token },
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

    const resumed = await app.inject({
      method: 'GET',
      url: `/f/contact-us/drafts/${draftId}`,
      headers: { 'x-formancy-draft-token': token },
    })
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
    const naked = await app.inject({ method: 'GET', url: '/f/contact-us/drafts/nope' })
    // No token at all is 401: the request cannot be judged, let alone answered.
    expect(naked.statusCode).toBe(401)

    const withToken = await app.inject({
      method: 'GET',
      url: '/f/contact-us/drafts/nope',
      headers: { 'x-formancy-draft-token': 'anything' },
    })
    expect(withToken.statusCode).toBe(404)
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

  test('the public plane needs no account, which is not the same as no key', async () => {
    const resolved = await app.inject({ method: 'GET', url: '/f/contact-us' })
    expect(resolved.statusCode).toBe(200)

    // Drafts need no IDENTITY either -- there is no account behind an anonymous
    // draft -- but they do need the key the server handed out when the draft was
    // started. The two are different things, and the old title here said
    // "drafts" in a way that read as "drafts need nothing".
    const started = await app.inject({ method: 'POST', url: '/f/contact-us/drafts' })
    expect(started.statusCode).toBe(201)
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

  test('login is limited too, because a wrong guess costs a full argon2 verification', async () => {
    const throttled = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      loginRateLimit: { max: 2, timeWindowMs: 60_000 },
    })

    try {
      const attempt = async (): Promise<number> =>
        (
          await throttled.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'nobody@test.ch', password: 'wrong-password-here' },
          })
        ).statusCode

      expect(await attempt()).toBe(401)
      expect(await attempt()).toBe(401)
      // Enumeration resistance means every wrong guess costs real CPU, so an
      // unlimited endpoint is an unlimited invitation to spend it.
      expect(await attempt()).toBe(429)
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

/**
 * The transactional outbox, against a real database.
 *
 * This is the requirement that chose Postgres over MongoDB
 * (docs/decisions/0024-postgres-over-mongodb.md): the submission and the
 * deliveries it triggers commit together or not at all. In-memory storage can
 * imitate that; only real SQL can prove it.
 */
describe('the webhook outbox', () => {
  test('a delivery is queued by the same transaction that stores the submission', async () => {
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'hooked', schema: { ...schema, id: 'hooked' } },
    })
    const hash = (published.json() as { schemaHash: string }).schemaHash

    const form = await sql`SELECT id FROM forms WHERE path = 'hooked'`
    await sql`
      INSERT INTO webhooks (id, form_id, url, secret)
      VALUES (gen_random_uuid(), ${form[0]!['id'] as string}, 'https://example.ch/hook', 'whsec_x')`

    await app.inject({
      method: 'PUT',
      url: '/f/hooked/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })

    const submitted = await app.inject({
      method: 'POST',
      url: '/f/hooked/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: { email: 'a@b.ch' },
    })
    expect(submitted.statusCode).toBe(201)

    const queued = await sql`SELECT state, attempt, body FROM deliveries`
    expect(queued).toHaveLength(1)
    expect(queued[0]!['state']).toBe('pending')
    // The CANONICAL value, not the request body: a receiver sees what was
    // stored, with computed fields recomputed and hidden branches stripped.
    expect(String(queued[0]!['body'])).toContain('a@b.ch')
  })

  test('no webhook, no outbox row — the submission still lands', async () => {
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'unhooked', schema: { ...schema, id: 'unhooked' } },
    })
    const hash = (published.json() as { schemaHash: string }).schemaHash
    await app.inject({
      method: 'PUT',
      url: '/f/unhooked/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })

    const before = await sql`SELECT count(*)::int AS n FROM deliveries`
    await app.inject({
      method: 'POST',
      url: '/f/unhooked/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: { email: 'c@d.ch' },
    })
    const after = await sql`SELECT count(*)::int AS n FROM deliveries`

    expect(after[0]!['n']).toBe(before[0]!['n'])
  })

  test('a delivery cannot outlive the submission it describes', async () => {
    const form = await sql`SELECT id FROM forms WHERE path = 'hooked'`
    const submission = await sql`
      SELECT id FROM submissions WHERE form_id = ${form[0]!['id'] as string} LIMIT 1`

    // ON DELETE RESTRICT: the delivery is the record that something was sent
    // about this submission, and deleting the submission must not quietly
    // erase it.
    await expect(
      sql`DELETE FROM submissions WHERE id = ${submission[0]!['id'] as string}`,
    ).rejects.toThrow()
  })
})


/**
 * The file lifecycle against real SQL.
 *
 * The claim is a transaction and the race is a race, so both need a database
 * that behaves like one. Two concurrent submissions naming the same file both
 * pass the check made outside the transaction; only the UPDATE can decide
 * which of them is right, and only Postgres can show that it does.
 */
describe('uploaded files', () => {
  const withFiles: FormSchema = {
    specVersion: '2',
    id: 'claim',
    title: 'Claim',
    model: {
      fields: [
        { key: 'reference', type: 'text', label: 'Reference', required: true },
        { key: 'evidence', type: 'file', label: 'Evidence', accept: ['application/pdf'] },
      ],
    },
  }

  let hash = ''

  beforeAll(async () => {
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'claim', schema: withFiles },
    })
    hash = (published.json() as { schemaHash: string }).schemaHash
    const opened = await app.inject({
      method: 'PUT',
      url: '/f/claim/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })
    expect(opened.statusCode).toBe(204)
  })

  /** Offer, then upload. Returns what a submission would reference. */
  async function upload(
    name = 'report.pdf',
    body = Buffer.from('%PDF-1.4 pretend'),
  ): Promise<Record<string, unknown>> {
    const offered = await app.inject({
      method: 'POST',
      url: '/f/claim/files',
      payload: { field: 'evidence', name, size: body.byteLength, contentType: 'application/pdf' },
    })
    expect(offered.statusCode).toBe(201)
    const file = offered.json() as { id: string; uploadUrl: string }

    const put = await app.inject({
      method: 'PUT',
      url: file.uploadUrl,
      headers: { 'content-type': 'application/pdf' },
      payload: body,
    })
    expect(put.statusCode).toBe(204)
    return file as unknown as Record<string, unknown>
  }

  test('a file is offered, uploaded and then claimed by a submission', async () => {
    const file = await upload()

    const submitted = await app.inject({
      method: 'POST',
      url: '/f/claim/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: { reference: 'A-1', evidence: [file] },
    })

    expect(submitted.statusCode).toBe(201)
    const id = file['id'] as string
    const rows = await sql`SELECT state, submission_id FROM files WHERE id = ${id}`
    expect(rows[0]?.['state']).toBe('claimed')
    expect(rows[0]?.['submission_id']).toBe((submitted.json() as { id: string }).id)
  })

  test('a submission naming a file nobody uploaded is refused, and stores nothing', async () => {
    const before = await sql`SELECT count(*)::int AS n FROM submissions`

    const submitted = await app.inject({
      method: 'POST',
      url: '/f/claim/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: { reference: 'A-2', evidence: [{ id: '00000000-0000-4000-8000-000000000000' }] },
    })

    expect(submitted.statusCode).toBe(422)
    const after = await sql`SELECT count(*)::int AS n FROM submissions`
    expect(after[0]?.['n']).toBe(before[0]?.['n'])
  })

  test('one file, one submission: the second one loses and rolls back', async () => {
    const file = await upload()
    const send = (reference: string) =>
      app.inject({
        method: 'POST',
        url: '/f/claim/submissions',
        headers: { [SCHEMA_HASH_HEADER]: hash },
        payload: { reference, evidence: [file] },
      })

    const [first, second] = await Promise.all([send('B-1'), send('B-2')])

    // Exactly one. The check outside the transaction passes for both, and the
    // UPDATE inside it is what decides - which is why this needs a real
    // database rather than a stub that cannot race.
    const accepted = [first, second].filter((reply) => reply.statusCode === 201)
    expect(accepted).toHaveLength(1)

    const id = file['id'] as string
    const rows = await sql`SELECT submission_id FROM files WHERE id = ${id}`
    expect(rows[0]?.['submission_id']).toBe((accepted[0]!.json() as { id: string }).id)
  })

  test('the bytes come back as an attachment, never inline', async () => {
    const file = await upload('notes.pdf')

    const downloaded = await app.inject({
      method: 'GET',
      url: `/f/claim/files/${file['id'] as string}`,
      headers: asAdmin(),
    })

    expect(downloaded.statusCode).toBe(200)
    // Stored XSS through an uploaded file is the most exploited vulnerability
    // in this product category, and a single-container deployment has no
    // second hostname to serve from. Forcing a download is the accommodation.
    expect(downloaded.headers['content-disposition']).toContain('attachment')
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff')
    expect(String(downloaded.headers['content-type'])).toContain('application/octet-stream')
  })

  test('the bytes are not public, even when the form is', async () => {
    const file = await upload()

    const anonymous = await app.inject({
      method: 'GET',
      url: `/f/claim/files/${file['id'] as string}`,
    })

    // Anybody may submit to this form. That is not the same as reading what
    // everybody else attached to it.
    expect(anonymous.statusCode).toBe(401)
  })

  test('an upload of a different size than was offered is refused', async () => {
    const offered = await app.inject({
      method: 'POST',
      url: '/f/claim/files',
      payload: { field: 'evidence', name: 'a.pdf', size: 10, contentType: 'application/pdf' },
    })
    const file = offered.json() as { uploadUrl: string }

    const put = await app.inject({
      method: 'PUT',
      url: file.uploadUrl,
      headers: { 'content-type': 'application/pdf' },
      payload: Buffer.alloc(5000),
    })

    // The offer's size is what was checked against the field's limit, so
    // accepting a different number of bytes would make that check a
    // suggestion.
    expect(put.statusCode).toBe(400)
  })

  test('a type the field does not accept is refused before any bytes are sent', async () => {
    const offered = await app.inject({
      method: 'POST',
      url: '/f/claim/files',
      payload: {
        field: 'evidence',
        name: 'a.exe',
        size: 10,
        contentType: 'application/x-msdownload',
      },
    })

    expect(offered.statusCode).toBe(400)
    expect((offered.json() as { error: string }).error).toBe('not_accepted')
  })
})


/**
 * The audit log, against real SQL.
 *
 * Two of these need a real database and cannot be faked: that the row commits
 * with the submission rather than beside it, and that the table refuses to be
 * rewritten. The second is a trigger, so only Postgres can demonstrate it.
 */
describe('the audit log', () => {
  const audited: FormSchema = {
    specVersion: '2',
    id: 'audited',
    title: 'Audited',
    model: { fields: [{ key: 'note', type: 'text', label: 'Note', required: true }] },
  }

  let hash = ''

  beforeAll(async () => {
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'audited', schema: audited },
    })
    hash = (published.json() as { schemaHash: string }).schemaHash
    await app.inject({
      method: 'PUT',
      url: '/f/audited/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })
  })

  test('publishing and opening a form are both recorded', async () => {
    const rows = await sql`
      SELECT action, subject FROM audit_log
      WHERE subject = 'audited' AND action IN ('form.published', 'form.access.changed')`

    const actions = rows.map((row) => row['action'])
    expect(actions).toContain('form.published')
    // The event a security review looks for first.
    expect(actions).toContain('form.access.changed')
  })

  test('a submission and its audit row commit together', async () => {
    const submitted = await app.inject({
      method: 'POST',
      url: '/f/audited/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: { note: 'hello' },
    })
    expect(submitted.statusCode).toBe(201)
    const id = (submitted.json() as { id: string }).id

    const rows = await sql`
      SELECT detail FROM audit_log WHERE action = 'submission.created'
      AND detail->>'submissionId' = ${id}`
    expect(rows).toHaveLength(1)
  })

  test('a refused submission leaves no row saying it happened', async () => {
    const before = await sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'submission.created'`

    // `note` is required.
    const refused = await app.inject({
      method: 'POST',
      url: '/f/audited/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: {},
    })

    expect(refused.statusCode).toBe(422)
    const after = await sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'submission.created'`
    expect(after[0]?.['n']).toBe(before[0]?.['n'])
  })

  test('reading and exporting submissions are recorded, with counts and not answers', async () => {
    await app.inject({ method: 'GET', url: '/f/audited/submissions', headers: asAdmin() })
    await app.inject({
      method: 'GET',
      url: '/f/audited/submissions/export.csv',
      headers: asAdmin(),
    })

    const rows = await sql`
      SELECT action, detail FROM audit_log
      WHERE subject = 'audited' AND action IN ('submission.read', 'submission.exported')`

    const actions = rows.map((row) => row['action'])
    // The question a data protection officer asks, and the one an audit log
    // of mutations alone cannot answer.
    expect(actions).toContain('submission.read')
    expect(actions).toContain('submission.exported')
    // Counts and sizes. Never what anybody wrote.
    expect(JSON.stringify(rows)).not.toContain('hello')
  })

  test('a failed login is recorded as well as a successful one', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'root@example.com', password: 'wrong-on-purpose' },
    })

    const rows = await sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'auth.login.failed'`
    // A hundred failures then one success is the shape of an attack, and
    // recording only the success hides it.
    expect(rows[0]?.['n']).toBeGreaterThan(0)
  })

  test('the password is nowhere in the log', async () => {
    const rows = await sql`SELECT * FROM audit_log WHERE action LIKE 'auth.login%'`

    expect(JSON.stringify(rows)).not.toContain('wrong-on-purpose')
  })

  test('a publish and its audit row commit together', async () => {
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: {
        path: 'atomic',
        schema: {
          specVersion: '2',
          id: 'atomic',
          title: 'Atomic',
          model: { fields: [{ key: 'a', type: 'text', label: 'A' }] },
        },
      },
    })
    expect(published.statusCode).toBe(201)

    // The form, its version, the pointer that makes it current and the audit
    // row: one commit. Before, these were three calls, and a form whose
    // pointer was never set is present in the list and 404s when opened.
    const rows = await sql`
      SELECT f.current_version_id, v.id AS version_id, a.id AS audit_id
      FROM forms f
      JOIN form_versions v ON v.form_id = f.id
      LEFT JOIN audit_log a ON a.subject = f.path AND a.action = 'form.published'
      WHERE f.path = 'atomic'`

    expect(rows).toHaveLength(1)
    expect(rows[0]?.['current_version_id']).toBe(rows[0]?.['version_id'])
    expect(rows[0]?.['audit_id']).not.toBeNull()
  })

  test('no form is left pointing at nothing', async () => {
    // The specific corruption the transaction prevents, asserted across every
    // form the suite has published rather than one.
    const orphans = await sql`SELECT path FROM forms WHERE current_version_id IS NULL`
    expect(orphans).toHaveLength(0)
  })

  test('the table refuses to be rewritten', async () => {
    // Append-only in the database rather than by application discipline, for
    // the same reason version rows are immutable there: the one moment it
    // matters is the moment somebody has a reason to edit it.
    await expect(
      sql`UPDATE audit_log SET action = 'auth.login' WHERE action = 'form.published'`,
    ).rejects.toThrow(/append-only/)

    await expect(sql`DELETE FROM audit_log`).rejects.toThrow(/append-only/)
  })

  test('and the rows survive the attempt', async () => {
    const rows = await sql`SELECT count(*)::int AS n FROM audit_log`
    expect(rows[0]?.['n']).toBeGreaterThan(0)
  })
})


/**
 * Webhook health and dead letters, over HTTP.
 *
 * The reason the breaker's counters live on the row: a self-hoster has no
 * operations team watching a dashboard, so a destination that has been
 * refusing deliveries since Tuesday has to be answerable from the product.
 */
describe('webhook health', () => {
  let webhookId = ''

  beforeAll(async () => {
    const [form] = await sql`SELECT id FROM forms LIMIT 1`
    webhookId = randomUUID()
    await sql`
      INSERT INTO webhooks (id, form_id, url, secret, consecutive_failures, opened_at)
      VALUES (${webhookId}, ${form!['id']}, 'https://example.ch/hook', 'whsec_x', 4,
              ${'2026-09-25T12:00:00.000Z'}::timestamptz)`
  })

  test('a failing destination is visible, with how long it has been failing', async () => {
    const response = await app.inject({ method: 'GET', url: '/webhooks', headers: asAdmin() })

    expect(response.statusCode).toBe(200)
    const { webhooks } = response.json() as {
      webhooks: { id: string; state: string; consecutiveFailures: number; failingSince: string | null }[]
    }
    const failing = webhooks.find((hook) => hook.id === webhookId)
    expect(failing).toMatchObject({ consecutiveFailures: 4 })
    expect(failing?.failingSince).toBeTruthy()
  })

  test('and the signing secret is not', async () => {
    const response = await app.inject({ method: 'GET', url: '/webhooks', headers: asAdmin() })

    // It is shown on a screen. A secret is not a health indicator.
    expect(response.body).not.toContain('whsec_x')
  })

  test('reading it needs a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/webhooks' })).statusCode).toBe(401)
  })
})

describe('dead letters', () => {
  let deadId = ''
  let webhookId = ''

  beforeAll(async () => {
    const [form] = await sql`SELECT id FROM forms LIMIT 1`
    const [submission] = await sql`SELECT id FROM submissions LIMIT 1`
    webhookId = randomUUID()
    deadId = randomUUID()
    await sql`
      INSERT INTO webhooks (id, form_id, url, secret)
      VALUES (${webhookId}, ${form!['id']}, 'https://example.ch/dead', 'whsec_dead')`
    await sql`
      INSERT INTO deliveries (id, webhook_id, submission_id, event_id, body, attempt, next_attempt_at, state, last_error)
      VALUES (${deadId}, ${webhookId}, ${submission!['id']}, ${randomUUID()},
              '{"secretValue":"do-not-leak"}', 8, now(), 'dead', 'Receiver answered 502.')`
  })

  test('are listed with what went wrong', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/deliveries/dead',
      headers: asAdmin(),
    })

    const { deliveries } = response.json() as { deliveries: { id: string; lastError: string }[] }
    const found = deliveries.find((delivery) => delivery.id === deadId)
    expect(found?.lastError).toContain('502')
  })

  test('without the body, which is the submission in another coat', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/deliveries/dead',
      headers: asAdmin(),
    })

    // This endpoint answers "what failed", not "what was in it".
    expect(response.body).not.toContain('do-not-leak')
  })

  test('replaying one puts it back in the queue and records who did it', async () => {
    const replayed = await app.inject({
      method: 'POST',
      url: `/deliveries/${deadId}/replay`,
      headers: asAdmin(),
    })

    expect(replayed.statusCode).toBe(202)
    const [row] = await sql`SELECT state, attempt FROM deliveries WHERE id = ${deadId}`
    expect(row?.['state']).toBe('pending')
    expect(row?.['attempt']).toBe(0)

    // It sends data to a third party on a person's say-so.
    const audited = await sql`
      SELECT count(*)::int AS n FROM audit_log
      WHERE action = 'delivery.replayed' AND subject = ${deadId}`
    expect(audited[0]?.['n']).toBe(1)
  })

  test('replaying it again is refused, because it is queued now', async () => {
    const again = await app.inject({
      method: 'POST',
      url: `/deliveries/${deadId}/replay`,
      headers: asAdmin(),
    })

    // Replaying a pending delivery would duplicate it.
    expect(again.statusCode).toBe(409)
    expect((again.json() as { error: string }).error).toBe('not_dead')
  })

  test('a delivery that does not exist is a 404, not a 409', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: `/deliveries/${randomUUID()}/replay`,
      headers: asAdmin(),
    })

    expect(missing.statusCode).toBe(404)
  })
})


/**
 * The proof-of-work challenge, over HTTP and against real SQL.
 *
 * The spend-once guard needs a database: two requests carrying one solution
 * both pass every stateless check, and only the unique constraint can decide
 * which of them wins. Nothing else in this block could be faked either — the
 * signature is the server's, and a challenge minted by a stub would prove
 * nothing about the one this server mints.
 */
describe('the proof-of-work challenge', () => {
  const SECRET = 'challenge-signing-key-of-real-length'
  let guarded: FastifyInstance
  let hash = ''

  beforeAll(async () => {
    guarded = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
      challengeSecret: SECRET,
    })

    // Its own form, publicly submittable: the challenge only applies to a
    // visitor who is not signed in, so the form has to admit one.
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: {
        path: 'challenged',
        schema: {
          specVersion: '2',
          id: 'challenged',
          title: 'Challenged',
          model: { fields: [{ key: 'email', type: 'text', label: 'Email', required: true }] },
        },
      },
    })
    hash = (published.json() as { schemaHash: string }).schemaHash
    await app.inject({
      method: 'PUT',
      url: '/f/challenged/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })
  })

  afterAll(async () => {
    await guarded.close()
  })

  /** Ask for a puzzle, solve it, and encode it the way a client would. */
  async function solved(): Promise<string> {
    const minted = await guarded.inject({ method: 'GET', url: '/f/challenged/challenge' })
    expect(minted.statusCode).toBe(200)
    const challenge = minted.json() as {
      salt: string
      challenge: string
      maxNumber: number
      signature: string
    }
    const number = await solveChallenge(challenge)
    expect(number).toBeTypeOf('number')
    return Buffer.from(JSON.stringify({ ...challenge, number })).toString('base64')
  }

  const submit = (header?: string) =>
    guarded.inject({
      method: 'POST',
      url: '/f/challenged/submissions',
      headers: {
        [SCHEMA_HASH_HEADER]: hash,
        ...(header === undefined ? {} : { 'x-formancy-challenge': header }),
      },
      payload: { email: 'ada@example.ch' },
    })

  test('an anonymous submission without one is refused, and told how to get one', async () => {
    const response = await submit()

    expect(response.statusCode).toBe(400)
    const body = response.json() as { error: string; message: string }
    expect(body.error).toBe('challenge_required')
    // A refusal that does not say what to do next is a dead end.
    expect(body.message).toContain('/challenge')
  })

  test('a solved one is accepted', async () => {
    const response = await submit(await solved())

    expect(response.statusCode).toBe(201)
  })

  test('the same solution cannot be used twice', async () => {
    const header = await solved()
    expect((await submit(header)).statusCode).toBe(201)

    const again = await submit(header)

    // A correct solution stays correct, so nothing stateless can refuse this.
    // Only the record of what has been spent can.
    expect(again.statusCode).toBe(400)
    expect((again.json() as { error: string }).error).toBe('challenge_spent')
  })

  test('two requests racing one solution: exactly one wins', async () => {
    const header = await solved()

    const [first, second] = await Promise.all([submit(header), submit(header)])

    // Both pass every stateless check. The unique constraint is what
    // adjudicates, which is why this test needs a real database.
    const accepted = [first, second].filter((response) => response.statusCode === 201)
    expect(accepted).toHaveLength(1)
  })

  test('a solution nobody minted is refused as forged', async () => {
    const invented = Buffer.from(
      JSON.stringify({
        salt: `deadbeef.${String(Math.floor(Date.now() / 1000) + 600)}`,
        number: 1,
        challenge: 'not-the-hash',
        signature: 'f'.repeat(64),
      }),
    ).toString('base64')

    const response = await submit(invented)

    expect(response.statusCode).toBe(400)
    // Refused for the arithmetic before the key is consulted.
    expect((response.json() as { error: string }).error).toMatch(/challenge_(wrong|forged)/)
  })

  test('a header that is not base64 JSON is refused rather than crashing', async () => {
    const response = await submit('not base64 at all !!')

    expect(response.statusCode).toBe(400)
    expect((response.json() as { error: string }).error).toBe('challenge_malformed')
  })

  test('a signed-in submitter is not asked to solve anything', async () => {
    // They have already paid a cost the puzzle stands in for. Asking as well
    // would be ceremony.
    const response = await guarded.inject({
      method: 'POST',
      url: '/f/challenged/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash, ...asAdmin() },
      payload: { email: 'ada@example.ch' },
    })

    expect(response.statusCode).toBe(201)
  })

  test('the deployment without a secret does not ask, and says so', async () => {
    // `app` is built without one. Absent is a supported state rather than a
    // broken one, and the route says 404 rather than failing.
    const minted = await app.inject({ method: 'GET', url: '/f/challenged/challenge' })
    expect(minted.statusCode).toBe(404)
    expect((minted.json() as { error: string }).error).toBe('challenge_not_enabled')
  })
})
