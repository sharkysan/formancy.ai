import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Completer } from '@formancy/server-core'
import { createApp, SCHEMA_HASH_HEADER } from './app.js'
import type { AppOptions } from './app.js'
import { bootstrapSchema } from './db.js'
import { createPostgresStorage } from './postgres-storage.js'
import { createPostgresRateLimitStore } from './postgres-rate-limits.js'

/**
 * Two replicas over one real PostgreSQL, each with its own connections, counting in the one
 * table (0170).
 *
 * Every limit used to count in the process that answered, so behind N replicas it allowed N
 * times what it said — the login limit and the model's per session included. What is under
 * test is that the count is the database's: that a request on one replica spends the budget
 * the other one checks, that budgets stay per route and per client, that a window ends on the
 * database's clock, what happens while the counter cannot answer, and that expired counters
 * go. Real SQL because the defect is about what two processes see of one row.
 */
const SECRET = 'integration-test-secret-with-length'
const ADMIN = { email: 'root@test.ch', password: 'root-password-1' }

let container: StartedPostgreSqlContainer
let sql: postgres.Sql
const opened: Array<{ close: () => Promise<unknown> }> = []

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  sql = postgres(container.getConnectionUri())
  await bootstrapSchema(sql)
}, 180_000)

afterAll(async () => {
  await sql?.end()
  await container?.stop()
})

beforeEach(async () => {
  // Each case starts with no request counted anywhere.
  await sql`TRUNCATE rate_limit_counters`
})

afterEach(async () => {
  for (const thing of opened.splice(0).reverse()) await thing.close()
})

/** A connection of a replica's own, as a second process has. */
function connection(): postgres.Sql {
  const own = postgres(container.getConnectionUri())
  opened.push({ close: () => own.end({ timeout: 1 }) })
  return own
}

/** A replica: its own connections, the shared storage and the shared counter. */
async function replica(
  options: Omit<AppOptions, 'authSecret'> = {},
  store: { timeoutMs?: number; sweepEveryMs?: number; report?: (line: string) => void } = {},
): Promise<FastifyInstance> {
  const own = connection()
  const app = await createApp(createPostgresStorage(own), {
    authSecret: SECRET,
    rateLimitStore: createPostgresRateLimitStore(own, { report: () => {}, ...store }),
    ...options,
  })
  opened.push(app)
  return app
}

/** One submission attempt from `client`: 404 when admitted (there is no such form), 429 when not. */
async function submit(app: FastifyInstance, client = '203.0.113.1'): Promise<number> {
  const response = await app.inject({
    method: 'POST',
    url: '/f/no-such-form/submissions',
    remoteAddress: client,
    headers: { [SCHEMA_HASH_HEADER]: 'whatever' },
    payload: {},
  })
  return response.statusCode
}

