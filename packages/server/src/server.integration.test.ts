import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { FastifyInstance, HTTPMethods, InjectOptions, LightMyRequestResponse } from 'fastify'
import type { FormSchema } from '@formancy/spec'
import { bootstrapSchema } from './db.js'
import { solveChallenge } from '@formancy/server-core'
import type { ScanVerdict } from '@formancy/server-core'
import { createApp, SCHEMA_HASH_HEADER } from './app.js'
import { createPostgresStorage } from './postgres-storage.js'
import type { FileStore } from './file-store.js'
import { DEFAULT_MAX_FILE_BYTES, LARGEST_MAX_FILE_BYTES } from './upload-settings.js'
import { LOG_FIELDS } from './server-log.js'

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
/** Set by a case that needs a write held open: the next `put` waits for it. */
let nextWrite: { reached: () => void; finished: Promise<void> } | undefined
const fileStore: FileStore = {
  put: async (key, body) => {
    const held = nextWrite
    nextWrite = undefined
    if (held !== undefined) {
      held.reached()
      await held.finished
    }
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

  test('writing a draft is limited too, because it is also an unauthenticated write', async () => {
    const throttled = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      submissionRateLimit: { max: 2, timeWindowMs: 60_000 },
    })

    try {
      const started = await throttled.inject({ method: 'POST', url: '/f/contact-us/drafts' })
      const { draftId, token } = started.json() as { draftId: string; token: string }

      const save = async (): Promise<number> =>
        (
          await throttled.inject({
            method: 'PUT',
            url: `/f/contact-us/drafts/${draftId}`,
            headers: { 'x-formancy-draft-token': token },
            payload: { email: 'a@b.ch' },
          })
        ).statusCode

      await save()
      await save()

      // A draft write is a database row per request, and the route is reachable
      // without an account. The submission route was described as "the one
      // unauthenticated write in the product", which stopped being true when
      // drafts were exposed on the public plane and nobody updated the limit.
      expect(await save()).toBe(429)
    } finally {
      await throttled.close()
    }
  })

  test('reading a draft is limited, because that is where a token would be guessed', async () => {
    const throttled = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      submissionRateLimit: { max: 2, timeWindowMs: 60_000 },
    })

    try {
      const started = await throttled.inject({ method: 'POST', url: '/f/contact-us/drafts' })
      const { draftId } = started.json() as { draftId: string }

      const guess = async (): Promise<number> =>
        (
          await throttled.inject({
            method: 'GET',
            url: `/f/contact-us/drafts/${draftId}`,
            headers: { 'x-formancy-draft-token': 'a-wrong-guess' },
          })
        ).statusCode

      await guess()
      await guess()

      // The write was limited and the read was not, which is the wrong way
      // round: the read is where somebody would try tokens one after another.
      // An HMAC is not realistically guessable, but a limit that stops at the
      // write and leaves the guess surface open is not a position worth
      // defending.
      expect(await guess()).toBe(429)
    } finally {
      await throttled.close()
    }
  })

  test('minting a challenge is limited, so demanding them is not free', async () => {
    const throttled = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      challengeSecret: 'a-challenge-secret-of-adequate-length',
      submissionRateLimit: { max: 2, timeWindowMs: 60_000 },
    })

    try {
      const mint = async (): Promise<number> =>
        (await throttled.inject({ method: 'GET', url: '/f/contact-us/challenge' })).statusCode

      await mint()
      await mint()

      // One per submission attempt is the legitimate rate, so the submission
      // limit is the right one. The point of a proof of work is that the
      // attacker pays; handing out unlimited puzzles for free is the one part
      // of it that costs us instead.
      expect(await mint()).toBe(429)
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
 * Every file type arrives as bytes, and every size is a whole number of them.
 *
 * Fastify parses `text/plain` and `application/json` itself, and the catch-all byte parser
 * only ever saw the types it had no parser for — so a `.txt` or `.json` file reached the PUT
 * as a string or an object and was answered `no_body`, whatever the form's `accept` said.
 */
describe('a file of any type arrives as bytes', () => {
  const anyType: FormSchema = {
    specVersion: '2',
    id: 'notes',
    title: 'Notes',
    model: {
      fields: [{ key: 'notes', type: 'file', label: 'Notes', accept: ['text/plain', 'application/json'] }],
    },
  }

  beforeAll(async () => {
    await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'notes', schema: anyType } })
    const opened = await app.inject({
      method: 'PUT',
      url: '/f/notes/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })
    expect(opened.statusCode).toBe(204)
  })

  /**
   * Offer it, send it as the browser would — under its own type, or `sentAs` when a client
   * adds a parameter — and read it back.
   */
  async function roundTrip(name: string, contentType: string, body: Buffer, sentAs = contentType) {
    const offered = await app.inject({
      method: 'POST',
      url: '/f/notes/files',
      payload: { field: 'notes', name, size: body.byteLength, contentType },
    })
    expect(offered.statusCode).toBe(201)
    const file = offered.json() as { id: string; uploadUrl: string; storageKey: string }
    const put = await app.inject({
      method: 'PUT',
      url: file.uploadUrl,
      headers: { 'content-type': sentAs },
      payload: body,
    })
    const downloaded = await app.inject({
      method: 'GET',
      url: `/f/notes/files/${file.id}`,
      headers: asAdmin(),
    })
    return { put, file, downloaded }
  }

  test('a .txt file is kept byte for byte, not parsed as text and refused as no body', async () => {
    // A trailing newline and a non-ASCII letter: a parser that decoded and re-encoded the
    // text would be caught by either.
    const body = Buffer.from('Grüezi\nfrom a text file\n', 'utf8')

    const { put, file, downloaded } = await roundTrip('notes.txt', 'text/plain', body)

    expect(put.statusCode, put.body).toBe(204)
    expect(bytes.get(file.storageKey)).toEqual(body)
    expect(downloaded.rawPayload).toEqual(body)
  })

  test('so is one sent with a charset, which names the same parser', async () => {
    // Fastify looks a parser up by the media type without its parameters, so a charset
    // reached the text parser just the same.
    const body = Buffer.from('mit Zeichensatz\n', 'utf8')

    const { put, file } = await roundTrip('charset.txt', 'text/plain', body, 'text/plain; charset=utf-8')

    expect(put.statusCode, put.body).toBe(204)
    expect(bytes.get(file.storageKey)).toEqual(body)
  })

  test('a .json file is kept byte for byte, not parsed as the request', async () => {
    // Whitespace JSON.parse would discard, and an object Fastify would otherwise have
    // handed the route in place of the bytes.
    const body = Buffer.from('{ "answer" : 42,\n  "kept": "as written" }\n', 'utf8')

    const { put, file, downloaded } = await roundTrip('answers.json', 'application/json', body)

    expect(put.statusCode, put.body).toBe(204)
    expect(bytes.get(file.storageKey)).toEqual(body)
    expect(downloaded.rawPayload).toEqual(body)
  })

  test('a .json file that is not valid JSON is kept too: it is a file, not a request', async () => {
    // Fastify's JSON parser answers malformed JSON with its own 400 before the route runs.
    const body = Buffer.from('{ truncated', 'utf8')

    const { put, file } = await roundTrip('broken.json', 'application/json', body)

    expect(put.statusCode, put.body).toBe(204)
    expect(bytes.get(file.storageKey)).toEqual(body)
  })

  test('the byte parser is the upload route’s alone: a submission sent as bytes is refused', async () => {
    // Registered on the root, the catch-all handed raw bytes to every route — up to the file
    // ceiling, past the request body cap meant to stop a request before it costs memory.
    const submitted = await app.inject({
      method: 'POST',
      url: '/f/notes/submissions',
      headers: { [SCHEMA_HASH_HEADER]: 'any', 'content-type': 'application/octet-stream' },
      payload: Buffer.from('not a submission'),
    })

    expect(submitted.statusCode, submitted.body).toBe(415)
  })

  test.each([
    ['fractional', 1.5],
    ['negative', -1],
    ['beyond a safe integer', Number.MAX_SAFE_INTEGER + 2],
  ])('an offered size that is %s is refused before a row is written', async (_label, size) => {
    // A size is a count of bytes. A fractional one reached an `integer` column and failed
    // there as a 500; a negative one was stored, and no upload could ever match it.
    const before = await sql`SELECT count(*)::int AS n FROM files`

    const offered = await app.inject({
      method: 'POST',
      url: '/f/notes/files',
      payload: { field: 'notes', name: 'a.txt', size, contentType: 'text/plain' },
    })

    expect(offered.statusCode, offered.body).toBe(400)
    expect((offered.json() as { error: string }).error).toBe('invalid_request')
    const after = await sql`SELECT count(*)::int AS n FROM files`
    expect(after[0]?.['n']).toBe(before[0]?.['n'])
  })

  test('a whole size one byte past the deployment’s ceiling is too large, not malformed', async () => {
    // The shape check runs first and must not swallow this one: 413 tells a client the
    // file is the problem, 400 that the request is. The field sets no limit of its own,
    // so only the deployment's default ten megabytes can refuse it.
    const offered = await app.inject({
      method: 'POST',
      url: '/f/notes/files',
      payload: { field: 'notes', name: 'big.txt', size: DEFAULT_MAX_FILE_BYTES + 1, contentType: 'text/plain' },
    })

    expect(offered.statusCode, offered.body).toBe(413)
    expect((offered.json() as { error: string }).error).toBe('too_large')
  })

  test('an empty file is offered and kept: zero is a whole number of bytes', async () => {
    // Non-negative, not positive — an empty text file is a file somebody can have — and
    // its no bytes arrive as an empty buffer rather than as no body at all.
    const { put, file } = await roundTrip('empty.txt', 'text/plain', Buffer.alloc(0))

    expect(put.statusCode, put.body).toBe(204)
    expect(bytes.get(file.storageKey)).toEqual(Buffer.alloc(0))
  })

  test('the ceiling a deployment may set is the largest size the files table can hold', async () => {
    // Read from the database rather than restated: if `files.size` becomes a bigint, this
    // fails and the ceiling in upload-settings.ts can rise with it.
    const [column] = await sql`
      SELECT numeric_precision, numeric_precision_radix
        FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'files' AND column_name = 'size'`
    expect(column?.['numeric_precision_radix']).toBe(2)
    const largest = 2 ** ((column?.['numeric_precision'] as number) - 1) - 1

    expect(LARGEST_MAX_FILE_BYTES).toBe(largest)
  })
})


