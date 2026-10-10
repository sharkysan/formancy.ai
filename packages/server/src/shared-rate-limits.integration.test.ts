import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { FastifyRateLimitStore } from '@fastify/rate-limit'
import type { Completer } from '@formancy/server-core'
import { createApp, SCHEMA_HASH_HEADER } from './app.js'
import type { AppOptions } from './app.js'
import { bootstrapSchema } from './db.js'
import { createPostgresStorage } from './postgres-storage.js'
import { COUNTS_AT_ONCE, createPostgresRateLimitStore } from './postgres-rate-limits.js'
import type { PostgresRateLimitOptions, PostgresRateLimits } from './postgres-rate-limits.js'
import { createServerLog } from './server-log.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Two replicas over one real PostgreSQL, each with its own connections, counting in the one
 * table (0170).
 *
 * Every limit used to count in the process that answered, so behind N replicas it allowed N
 * times what it said — the login limit and the model's per session included. What is under
 * test is that the count is the database's: that a request on one replica spends the budget
 * the other one checks, that budgets stay per route and per client, that a window runs on the
 * database's clock from a key's first request, what happens while the counter cannot answer —
 * and that the rest of the server does not wait with it — and that expired counters go, and
 * only those. Real SQL because the defect is about what two processes see of one row, and the
 * stall about what a lock does to a connection.
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

/** The shared counter, on connections of its own, as `main.ts` opens it. */
function counter(store: PostgresRateLimitOptions = {}): PostgresRateLimits {
  const counting = createPostgresRateLimitStore(container.getConnectionUri(), store)
  opened.push({ close: counting.end })
  return counting
}

/** The server's log into an array: the lines it has written so far, and their events. */
function events(): { log: FastifyBaseLogger; lines: () => Array<Record<string, unknown>>; written: () => unknown[] } {
  const written: string[] = []
  const lines = (): Array<Record<string, unknown>> => written.map((line) => JSON.parse(line) as Record<string, unknown>)
  return {
    log: createServerLog({ write: (line: string) => written.push(line) }, 'info'),
    lines,
    written: () => lines().map((line) => line['event']),
  }
}

/** A replica, wired as `main.ts` wires one: its own connections, the shared storage and the shared counter. */
async function replica(
  options: Omit<AppOptions, 'authSecret'> = {},
  store: PostgresRateLimitOptions = {},
): Promise<FastifyInstance> {
  const own = connection()
  const app = await createApp(createPostgresStorage(own), {
    authSecret: SECRET,
    rateLimitStore: counter(store).store,
    ...options,
  })
  opened.push(app)
  return app
}

/**
 * Holds `rate_limit_counters` locked from a connection of its own until the returned function
 * is called: a database that answers everything except the counter.
 */
async function lockTheCounter(): Promise<() => Promise<void>> {
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
  return async () => {
    release()
    await holding
  }
}

/** How many counts are on the database waiting for a lock on the counter's table. */
async function countsWaitingForTheLock(): Promise<number> {
  const [row] = await sql<{ waiting: number }[]>`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE wait_event_type = 'Lock' AND query LIKE '%INSERT INTO rate_limit_counters%'`
  return row?.waiting ?? 0
}

/** `work`, or `'no answer'` when it has not settled within `ms`. */
async function within<T>(ms: number, work: Promise<T>): Promise<T | 'no answer'> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<'no answer'>((resolve) => (timer = setTimeout(() => resolve('no answer'), ms)))
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/** One count on `store`, as the plugin asks for it. */
function countOn(store: FastifyRateLimitStore, key: string, windowMs: number): Promise<{ current: number; ttl: number }> {
  return new Promise((resolve, reject) => {
    store.incr(key, (error, result) => (error === null && result !== undefined ? resolve(result) : reject(error)), windowMs, 1_000)
  })
}