describe('two replicas over one database', () => {
  test('share one budget, so the limit is what it says however many answer', async () => {
    // The defect: each replica counted only the requests it answered, so three a minute behind
    // two replicas was six.
    const limit = { submissionRateLimit: { max: 3, timeWindowMs: 60_000 } }
    const a = await replica(limit)
    const b = await replica(limit)

    expect([await submit(a), await submit(b), await submit(a)]).toEqual([404, 404, 404])
    expect(await submit(b)).toBe(429)
    expect(await submit(a)).toBe(429)
  })

  test('still count each client apart', async () => {
    // Sharing the count must not turn it into one budget for everybody: the key is still the
    // client, as before.
    const limit = { submissionRateLimit: { max: 1, timeWindowMs: 60_000 } }
    const a = await replica(limit)
    const b = await replica(limit)

    expect(await submit(a, '203.0.113.1')).toBe(404)
    expect(await submit(b, '203.0.113.2')).toBe(404)
    expect(await submit(b, '203.0.113.1')).toBe(429)
  })

  test('still count each route apart', async () => {
    // Every limit counts in the one table, so the route is part of the key. Without it, a
    // respondent's submissions would spend their drafts' budget, and a stranger's logins a
    // respondent's — whatever shared an address shared every limit.
    const limit = { submissionRateLimit: { max: 1, timeWindowMs: 60_000 } }
    const a = await replica(limit)
    const b = await replica(limit)

    expect(await submit(a)).toBe(404)
    expect(await submit(b)).toBe(429)
    const draft = await b.inject({ method: 'POST', url: '/f/no-such-form/drafts', remoteAddress: '203.0.113.1' })
    expect(draft.statusCode).toBe(404)

    const keys = (await sql<{ key: string }[]>`SELECT key FROM rate_limit_counters ORDER BY key`).map((row) => row.key)
    expect(keys).toEqual(['POST /f/:path/drafts 203.0.113.1', 'POST /f/:path/submissions 203.0.113.1'])
  })

  test('share the login limit', async () => {
    // Login is where a guess costs a full argon2 verification; ten a minute per address behind
    // two replicas was twenty guesses, and twenty verifications.
    const limit = { bootstrapAdmin: ADMIN, loginRateLimit: { max: 2, timeWindowMs: 60_000 } }
    const a = await replica(limit)
    const b = await replica(limit)
    const guess = (app: FastifyInstance) =>
      app.inject({ method: 'POST', url: '/auth/login', payload: { email: ADMIN.email, password: 'wrong' } })

    expect((await guess(a)).statusCode).toBe(401)
    expect((await guess(b)).statusCode).toBe(401)
    expect((await guess(a)).statusCode).toBe(429)
  })

  test("share the model's per-session limit, and still count each session apart", async () => {
    // Hazard C9: the operator pays for every request, and ten a minute per session was ten per
    // replica. Counted once the session is known, so another editor behind the same address
    // keeps a budget of their own.
    const completer: Completer = { complete: () => Promise.resolve({ ok: true, text: '{}' }) }
    const options = {
      bootstrapAdmin: ADMIN,
      model: { provider: 'anthropic' as const, model: 'claude-test', completer },
      modelRateLimit: { max: 2, timeWindowMs: 60_000 },
    }
    const a = await replica(options)
    const b = await replica(options)
    const login = await a.inject({ method: 'POST', url: '/auth/login', payload: ADMIN })
    const admin = (login.json() as { token: string }).token
    await a.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${admin}` },
      payload: { email: 'editor@test.ch', password: 'editor-password-1', role: 'editor' },
    })
    const editorLogin = await b.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'editor@test.ch', password: 'editor-password-1' },
    })
    const editor = (editorLogin.json() as { token: string }).token
    const ask = (app: FastifyInstance, token: string) =>
      app.inject({
        method: 'POST',
        url: '/model/complete',
        headers: { authorization: `Bearer ${token}` },
        payload: { kind: 'authoring', user: 'Add a field' },
      })

    expect((await ask(a, admin)).statusCode).toBe(200)
    expect((await ask(b, admin)).statusCode).toBe(200)
    expect((await ask(a, admin)).statusCode).toBe(429)
    expect((await ask(b, editor)).statusCode).toBe(200)
  })
})

describe('the window', () => {
  test("is the database's, so it ends for both replicas at once", async () => {
    // One clock for every replica: a window kept by each process's own clock would end at
    // different moments on each, and a skewed one would hand out a fresh budget early.
    const limit = { submissionRateLimit: { max: 1, timeWindowMs: 1_000 } }
    const a = await replica(limit)
    const b = await replica(limit)

    expect(await submit(a)).toBe(404)
    const refused = await b.inject({
      method: 'POST',
      url: '/f/no-such-form/submissions',
      remoteAddress: '203.0.113.1',
      headers: { [SCHEMA_HASH_HEADER]: 'whatever' },
      payload: {},
    })
    expect(refused.statusCode).toBe(429)
    // What is left of the window, in whole seconds, as the plugin rounds it.
    expect(refused.headers['retry-after']).toBe('1')

    await new Promise((resolve) => setTimeout(resolve, 1_100))
    expect(await submit(b)).toBe(404)
  })
})

describe('a counter slower than its bound', () => {
  test('admits a respondent, refuses a login, and tells the operator when it starts and stops', async () => {
    // The table held by somebody else's lock is a database that answers everything except the
    // counter, slowly. The bound is what a request waits before its limit decides without a
    // count: the public plane goes on, login does not (0170).
    const lines: string[] = []
    const options = { bootstrapAdmin: ADMIN, submissionRateLimit: { max: 1, timeWindowMs: 60_000 } }
    const a = await replica(options, { timeoutMs: 300, report: (line) => lines.push(line) })

    const holder = connection()
    let release = (): void => {}
    const released = new Promise<void>((resolve) => (release = resolve))
    let locked = (): void => {}
    const isLocked = new Promise<void>((resolve) => (locked = resolve))
    const holding = holder.begin(async (tx) => {
      await tx`LOCK TABLE rate_limit_counters IN ACCESS EXCLUSIVE MODE`
      locked()
      await released
    })
    await isLocked

    try {
      const started = Date.now()
      expect(await submit(a)).toBe(404)
      // A second one is admitted too: nothing is being counted.
      expect(await submit(a)).toBe(404)
      const login = await a.inject({ method: 'POST', url: '/auth/login', payload: ADMIN })
      expect(login.statusCode).toBe(503)
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(lines).toHaveLength(1)
    } finally {
      // Whatever failed above, the lock goes: held, it would stop every case after this one.
      release()
      await holding
    }
    // Counting again. The counts the abandoned statements make once the lock goes are not
    // waited for: whichever lands first, the client is over its budget of one.
    await vi.waitFor(async () => expect(await submit(a)).toBe(429))
    expect(lines).toHaveLength(2)
  })
})

describe('expired counters', () => {
  test('are deleted, so the table holds about one window of clients', async () => {
    // Every client that ever made a request leaves a row. A row whose window has ended is
    // never read again — the next request from that client starts it over — so keeping it
    // only grows the table.
    const limit = { submissionRateLimit: { max: 10, timeWindowMs: 50 } }
    const a = await replica(limit, { sweepEveryMs: 0 })

    await submit(a, '203.0.113.1')
    await new Promise((resolve) => setTimeout(resolve, 100))
    await submit(a, '203.0.113.2')

    await vi.waitFor(async () => {
      const keys = (await sql<{ key: string }[]>`SELECT key FROM rate_limit_counters`).map((row) => row.key)
      expect(keys).toEqual(['POST /f/:path/submissions 203.0.113.2'])
    })
  })
})

describe('the table', () => {
  test('is unlogged: a counter is not worth a write-ahead log entry', async () => {
    // Every limited request writes it. Logged, each write waits for the log to reach the disk
    // and travels to every standby and backup; a counter lost in a crash costs one window of
    // budget, which is less than that (0170).
    const [table] = await sql<{ relpersistence: string }[]>`
      SELECT relpersistence FROM pg_class WHERE relname = 'rate_limit_counters'`

    expect(table?.relpersistence).toBe('u')
  })

  test('is added on start, to a database that predates it', async () => {
    // MIGRATIONS.md says there is nothing to run. A database from before the table gains it
    // when the server starts, and starting twice does not fail.
    await sql`DROP TABLE rate_limit_counters`
    await bootstrapSchema(sql)
    await bootstrapSchema(sql)

    const [table] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM pg_class WHERE relname = 'rate_limit_counters'`
    expect(table?.count).toBe(1)
  })
})