/**
 * An upload the deployment scans (0131), on an app of its own so the scanner's verdict
 * is the test's to choose. Against real SQL because the claim is what matters: a file
 * the scanner refused must not be claimable by a submission, and that is a row's state.
 */
describe('an upload the deployment scans', () => {
  const scanned: FormSchema = {
    specVersion: '2',
    id: 'scanned',
    title: 'Scanned',
    model: { fields: [{ key: 'evidence', type: 'file', label: 'Evidence' }] },
  }
  let verdict: () => Promise<ScanVerdict>
  const seen: Buffer[] = []
  let scanning: FastifyInstance
  let hash = ''
  /** What the scanning server wrote to its log, line by line. */
  const logged: string[] = []
  const said = (event: string) => logged.map((line) => JSON.parse(line) as { event: string }).filter((line) => line.event === event)

  beforeAll(async () => {
    scanning = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
      fileStore,
      log: { sink: { write: (line: string) => logged.push(line) }, level: 'info' },
      scanner: {
        scan: async (_file, scannedBytes) => {
          seen.push(Buffer.from(scannedBytes))
          return verdict()
        },
      },
    })
    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'scanned', schema: scanned },
    })
    hash = (published.json() as { schemaHash: string }).schemaHash
    await app.inject({ method: 'PUT', url: '/f/scanned/access', headers: asAdmin(), payload: { submit: 'public' } })
  })

  afterAll(async () => {
    await scanning?.close()
  })

  /** Offer, then send the bytes; the reply to the bytes, and the file's row. */
  async function send(body: Buffer) {
    const offered = await scanning.inject({
      method: 'POST',
      url: '/f/scanned/files',
      payload: { field: 'evidence', name: 'a.pdf', size: body.byteLength, contentType: 'application/pdf' },
    })
    const file = offered.json() as { id: string; uploadUrl: string; storageKey: string }
    const put = await scanning.inject({
      method: 'PUT',
      url: file.uploadUrl,
      headers: { 'content-type': 'application/pdf' },
      payload: body,
    })
    return { put, file }
  }

  test('a clean file is kept, and the scanner was shown exactly the bytes that arrived', async () => {
    verdict = async () => ({ clean: true })
    const body = Buffer.from('%PDF-1.4 clean')

    const { put, file } = await send(body)

    expect(put.statusCode, put.body).toBe(204)
    expect(seen.at(-1)).toEqual(body)
    expect(bytes.get(file.storageKey)).toEqual(body)
  })

  test('a file the scanner refuses is not kept, says why, and cannot be claimed', async () => {
    verdict = async () => ({ clean: false, finding: 'Eicar-Test-Signature' })

    const { put, file } = await send(Buffer.from('%PDF-1.4 the scanner says no'))

    expect(put.statusCode).toBe(422)
    expect(put.json()).toMatchObject({ error: 'refused_by_scanner' })
    expect((put.json() as { message: string }).message).toContain('Eicar-Test-Signature')
    // The operator is told a file was refused; which finding is the answer's to say.
    expect(said('upload.refused')).toEqual([expect.objectContaining({ level: 'warn' })])
    // Never in the store, not even until the collector runs.
    expect(bytes.has(file.storageKey)).toBe(false)
    const submitted = await scanning.inject({
      method: 'POST',
      url: '/f/scanned/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: { evidence: [file] },
    })
    expect(submitted.statusCode).toBe(422)
  })

  test('a scanner that cannot be asked keeps nothing either, and says to try again', async () => {
    // Fail closed: the deployment configured a scanner to keep unscanned files out.
    verdict = async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:3310')
    }

    const { put, file } = await send(Buffer.from('%PDF-1.4 unscanned'))

    expect(put.statusCode).toBe(503)
    expect((put.json() as { message: string }).message).toMatch(/Try again/)
    // The client is not told an address, and nor is the log: it says the scanner could not
    // be asked, and the cause's words go nowhere (0168).
    expect(JSON.stringify(put.json())).not.toContain('10.0.0.5')
    expect(said('scanner.unreachable')).toEqual([expect.objectContaining({ level: 'error' })])
    expect(logged.join('')).not.toContain('10.0.0.5')
    expect(bytes.has(file.storageKey)).toBe(false)
  })

  test('and the same bytes sent again once it is back are kept', async () => {
    verdict = async () => {
      throw new Error('timeout')
    }
    const body = Buffer.from('%PDF-1.4 later')
    const { file } = await send(body)
    verdict = async () => ({ clean: true })

    const again = await scanning.inject({
      method: 'PUT',
      url: file.uploadUrl,
      headers: { 'content-type': 'application/pdf' },
      payload: body,
    })

    expect(again.statusCode).toBe(204)
    expect(bytes.get(file.storageKey)).toEqual(body)
  })

  /**
   * One request receives a file's bytes at a time (0153).
   *
   * The PUT reads the row, waits for the scanner, writes the bytes and then the row. It used
   * to write back what it had read with `stored` in it, unconditionally — so a request that
   * read the file before a faster one stored it, and a submission claimed it, put the row
   * back to `stored` with no submission, and wrote its own bytes over the claimed ones. The
   * collector deletes an unclaimed file after a day. The scanner holding the first request
   * open is the window; the doubles below hold it open on purpose.
   */
  describe('one request at a time', () => {
    /** The first scan waits until `open()`; any later one is clean at once. */
    function holdTheFirstScan(): { asked: Promise<void>; open: () => void; scans: () => number } {
      let open = (): void => {}
      let entered = (): void => {}
      const asked = new Promise<void>((resolve) => {
        entered = resolve
      })
      const held = new Promise<ScanVerdict>((resolve) => {
        open = () => resolve({ clean: true })
      })
      let calls = 0
      verdict = () => {
        calls += 1
        if (calls > 1) return Promise.resolve({ clean: true })
        entered()
        return held
      }
      return { asked, open, scans: () => calls }
    }

    /** The next write waits until `finish()`, or throws at `fail()`. */
    function holdTheNextWrite(): {
      reached: Promise<void>
      finish: () => void
      fail: (error: Error) => void
    } {
      let finish = (): void => {}
      let fail = (_error: Error): void => {}
      let reached = (): void => {}
      const entered = new Promise<void>((resolve) => {
        reached = resolve
      })
      const finished = new Promise<void>((resolve, reject) => {
        finish = resolve
        fail = reject
      })
      nextWrite = { reached, finished }
      return { reached: entered, finish, fail }
    }

    async function offer(size: number): Promise<{ id: string; uploadUrl: string; storageKey: string }> {
      const offered = await scanning.inject({
        method: 'POST',
        url: '/f/scanned/files',
        payload: { field: 'evidence', name: 'a.pdf', size, contentType: 'application/pdf' },
      })
      return offered.json() as { id: string; uploadUrl: string; storageKey: string }
    }

    const put = (file: { uploadUrl: string }, body: Buffer, on: FastifyInstance = scanning) =>
      on.inject({
        method: 'PUT',
        url: file.uploadUrl,
        headers: { 'content-type': 'application/pdf' },
        payload: body,
      })

    const submit = (file: { id: string }) =>
      scanning.inject({
        method: 'POST',
        url: '/f/scanned/submissions',
        headers: { [SCHEMA_HASH_HEADER]: hash },
        payload: { evidence: [file] },
      })

    // Two bodies of one length, so both pass the size the offer named.
    const first = Buffer.from('%PDF-1.4 sent first, scanned slowly')
    const second = Buffer.from('%PDF-1.4 sent second, kept at once.')

    afterEach(() => {
      vi.useRealTimers()
    })

    test('a second request while one is receiving is refused as busy, and the first is kept', async () => {
      const file = await offer(first.byteLength)
      const scan = holdTheFirstScan()

      const slow = put(file, first)
      await scan.asked
      const meanwhile = await put(file, second)
      scan.open()
      const kept = await slow

      // Without the lease the second request was stored, and the first then wrote its bytes
      // over it: two 204s for one file, and the client that sent the second was told its
      // bytes were kept when they were not.
      expect(meanwhile.statusCode).toBe(409)
      expect(meanwhile.json()).toMatchObject({ error: 'busy' })
      expect(kept.statusCode).toBe(204)
      expect(bytes.get(file.storageKey)).toEqual(first)
      // Refused before its bytes were scanned: a scan for bytes that cannot be kept is the
      // deployment's clamd time spent on nothing.
      expect(scan.scans()).toBe(1)
    })

    test('without a scanner the write is the window, and a second request is refused as busy', async () => {
      // `app` scans nothing, as a deployment without FORMANCY_CLAMD_HOST does and as 0.2.0
      // and 0.3.0 did. There the unconditional write-back had the write alone to lose in:
      // run on main with the write held open like this, the second request got 204, was
      // claimed, and the first then put the row back to stored with no submission.
      const file = await offer(first.byteLength)
      const write = holdTheNextWrite()

      const slow = put(file, first, app)
      await write.reached
      const meanwhile = await put(file, second, app)
      write.finish()
      const kept = await slow

      expect(meanwhile.statusCode).toBe(409)
      expect(meanwhile.json()).toMatchObject({ error: 'busy' })
      expect(kept.statusCode).toBe(204)
      expect(bytes.get(file.storageKey)).toEqual(first)
    })

    test('a request that outlasts its lease cannot un-claim the file, or replace its bytes', async () => {
      const file = await offer(first.byteLength)
      const scan = holdTheFirstScan()

      const slow = put(file, first)
      await scan.asked
      // The slow request's lease runs out while its scan is still waiting. Only `Date` moves:
      // the database, Fastify and the scanner's promise keep real time.
      vi.setSystemTime(Date.now() + 60 * 60_000)

      const fast = await put(file, second)
      expect(fast.statusCode).toBe(204)
      const submitted = await submit(file)
      expect(submitted.statusCode).toBe(201)

      scan.open()
      const late = await slow

      // The accepted submission still owns its attachment, and it is the bytes it was
      // accepted with. Before, this row read `stored` with no submission — collected a day
      // later — and the store held the slow request's bytes.
      const [row] = await sql`SELECT state, submission_id FROM files WHERE id = ${file.id}`
      expect(row?.['state']).toBe('claimed')
      expect(row?.['submission_id']).toBe((submitted.json() as { id: string }).id)
      expect(bytes.get(file.storageKey)).toEqual(second)
      expect(late.statusCode).toBe(409)
    })

    test('a write that outlasts its lease leaves the row alone, and is the residual', async () => {
      verdict = async () => ({ clean: true })
      const file = await offer(first.byteLength)
      const write = holdTheNextWrite()

      const slow = put(file, first)
      await write.reached
      // Scanned, re-checked and writing — and the write is what runs past the lease.
      vi.setSystemTime(Date.now() + 60 * 60_000)
      const fast = await put(file, second)
      expect(fast.statusCode).toBe(204)
      const submitted = await submit(file)
      expect(submitted.statusCode).toBe(201)

      write.finish()
      const late = await slow

      // The settle is refused, so the row is still the submission's.
      const [row] = await sql`SELECT state, submission_id FROM files WHERE id = ${file.id}`
      expect(row?.['state']).toBe('claimed')
      expect(row?.['submission_id']).toBe((submitted.json() as { id: string }).id)
      expect(late.statusCode).toBe(409)
      // What 0153 accepts, pinned so that closing it is deliberate: the slow write landed
      // after the fast one under the same key, and the store holds bytes the submission was
      // not accepted with. Both were scanned and both were the size offered; a lease bounds
      // how late a write may start, not how long it may take.
      expect(bytes.get(file.storageKey)).toEqual(first)
    })

    test('a write that throws gives the file back, so the retry is not busy', async () => {
      verdict = async () => ({ clean: true })
      const file = await offer(first.byteLength)
      const write = holdTheNextWrite()

      const failing = put(file, first)
      await write.reached
      write.fail(new Error('ENOSPC: no space left on device'))
      expect((await failing).statusCode).toBe(500)

      // Without the release a full disk, once cleared, would still refuse this file as busy
      // for two minutes to whatever sends it again — a proxy's retry, an integrator's
      // uploader; the file field's Try again offers anew — told nothing about why.
      const again = await put(file, first)
      expect(again.statusCode).toBe(204)
      expect(bytes.get(file.storageKey)).toEqual(first)
    })

    /**
     * Giving the file back can fail as well — most likely on the database the request has
     * already failed on. Its error must not stand in for the answer the request had: the
     * lease runs out on its own, and the reply is what says why the bytes were not kept.
     */
    describe('when giving the file back fails', () => {
      let releasing: FastifyInstance
      const released: string[] = []

      beforeAll(async () => {
        releasing = await createApp(
          {
            ...createPostgresStorage(sql),
            releaseFile: () => Promise.reject(new Error('Connection terminated unexpectedly')),
          },
          {
            authSecret: 'integration-test-secret-with-length',
            submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
            fileStore,
            scanner: { scan: () => verdict() },
            log: { sink: { write: (line: string) => released.push(line) }, level: 'info' },
          },
        )
      })

      afterAll(async () => {
        await releasing?.close()
      })

      test('a write that throws is answered with its own error, not the release\'s', async () => {
        verdict = async () => ({ clean: true })
        const file = await offer(first.byteLength)
        const write = holdTheNextWrite()

        const failing = put(file, first, releasing)
        await write.reached
        write.fail(new Error('ENOSPC: no space left on device'))
        const answered = await failing

        // Rethrown after a release that failed, the release's error replaced it: a reply
        // about a dropped connection, for a disk that had filled.
        expect(answered.statusCode).toBe(500)
        expect(answered.json()).toMatchObject({ message: 'ENOSPC: no space left on device' })
        // The release that failed is said in the log, as one, beside the failure it did
        // not replace.
        const events = released.map((line) => JSON.parse(line) as { event: string; level: string })
        expect(events).toContainEqual(expect.objectContaining({ event: 'upload.unreleased', level: 'error' }))
        expect(events).toContainEqual(expect.objectContaining({ event: 'request.failed', status: 500 }))
        expect(released.join('')).not.toContain('Connection terminated')
      })

      test('a file the scanner refused is still answered as refused', async () => {
        verdict = async () => ({ clean: false, finding: 'Eicar-Test-Signature' })
        const file = await offer(first.byteLength)

        const answered = await put(file, first, releasing)

        // A release that failed turned it into a 500: a refused file read as a fault on the
        // server, which the person is invited to send again rather than told was refused.
        expect(answered.statusCode).toBe(422)
        expect(answered.json()).toMatchObject({ error: 'refused_by_scanner' })
      })
    })

    test('a database from before the lease gains its column on start, and holds no file', async () => {
      const file = await offer(10)
      // The table as it was: no lease column. Bootstrapping again is what a start does.
      await sql`ALTER TABLE files DROP COLUMN receiving_until`
      await bootstrapSchema(sql)

      // In the CREATE alone, the column would exist on a fresh database and never arrive on
      // an existing one — where every upload would then fail on a column that is not there.
      const [column] = await sql`
        SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'files' AND column_name = 'receiving_until'`
      expect(column).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'YES' })
      // Null is nobody receiving it, which is true of every file there was before.
      const storage = createPostgresStorage(sql)
      expect((await storage.getFile(file.id))?.receivingUntil).toBeNull()
      const now = new Date()
      expect(
        await storage.leaseFile(file.id, now.toISOString(), new Date(now.getTime() + 1000).toISOString()),
      ).toBe(true)
    })

    test('two leases taken at once on real SQL: exactly one wins', async () => {
      const storage = createPostgresStorage(sql)
      const now = new Date()
      const until = (ms: number): string => new Date(now.getTime() + ms).toISOString()
      // Several files, two requests each, all at once: a read and then a write loses this
      // on most of them, and one pair alone could be lucky.
      const files = await Promise.all(Array.from({ length: 8 }, () => offer(10)))

      const outcomes = await Promise.all(
        files.map((file) =>
          Promise.all([
            storage.leaseFile(file.id, now.toISOString(), until(60_000)),
            storage.leaseFile(file.id, now.toISOString(), until(60_001)),
          ]),
        ),
      )

      // Each pair found the file offered and free. The second UPDATE waits on the row the
      // first is changing and re-reads it once that commits — held by then, so it matches
      // nothing. A lease that read first and wrote second would hand the file to both.
      for (const won of outcomes) expect(won.filter(Boolean)).toHaveLength(1)
      // And the row names the winner's lease, so the loser could not settle it either.
      for (const [index, file] of files.entries()) {
        const winner = outcomes[index]?.[0] === true ? until(60_000) : until(60_001)
        expect((await storage.getFile(file.id))?.receivingUntil).toBe(winner)
      }
    })

    test('on real SQL, only the holding lease settles or releases, and a claimed row is left alone', async () => {
      const storage = createPostgresStorage(sql)
      const file = await offer(second.byteLength)
      const now = Date.now()
      const at = (minutes: number): string => new Date(now + minutes * 60_000).toISOString()

      expect(await storage.leaseFile(file.id, at(0), at(2))).toBe(true)
      // The first lease ran out and a second request took the file over.
      expect(await storage.leaseFile(file.id, at(3), at(5))).toBe(true)

      // Settling for the request that overran would mark the file stored mid-write.
      expect(await storage.settleFile(file.id, at(2))).toBe(false)
      expect(await storage.settleFile(file.id, at(5))).toBe(true)
      bytes.set(file.storageKey, second)
      const submitted = await submit(file)
      expect(submitted.statusCode).toBe(201)

      // The write that ended an upload used to set the state and the submission
      // unconditionally; now it may set neither on a claimed row, whatever it is handed.
      expect(await storage.settleFile(file.id, at(5))).toBe(false)
      expect(await storage.releaseFile(file.id, at(5))).toBe(false)
      // And it is never leased again, so no request can start receiving bytes for it.
      expect(await storage.leaseFile(file.id, at(6), at(8))).toBe(false)
      // Nor when the row names that very lease. The port cannot leave one so — claiming needs
      // `stored`, and storing clears the lease — so it is written here, to show the state
      // alone refuses it, as it does in memory.
      await sql`UPDATE files SET receiving_until = ${at(5)}::timestamptz WHERE id = ${file.id}`
      expect(await storage.settleFile(file.id, at(5))).toBe(false)
      const [row] = await sql`SELECT state, submission_id FROM files WHERE id = ${file.id}`
      expect(row?.['state']).toBe('claimed')
      expect(row?.['submission_id']).toBe((submitted.json() as { id: string }).id)
    })
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