/** Every key in the table. */
async function keys(): Promise<string[]> {
  return (await sql<{ key: string }[]>`SELECT key FROM rate_limit_counters ORDER BY key`).map((row) => row.key)
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

    expect(await keys()).toEqual(['POST /f/:path/drafts 203.0.113.1', 'POST /f/:path/submissions 203.0.113.1'])
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
  test("runs on the database's clock, so a replica whose clock runs ahead does not end it early", async () => {
    // A window kept by each process's own clock ends at a different moment on each, and on a
    // replica whose clock runs ahead it has already ended: that one hands out a fresh budget
    // early. Both replicas share this process, so its clock is moved on to tell them apart.
    const limit = { submissionRateLimit: { max: 1, timeWindowMs: 60_000 } }
    const a = await replica(limit)
    const b = await replica(limit)

    expect(await submit(a)).toBe(404)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 10 * 60_000)
      expect(await submit(b)).toBe(429)
    } finally {
      vi.useRealTimers()
    }
  })

  test("is fixed from a key's first request, so one refused late in it does not push its end back", async () => {
    // A window whose end moved with every request, refused ones included, would never end for a
    // client that keeps trying — a form that retries on its own, a sign-in tried again — and a
    // limit of so many a minute would be a lockout for as long as they kept at it.
    const limit = { submissionRateLimit: { max: 1, timeWindowMs: 2_000 } }
    const a = await replica(limit)
    const b = await replica(limit)

    expect(await submit(a)).toBe(404)
    // Taken after the answer, so the window ends no later than two seconds from here.
    const first = Date.now()
    const at = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, first + ms - Date.now())))
    await at(1_200)
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

    await at(2_200)
    expect(await submit(b)).toBe(404)
  })
})

describe('a counter slower than its bound', () => {
  test('admits a respondent, refuses a login, and tells the operator when it starts and stops', async () => {
    // The table held by somebody else's lock is a database that answers everything except the
    // counter, slowly. The bound is what a request waits before its limit decides without a
    // count: the public plane goes on, login does not (0170).
    const said = events()
    const options = { bootstrapAdmin: ADMIN, submissionRateLimit: { max: 1, timeWindowMs: 60_000 } }
    const a = await replica(options, { timeoutMs: 300, log: said.log })
    const unlock = await lockTheCounter()

    try {
      const started = Date.now()
      expect(await submit(a)).toBe(404)
      // A second one is admitted too: nothing is being counted.
      expect(await submit(a)).toBe(404)
      const login = await a.inject({ method: 'POST', url: '/auth/login', payload: ADMIN })
      expect(login.statusCode).toBe(503)
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(said.written()).toEqual(['ratelimit.unanswered'])
    } finally {
      // Whatever failed above, the lock goes: held, it would stop every case after this one.
      await unlock()
    }
    // Counting again. Whether or not a count abandoned under the lock lands once it goes, the
    // client is over its budget of one within two more.
    await vi.waitFor(async () => expect(await submit(a)).toBe(429))
    expect(said.written()).toEqual(['ratelimit.unanswered', 'ratelimit.answering'])
  })

  test('holds none of the connections the rest of the server queries on', async () => {
    // A count abandoned at the bound kept its connection, and the queries sent after it on that
    // connection waited for the lock too. With more limited requests than storage has
    // connections, every query after them — a form's read, which no limit counts, included —
    // waited behind a count nobody was waiting for any more: the whole server stopped
    // answering, which is the outage admitting uncounted exists to prevent (0170).
    const storageConnections = connection().options.max
    const a = await replica({ submissionRateLimit: { max: 1_000, timeWindowMs: 60_000 } }, { timeoutMs: 300 })
    const unlock = await lockTheCounter()

    try {
      const clients = Array.from({ length: storageConnections + 2 }, (_, index) => `203.0.113.${index + 1}`)
      const submissions = await within(5_000, Promise.all(clients.map((client) => submit(a, client))))
      const read = await within(
        5_000,
        a.inject({ method: 'GET', url: '/f/no-such-form' }).then((response) => response.statusCode),
      )

      // Each admitted uncounted, and the form's read answered: there is no such form.
      expect({ submissions, read }).toEqual({ submissions: clients.map(() => 404), read: 404 })
    } finally {
      await unlock()
    }
  })

  test('has the database end a count it abandoned, rather than leave it holding its connection', async () => {
    // Abandoned only in the process, a count went on waiting for the lock on the database and
    // held its connection until whoever held the lock let go. Ended there at the bound, it frees
    // the connection without a cancel request, which would cost a connection more.
    const a = await replica({}, { timeoutMs: 300 })
    const unlock = await lockTheCounter()

    try {
      const admitted = submit(a)
      // On the database and waiting, or the next line would pass without a count to end.
      await vi.waitFor(async () => expect(await countsWaitingForTheLock()).toBe(1))
      expect(await admitted).toBe(404)
      await vi.waitFor(async () => expect(await countsWaitingForTheLock()).toBe(0), { timeout: 3_000 })
    } finally {
      await unlock()
    }
  })

  test('never sends a count that waited past the bound to be sent', async () => {
    // Queued in the driver, every count abandoned while the counter could not answer was still
    // sent, each once the one before it had timed out: the process kept them all for as long as
    // the lock lasted, and when it went they all landed, late, against a client admitted long
    // since. Dropped where they wait instead, no more can land than had been sent.
    const a = await replica({ submissionRateLimit: { max: 10_000, timeWindowMs: 60_000 } }, { timeoutMs: 300 })
    const attempts = COUNTS_AT_ONCE * 4
    const unlock = await lockTheCounter()

    try {
      // Each within the bound, uncounted: one waiting to be sent gives up there, as one sent does.
      const answers = await within(5_000, Promise.all(Array.from({ length: attempts }, () => submit(a))))
      expect(answers).toEqual(Array.from({ length: attempts }, () => 404))
    } finally {
      await unlock()
    }
    // Anything still to land lands within milliseconds of the lock going.
    await new Promise((resolve) => setTimeout(resolve, 1_000))

    const [row] = await sql<{ hits: number }[]>`
      SELECT hits FROM rate_limit_counters WHERE key = 'POST /f/:path/submissions 203.0.113.1'`
    expect(row?.hits ?? 0).toBeLessThanOrEqual(COUNTS_AT_ONCE)
  })
})