/**
 * A sourced answer, checked against the deployment's own list.
 *
 * The half of `optionsSource` that no test reached. The engine refuses a value no
 * DOCUMENT option offers and runs on both sides; a field naming a source has no document
 * options, deliberately, because a list living outside the document cannot be checked
 * against it. So the server asks the deployment — and `checkMembership` had unit tests
 * while `AppOptions.optionsSources` reached the use-cases through nothing at all, which
 * made the whole guarantee dead code until a review found it
 * ([0077](../../../docs/decisions/0077-options-may-come-from-a-named-source.md)).
 *
 * Its own app, because the option only exists at construction — and a real source rather
 * than a stub of the server: a stub asked the question would answer about the stub.
 */
describe('a sourced answer, checked against the deployment’s own list', () => {
  const OFFERED = new Set(['ZH', 'BE', 'VD'])
  let sourced: FastifyInstance
  let hash = ''
  /** Every batch the deployment was asked about, so "one query per source" is visible. */
  const asked: Array<readonly string[]> = []
  let breaks = false

  beforeAll(async () => {
    sourced = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
      optionsSources: {
        cantons: {
          members: (values) => {
            asked.push(values)
            if (breaks) return Promise.reject(new Error('the list is down'))
            return Promise.resolve(values.filter((value) => !OFFERED.has(value)))
          },
        },
      },
    })

    const published = await sourced.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: {
        path: 'sourced',
        schema: {
          specVersion: '2',
          id: 'sourced',
          title: 'Sourced',
          model: {
            fields: [
              { key: 'canton', type: 'select', label: 'Canton', optionsSource: 'cantons' },
              {
                key: 'people',
                type: 'repeater',
                label: 'People',
                fields: [
                  { key: 'home', type: 'select', label: 'Home canton', optionsSource: 'cantons' },
                ],
              },
            ],
          },
        },
      },
    })
    hash = (published.json() as { schemaHash: string }).schemaHash
    await sourced.inject({
      method: 'PUT',
      url: '/f/sourced/access',
      headers: asAdmin(),
      payload: { submit: 'public' },
    })
  })

  afterAll(async () => {
    await sourced.close()
  })

  const submit = (payload: unknown) =>
    sourced.inject({
      method: 'POST',
      url: '/f/sourced/submissions',
      headers: { [SCHEMA_HASH_HEADER]: hash },
      payload: payload as never,
    })

  test('stores an answer the source offers', async () => {
    asked.length = 0
    const response = await submit({ canton: 'ZH', people: [{ home: 'BE' }] })

    expect(response.statusCode).toBe(201)
    // One call, carrying every value submitted for that source: a source with two
    // million rows is the case this feature exists for, and a query per answer would
    // make a ten-row repeater ten round trips.
    expect(asked).toEqual([['ZH', 'BE']])
  })

  test('refuses an answer it does not offer, in the shape the client already renders', async () => {
    const response = await submit({ canton: 'XX' })

    expect(response.statusCode).toBe(422)
    // The same code word a document option produces, so a catalogue learns one word for
    // one idea -- and the path names the field, never the source.
    expect(response.json()).toEqual({ error: 'invalid', errors: { canton: ['option'] } })
  })

  test('names the row that carried it, not the field inside the template', async () => {
    const response = await submit({ canton: 'ZH', people: [{ home: 'ZH' }, { home: 'XX' }] })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: 'invalid',
      errors: { 'people[1].home': ['option'] },
    })
  })

  test('fails CLOSED with 503 when the source cannot answer', async () => {
    // 503 and not 422: nothing about the submission is wrong. Retryable, and the draft
    // still holds the answers -- where accepting the value unchecked would store
    // something nobody can detect afterwards.
    breaks = true
    try {
      const response = await submit({ canton: 'ZH' })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({ error: 'source_unavailable', source: 'cantons' })
    } finally {
      breaks = false
    }
  })

  test('refuses to PUBLISH a form naming a source this deployment does not have', async () => {
    // Caught at publish rather than at the first submission, because a published version
    // is frozen forever: a form naming a list nobody can resolve renders a message
    // instead of a chooser, and nothing would have said so.
    const response = await sourced.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: {
        path: 'unknown-source',
        schema: {
          specVersion: '2',
          id: 'unknown',
          title: 'Unknown',
          model: {
            fields: [{ key: 'town', type: 'select', label: 'Town', optionsSource: 'towns' }],
          },
        },
      },
    })

    expect(response.statusCode).toBe(422)
    expect(JSON.stringify(response.json())).toContain('towns')
  })
})

/**
 * What reaches the log.
 *
 * `SAFETY-ANALYSIS.md` C3 once claimed "structured logging with configurable PII
 * redaction" while the server constructed Fastify with `logger: false` and nothing in this
 * repository redacted anything. The correction made the sentence true the other way — no
 * log, so submission content could not reach one — and this block asserted the logger was
 * off. The server now keeps a log, on by default (0168), and the assertion that held "there
 * is none" is replaced by the sweep below, which holds what the log may say.
 *
 * The first version of the old guard captured `process.stdout.write` around a submission
 * carrying a marker string and asserted the marker never appeared. **Measured with
 * `logger: true`: it still passed.** pino writes to the file descriptor through its own
 * destination stream and never touches `process.stdout.write`, so the guard was green over
 * exactly the configuration it existed to refuse. That is why the sweep reads the sink the
 * server is given rather than intercepting a stream: there is nothing for the log to write
 * past.
 */
describe('what reaches the log', () => {
  test('an app given no log keeps none, because a host that embeds it owns its output', () => {
    // The old assertion, kept for the reason that is still true: `createApp` with no `log`
    // is built with Fastify's no-op logger, which carries no level. Only the server's own
    // process turns the log on (`main.ts`); a host embedding the app decides for itself
    // what its standard output is for (0115).
    expect((app.log as { level?: string }).level).toBeUndefined()
    expect(app.log.info('marker-3f9c1d-never-in-a-log')).toBeUndefined()
  })

  test('nothing a request carries or a response hands out is written, on any route family', async () => {
    // The log's whole promise. Every route family is driven — a login that fails and one
    // that works, a user, an API key used for publishing, a draft, an upload, a challenge,
    // a submission, the reads of it, the model — with values planted in what it sends, and
    // a body that does not parse, a path no route has and a database error whose message
    // quotes what was planted. A field the rule did not list, an error's words or a raw URL
    // in any line fails it.
    const written: string[] = []
    const providerWords = `invalid x-api-key for planted-org-${randomUUID()}`
    const swept = await createApp(createPostgresStorage(sql), {
      authSecret: 'integration-test-secret-with-length',
      submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 },
      loginRateLimit: { max: 10_000, timeWindowMs: 60_000 },
      challengeSecret: 'challenge-signing-key-of-real-length',
      fileStore,
      model: {
        provider: 'anthropic',
        model: 'claude-test',
        completer: { complete: () => Promise.resolve({ ok: false, failure: 'unavailable', status: 401, cause: providerWords }) },
      },
      log: { sink: { write: (line: string) => written.push(line) }, level: 'trace' },
    })

    /**
     * Every string this sweep sends — header values, the path's parameters, query values
     * and the body's leaves — and every secret the server hands back, kept as the requests
     * are made, so the list of what must not be logged is derived from the requests rather
     * than written beside them. A path's parameters are what Fastify's router reads as
     * them, since the rest of the path is the route, which the log does write; a path no
     * route has is the asker's whole. Shorter than six characters is too common to say
     * anything (`CH`, `2`), and nothing planted is that short.
     */
    const carried = new Set<string>()
    const carry = (value: string): void => {
      if (value.length >= 6) carried.add(value)
    }
    const leaves = (value: unknown): void => {
      if (typeof value === 'string') carry(value)
      else if (Buffer.isBuffer(value)) carry(value.toString('utf8'))
      else if (Array.isArray(value)) value.forEach(leaves)
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(leaves)
    }
    let sent = 0
    const send = async (options: InjectOptions): Promise<LightMyRequestResponse> => {
      const url = new URL(String(options.url), 'http://sweep.invalid')
      const route = swept.findRoute({ method: String(options.method) as HTTPMethods, url: url.pathname })
      if (route === null) carry(url.pathname)
      else Object.values(route.params).forEach((value) => carry(String(value)))
      url.searchParams.forEach((value) => carry(value))
      leaves(options.headers)
      leaves(options.payload)
      sent += 1
      return swept.inject(options)
    }
    /** A value nobody would write by accident, for this sweep to send. */
    const plant = (what: string): string => `planted-${what}-${randomUUID()}`
    const planted = {
      email: `${plant('email')}@example.ch`,
      password: plant('password'),
      answer: plant('answer'),
      fileName: `${plant('file-name')}.pdf`,
      fileBytes: `%PDF-1.4 ${plant('file-bytes')}`,
      query: plant('query'),
      prompt: plant('prompt'),
    }

    try {
      const admin = (
        await send({ method: 'POST', url: '/auth/login', payload: { email: 'root@test.ch', password: 'root-password-1' } })
      ).json() as { token: string }
      carry(admin.token)
      const asRoot = { authorization: `Bearer ${admin.token}` }

      expect(
        (await send({ method: 'POST', url: '/auth/login', payload: { email: planted.email, password: planted.password } }))
          .statusCode,
      ).toBe(401)
      expect(
        (
          await send({
            method: 'POST',
            url: '/users',
            headers: asRoot,
            payload: { email: planted.email, password: planted.password, role: 'editor' },
          })
        ).statusCode,
      ).toBe(201)

      const key = (
        await send({ method: 'POST', url: '/api-keys', headers: asRoot, payload: { name: plant('key-name'), role: 'admin' } })
      ).json() as { secret: string }
      carry(key.secret)
      const withKey = { 'x-formancy-api-key': key.secret }

      const path = plant('path')
      const published = await send({
        method: 'POST',
        url: '/forms',
        headers: withKey,
        payload: {
          path,
          schema: {
            specVersion: '2',
            id: 'swept',
            title: 'Swept',
            model: {
              fields: [
                { key: 'email', type: 'text', label: 'Email', required: true },
                { key: 'note', type: 'text', label: 'Note' },
                { key: 'evidence', type: 'file', label: 'Evidence', accept: ['application/pdf'] },
              ],
            },
          },
        },
      })
      expect(published.statusCode).toBe(201)
      const { schemaHash } = published.json() as { schemaHash: string }
      expect(
        (await send({ method: 'PUT', url: `/f/${path}/access`, headers: withKey, payload: { submit: 'public' } })).statusCode,
      ).toBe(204)
      expect((await send({ method: 'GET', url: `/forms?cursor=${planted.query}`, headers: withKey })).statusCode).toBe(200)
      expect((await send({ method: 'GET', url: `/f/${path}` })).statusCode).toBe(200)

      const draft = (await send({ method: 'POST', url: `/f/${path}/drafts` })).json() as { draftId: string; token: string }
      carry(draft.draftId)
      carry(draft.token)
      const draftKey = { 'x-formancy-draft-token': draft.token }
      expect(
        (
          await send({
            method: 'PUT',
            url: `/f/${path}/drafts/${draft.draftId}`,
            headers: draftKey,
            payload: { email: planted.email, note: planted.answer },
          })
        ).statusCode,
      ).toBe(200)
      expect(
        (await send({ method: 'GET', url: `/f/${path}/drafts/${draft.draftId}`, headers: draftKey })).statusCode,
      ).toBe(200)

      const bytes = Buffer.from(planted.fileBytes)
      const offered = await send({
        method: 'POST',
        url: `/f/${path}/files`,
        payload: { field: 'evidence', name: planted.fileName, size: bytes.byteLength, contentType: 'application/pdf' },
      })
      expect(offered.statusCode).toBe(201)
      const file = offered.json() as { id: string; storageKey: string; uploadUrl: string }
      leaves(file)
      expect(
        (await send({ method: 'PUT', url: file.uploadUrl, headers: { 'content-type': 'application/pdf' }, payload: bytes }))
          .statusCode,
      ).toBe(204)

      const minted = await send({ method: 'GET', url: `/f/${path}/challenge` })
      const challenge = minted.json() as { salt: string; challenge: string; maxNumber: number; signature: string }
      const solution = Buffer.from(JSON.stringify({ ...challenge, number: await solveChallenge(challenge) })).toString(
        'base64',
      )
      const submitted = await send({
        method: 'POST',
        url: `/f/${path}/submissions`,
        headers: { [SCHEMA_HASH_HEADER]: schemaHash, 'x-formancy-challenge': solution },
        payload: { email: planted.email, note: planted.answer, evidence: [file] },
      })
      expect(submitted.statusCode).toBe(201)
      carry((submitted.json() as { id: string }).id)

      for (const url of [
        `/f/${path}/submissions`,
        `/f/${path}/submissions/export.csv`,
        `/f/${path}/files/${file.id}`,
        `/f/${path}/examples`,
        '/deliveries/dead',
        '/audit?limit=50',
      ]) {
        expect((await send({ method: 'GET', url, headers: asRoot })).statusCode, url).toBe(200)
      }

      // The provider's words are not sent by anybody here; they come back from the model,
      // and can name the account.
      carry(providerWords)
      expect(
        (
          await send({
            method: 'POST',
            url: '/model/complete',
            headers: asRoot,
            payload: { kind: 'authoring', user: planted.prompt },
          })
        ).statusCode,
      ).toBe(502)

      // A body that does not parse, refused before any handler runs.
      expect(
        (
          await send({
            method: 'POST',
            url: '/auth/login',
            headers: { 'content-type': 'application/json' },
            payload: `{"email":"${planted.email}","password":${planted.password}}`,
          })
        ).statusCode,
      ).toBe(400)
      // An id the database cannot read: its error's message is the query and its parameters.
      expect(
        (await send({ method: 'GET', url: `/f/${path}/files/${plant('file-id')}`, headers: asRoot })).statusCode,
      ).toBe(500)
      // A path no route has, which Fastify's own line names in full.
      expect((await send({ method: 'GET', url: `/nowhere/${plant('segment')}?q=${planted.query}` })).statusCode).toBe(404)
    } finally {
      await swept.close()
    }

    const lines = written.map((line) => JSON.parse(line) as Record<string, unknown>)
    // Not vacuous: one line for every request, and the failures written as failures.
    expect(lines.filter((line) => line['event'] === 'request')).toHaveLength(sent)
    expect(lines.map((line) => line['event'])).toEqual(
      expect.arrayContaining(['request.refused', 'request.failed', 'model.unreachable']),
    )
    for (const line of lines) for (const field of Object.keys(line)) expect(LOG_FIELDS).toContain(field)

    // What was carried is what the requests carried, so this is the check that each kind of
    // value the sweep claims to plant was actually sent.
    for (const [what, value] of Object.entries(planted)) expect(carried.has(value), what).toBe(true)

    // Every value that reached the log, rather than the first: a leak is read by what leaked.
    const text = written.join('')
    expect([...carried].filter((value) => text.includes(value))).toEqual([])
  })
})