describe('expired counters', () => {
  test('are deleted, and a counter still in its window is not', async () => {
    // Every client that ever made a request leaves a row. A row whose window has ended is never
    // read again — the next request from that client starts it over — so keeping it only grows
    // the table. A sweep that took more than those would hand every client a fresh budget each
    // time a replica swept.
    const counting = counter({ sweepEveryMs: 500 })
    const store = new counting.store({})

    await countOn(store, 'ended', 50)
    await countOn(store, 'live', 60_000)
    // Past the first window and past the interval: the next count sweeps, the only one that does,
    // and the live row was written before it.
    await new Promise((resolve) => setTimeout(resolve, 600))
    await countOn(store, 'sweeps', 60_000)

    await vi.waitFor(async () => expect(await keys()).not.toContain('ended'))
    const [live] = await sql<{ hits: number }[]>`SELECT hits FROM rate_limit_counters WHERE key = 'live'`
    expect(live?.hits).toBe(1)
  })

  test('are deleted by a sweep slower than a count may be', async () => {
    // A sweep held to a count's bound would fail every time on a table grown past what one bound
    // deletes — a flood from many addresses — and the table would never shrink again. A lock
    // makes this one slow.
    await sql`INSERT INTO rate_limit_counters (key, hits, resets_at) VALUES ('ended', 1, now() - interval '1 second')`
    const said = events()
    const counting = counter({ timeoutMs: 200, sweepEveryMs: 0, log: said.log })
    const store = new counting.store({})
    const unlock = await lockTheCounter()

    try {
      // Abandoned at the bound; the sweep on its back waits for the lock, three bounds and more.
      await countOn(store, 'sweeps', 60_000).catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 600))
    } finally {
      await unlock()
    }

    await vi.waitFor(async () => expect(await keys()).not.toContain('ended'))
    expect(said.written()).not.toContain('ratelimit.sweep.failed')
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

  test('counts nothing for a role without its grants, and the log says why by its code', async () => {
    // MIGRATIONS.md asks a role granted table by table for four privileges on this table. Without
    // them every count fails — every sign-in refused, the public plane uncounted — and the line
    // that says so is the operator's one clue: PostgreSQL's code for it, never its words.
    await sql`DROP ROLE IF EXISTS counter_without_grants`
    await sql`CREATE ROLE counter_without_grants LOGIN PASSWORD 'without-grants'`
    const url = new URL(container.getConnectionUri())
    url.username = 'counter_without_grants'
    url.password = 'without-grants'
    const said = events()
    const counting = createPostgresRateLimitStore(url.toString(), { log: said.log })
    opened.push({ close: counting.end })

    await expect(countOn(new counting.store({}), 'refused', 60_000)).rejects.toMatchObject({ statusCode: 503 })

    expect(said.lines()).toEqual([expect.objectContaining({ level: 'error', event: 'ratelimit.unanswered', code: '42501' })])
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