describe('two editors publishing one form', () => {
  /*
   * The same 409 the submission route sends, on the publish route, with the same
   * body — so a client that already knows how to handle one stale version
   * handles both.
   *
   * What makes this safe to add to an existing route is that declaring is
   * OPTIONAL: every publish in this file that sends no header still publishes,
   * which is what a script, the CLI and an agent do. The builder declares,
   * because the builder opened a version.
   */
  test('a publish declaring the version it opened is accepted', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'collide-accepted', schema },
    })
    const opened = (first.json() as { schemaHash: string }).schemaHash

    const second = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin({ [SCHEMA_HASH_HEADER]: opened }),
      payload: { path: 'collide-accepted', schema: { ...schema, title: 'Edited' } },
    })

    expect(second.statusCode).toBe(201)
    expect((second.json() as { version: number }).version).toBe(2)
  })

  test('and one overtaken by somebody else is refused with the current schema', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'collide-overtaken', schema },
    })
    const opened = (first.json() as { schemaHash: string }).schemaHash

    // Somebody else publishes while the first editor is still editing.
    await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'collide-overtaken', schema: { ...schema, title: 'Theirs' } },
    })

    const late = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin({ [SCHEMA_HASH_HEADER]: opened }),
      payload: { path: 'collide-overtaken', schema: { ...schema, title: 'Mine' } },
    })

    expect(late.statusCode).toBe(409)
    const body = late.json() as { error: string; current: { version: number; schema: { title: string } } }
    expect(body.error).toBe('FORM_VERSION_CHANGED')
    // The current version travels with the refusal, so the editor can show what
    // changed rather than fetching and diffing to find out why it was refused.
    expect(body.current.version).toBe(2)
    expect(body.current.schema.title).toBe('Theirs')
  })

  test('and nothing was overwritten: the version they lost the race to is still current', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'collide-kept', schema },
    })
    const opened = (first.json() as { schemaHash: string }).schemaHash
    await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'collide-kept', schema: { ...schema, title: 'Theirs' } },
    })

    await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin({ [SCHEMA_HASH_HEADER]: opened }),
      payload: { path: 'collide-kept', schema: { ...schema, title: 'Mine' } },
    })

    const resolved = await app.inject({ method: 'GET', url: '/f/collide-kept' })
    expect((resolved.json() as { schema: { title: string } }).schema.title).toBe('Theirs')
  })

  test('a publish that declares nothing still publishes, as every other one here does', async () => {
    await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'collide-script', schema },
    })

    const script = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'collide-script', schema: { ...schema, title: 'From a script' } },
    })

    expect(script.statusCode).toBe(201)
  })
})

describe('republishing a document this form has had before', () => {
  /*
   * Found while testing the above, and it was a **500**.
   *
   * `UNIQUE (form_id, schema_hash)` is what makes republishing the CURRENT
   * document idempotent rather than a version factory. Publishing an OLDER
   * version's document — undoing a bad publish by putting yesterday's back — hit
   * the same index, and nothing caught it: the insert raised and Fastify
   * answered "Internal Server Error".
   *
   * A published version is immutable and cannot be published twice, so the
   * answer is a refusal rather than a new version; what it owed the caller is
   * WHICH version they already have.
   */
  test('is refused by name and by version, not with a 500', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'revert-me', schema },
    })
    expect(first.statusCode).toBe(201)

    await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'revert-me', schema: { ...schema, title: 'A publish to undo' } },
    })

    // Put the original back, which is what undoing looks like.
    const revert = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'revert-me', schema },
    })

    expect(revert.statusCode).toBe(409)
    const body = revert.json() as { error: string; version: number }
    expect(body.error).toBe('already_published')
    // The version it already is, so the caller knows what to point at rather
    // than being told no.
    expect(body.version).toBe(1)
  })

  test('and a publish that warns still returns 201, with the warning in the body', async () => {
    /*
     * The distinction this whole feature rests on, across a real HTTP boundary
     * and a real database: the document IS published, and the publisher is told
     * what is wrong with it ([0097]).
     *
     * `address.nope` rather than an unknown root, because a root is already
     * refused — the engine compiles each rule against the fields that exist. A
     * member of a group type-checks as `dyn` and gets through, which is also
     * exactly what a rename leaves behind inside a group.
     */
    const grouped = {
      specVersion: '2',
      id: 'warned',
      title: 'Warned',
      model: {
        fields: [
          { key: 'note', type: 'text', label: 'Note' },
          {
            key: 'address',
            type: 'group',
            label: 'Address',
            fields: [{ key: 'city', type: 'text', label: 'City' }],
          },
        ],
      },
      logic: { rules: [{ target: 'note', kind: 'visible', cel: 'address.nope == "Zug"' }] },
    }

    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'warned-form', schema: grouped },
    })

    expect(published.statusCode).toBe(201)
    const body = published.json() as { version: number; warnings?: string[] }
    expect(body.version).toBe(1)
    expect(body.warnings?.[0]).toContain('"address.nope"')

    // And it really is there, which is what separates a warning from a refusal
    // with a friendlier name.
    const resolved = await app.inject({ method: 'GET', url: '/f/warned-form' })
    expect(resolved.statusCode).toBe(200)
  })

  test('while a publish with nothing to say carries no warnings key at all', async () => {
    // Omitted rather than empty, so a client that has never heard of warnings
    // sees the body it always saw.
    const clean = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'quiet-form', schema },
    })

    expect(clean.statusCode).toBe(201)
    expect(clean.json()).not.toHaveProperty('warnings')
  })

  test('while republishing the current document is still idempotent', async () => {
    // The distinction that makes the refusal above safe: "deploy again" must
    // never manufacture a version, and must never start failing either.
    await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'deploy-again', schema },
    })

    const again = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'deploy-again', schema },
    })

    expect(again.statusCode).toBe(201)
    expect((again.json() as { version: number }).version).toBe(1)
  })
})

describe('a form’s examples, kept in PostgreSQL', () => {
  /*
   * The examples a deployment keeps beside a form, and the publish that runs them (0166),
   * across real HTTP and real SQL: jsonb round trips, the foreign key, the transaction with
   * the audit row, and the table added on start.
   */
  const examples = {
    scenarios: [
      { name: 'Switzerland asks for a canton', changes: { country: 'CH' }, valid: true, visible: { canton: true } },
      { name: 'A price and a quantity make a total', changes: { price: 2.5, qty: 4 }, valid: true, values: { total: 10 } },
    ],
    sample: { email: 'jane@example.ch' },
  }
  const turnedRound: FormSchema = {
    ...schema,
    logic: {
      rules: [
        { target: 'canton', kind: 'visible', cel: 'country != "CH"' },
        { target: 'total', kind: 'computed', cel: 'price * qty' },
      ],
    },
  }

  test('the table is added on start to a database from before it, and starts empty', async () => {
    // The upgrade path: a deployment's database has every other table and not this one.
    // Bootstrapping is what adds it; there is nothing to run by hand and nothing to backfill.
    await sql`DROP TABLE IF EXISTS form_examples`
    await bootstrapSchema(sql)
    const [row] = await sql<Array<{ count: number }>>`SELECT count(*)::int AS count FROM form_examples`
    expect(row?.count).toBe(0)
  })

  test('are kept and read back as written, and a second write replaces the first', async () => {
    // jsonb keeps numbers as numbers and nested maps as maps; a list that came back with
    // `2.5` as a string would fail every example that sets it, for no reason in the form.
    await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'kept-examples', schema } })

    const put = await app.inject({ method: 'PUT', url: '/f/kept-examples/examples', headers: asAdmin(), payload: examples })
    expect(put.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/f/kept-examples/examples', headers: asAdmin() })).json()).toEqual(examples)

    const fewer = { scenarios: [examples.scenarios[1]] }
    await app.inject({ method: 'PUT', url: '/f/kept-examples/examples', headers: asAdmin(), payload: fewer })
    expect((await app.inject({ method: 'GET', url: '/f/kept-examples/examples', headers: asAdmin() })).json()).toEqual(fewer)
  })

  test('a change is audited, with counts and not the examples', async () => {
    // Who changed what a form is checked against: the question after a publish that should have
    // warned and did not. This shows the row is written, and not that it commits with the change
    // — a row written after the commit gives the same count; the next case is that one.
    await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'audited-examples', schema } })
    await app.inject({ method: 'PUT', url: '/f/audited-examples/examples', headers: asAdmin(), payload: examples })

    const rows = await sql<Array<{ detail: Record<string, unknown> }>>`
      SELECT detail FROM audit_log WHERE action = 'form.examples.changed' AND subject = 'audited-examples'`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.detail).toEqual({ examples: 2, sample: true })
  })

  test('a change whose audit row cannot be written is not kept either', async () => {
    // One commit, the change and the row saying who made it. Written one after the other, an
    // audit row that fails leaves the change standing with nothing recording it: examples gone
    // that the next publish would have run, and no row to ask who removed them. The row is made
    // to fail with an id the log already has, which the primary key refuses.
    await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'unaudited-examples', schema } })
    await app.inject({ method: 'PUT', url: '/f/unaudited-examples/examples', headers: asAdmin(), payload: examples })
    const [form] = await sql<Array<{ id: string }>>`SELECT id FROM forms WHERE path = 'unaudited-examples'`
    const [taken] = await sql<Array<{ id: string }>>`SELECT id FROM audit_log LIMIT 1`
    const storage = createPostgresStorage(sql)
    const at = new Date().toISOString()

    await expect(
      storage.keepExamples(
        { formId: form!.id, scenarios: [], sample: null, updatedAt: at },
        { id: taken!.id, at, action: 'form.examples.changed', subject: 'unaudited-examples', detail: { examples: 0, sample: false } },
      ),
    ).rejects.toThrow()
    expect((await storage.getExamples(form!.id))?.scenarios).toEqual(examples.scenarios)
  })

  test('the database refuses examples for a form that is not there', async () => {
    // The foreign key, under the use-case: a list kept for no form would be found by whatever
    // is published under that id later, if anything ever were.
    await expect(
      createPostgresStorage(sql).keepExamples({ formId: randomUUID(), scenarios: [], sample: null, updatedAt: new Date().toISOString() }),
    ).rejects.toThrow()
  })

  test('publishing runs them, names each that stops holding on the 201, and publishes', async () => {
    // The rule turned round. Everything else about the document is valid, and the example is
    // the one thing that can say which spelling was meant — said, never refused.
    await app.inject({ method: 'POST', url: '/forms', headers: asAdmin(), payload: { path: 'checked-examples', schema } })
    await app.inject({ method: 'PUT', url: '/f/checked-examples/examples', headers: asAdmin(), payload: examples })

    const published = await app.inject({
      method: 'POST',
      url: '/forms',
      headers: asAdmin(),
      payload: { path: 'checked-examples', schema: turnedRound },
    })

    expect(published.statusCode).toBe(201)
    const body = published.json() as { version: number; warnings?: string[] }
    expect(body.version).toBe(2)
    expect(body.warnings).toEqual([
      'The example "Switzerland asks for a canton" held against version 1 and does not hold against version 2: "canton": expected to be visible, and it is hidden.',
    ])
    expect((await app.inject({ method: 'GET', url: '/f/checked-examples' })).json()).toMatchObject({ version: 2 })
  })
})
