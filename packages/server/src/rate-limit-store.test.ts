import { channel } from 'node:diagnostics_channel'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { FastifyInstance, RouteOptions } from 'fastify'
import type { FastifyRateLimitStore, FastifyRateLimitStoreCtor, RateLimitOptions } from '@fastify/rate-limit'
import { createMemoryStorage } from '@formancy/server-core'
import type { Completer, CompletionPrompt, Storage } from '@formancy/server-core'
import { createApp } from './app.js'
import type { AppOptions } from './app.js'
import type { DeploymentModel } from './routes/model.js'
import { createPostgresRateLimitStore } from './postgres-rate-limits.js'

/**
 * Which store every limit counts in, and what each limit does when that store cannot answer
 * (0170).
 *
 * The limits are read from the routes as Fastify registers them, through its
 * `fastify.initialization` diagnostics channel — the hook a tracer uses to see an instance
 * before anything is registered on it — so a limit added to a route plugin tomorrow is in the
 * list without anybody writing it here, and a list in this file cannot go stale.
 *
 * In memory, apart from the database that is not there: what is under test is the wiring
 * between a route's limit and the store `createApp` was given. Two replicas over one real
 * PostgreSQL are `shared-rate-limits.integration.test.ts`.
 */
const SECRET = 'a-test-secret-that-is-long-enough-to-sign'
const ADMIN = { email: 'root@test.ch', password: 'root-password-1' }

interface Limit {
  readonly method: string
  readonly url: string
  readonly rateLimit: RateLimitOptions
}

const apps: FastifyInstance[] = []
const counters: Array<{ end: () => Promise<void> }> = []

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const counter of counters.splice(0)) await counter.end()
})

/** An app, and every limit its routes registered while it was built. */
async function built(storage: Storage, options: Omit<AppOptions, 'authSecret'>): Promise<{
  app: FastifyInstance
  limits: Limit[]
}> {
  const limits: Limit[] = []
  const initialization = channel('fastify.initialization')
  const watch = (message: unknown): void => {
    const { fastify } = message as { fastify: FastifyInstance }
    fastify.addHook('onRoute', (route: RouteOptions) => {
      const rateLimit = (route.config as { rateLimit?: RateLimitOptions | false } | undefined)?.rateLimit
      if (rateLimit === undefined || rateLimit === false) return
      for (const method of [route.method].flat()) limits.push({ method, url: route.url, rateLimit })
    })
  }
  initialization.subscribe(watch)
  try {
    const app = await createApp(storage, { authSecret: SECRET, ...options })
    apps.push(app)
    return { app, limits }
  } finally {
    initialization.unsubscribe(watch)
  }
}

/** A session for the bootstrap admin, signed in on an app whose limits count normally. */
async function adminSession(storage: Storage): Promise<string> {
  const { app } = await built(storage, { bootstrapAdmin: ADMIN })
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: ADMIN })
  return (login.json() as { token: string }).token
}

/** A request to a limited route, with each parameter filled in and the admin's session. */
function reach(app: FastifyInstance, limit: Limit, token: string) {
  return app.inject({
    method: limit.method as 'GET',
    url: limit.url.replace(/:([^/]+)/g, (_, name: string) => `${name}-1`),
    headers: { authorization: `Bearer ${token}` },
    ...(limit.method === 'GET' || limit.method === 'HEAD' ? {} : { payload: {} }),
  })
}

/** A store that answers every count and remembers which route asked. */
function recording(): { store: FastifyRateLimitStoreCtor; counted: string[] } {
  const counted: string[] = []
  class Recording implements FastifyRateLimitStore {
    readonly route: string
    constructor(_options?: unknown, route = '') {
      this.route = route
    }
    incr(_key: string, callback: (error: Error | null, result?: { current: number; ttl: number }) => void): void {
      counted.push(this.route)
      callback(null, { current: 1, ttl: 60_000 })
    }
    child(options: Parameters<FastifyRateLimitStore['child']>[0]): FastifyRateLimitStore {
      // The route as the plugin hands it over: `routeInfo`, which its own Redis store reads
      // and its types do not declare.
      const { method, url } = (options as unknown as { routeInfo: { method: string; url: string } }).routeInfo
      return new Recording(undefined, `${method} ${url}`)
    }
  }
  return { store: Recording, counted }
}

/** A store over a PostgreSQL nobody is listening for: every count fails, at once. */
function unreachable(report: (line: string) => void = () => {}, sweepEveryMs?: number): FastifyRateLimitStoreCtor {
  const counter = createPostgresRateLimitStore('postgres://formancy:formancy@127.0.0.1:1/formancy', {
    timeoutMs: 2_000,
    report,
    ...(sweepEveryMs === undefined ? {} : { sweepEveryMs }),
  })
  counters.push(counter)
  return counter.store
}

/** A model that records what it was asked, so a refused request can be shown to cost nothing. */
function model(): { model: DeploymentModel; asked: CompletionPrompt[] } {
  const asked: CompletionPrompt[] = []
  const completer: Completer = {
    complete: (prompt) => {
      asked.push(prompt)
      return Promise.resolve({ ok: true, text: '{}' })
    },
  }
  return { model: { provider: 'anthropic', model: 'claude-test', completer }, asked }
}

describe('the limits the routes register', () => {
  test('are found, so the cases below check something', async () => {
    // A guard on the guard: a hook that stopped seeing routes would make every case below
    // pass over an empty list. Each plane's limits are in it, and the form's own read — the
    // one public route deliberately not limited — is not.
    const { limits } = await built(createMemoryStorage(), {})
    const routes = limits.map((limit) => `${limit.method} ${limit.url}`)

    expect(routes).toContain('POST /f/:path/submissions')
    expect(routes).toContain('POST /auth/login')
    expect(routes).toContain('POST /model/complete')
    expect(routes).not.toContain('GET /f/:path')
  })

  test('each name the window the plugin reads, and say what they do when they cannot be counted', async () => {
    // Two ways a limit is quietly not the limit it reads as. `timeWindowMs` is this app's own
    // name for the window, and the plugin does not read it: one route passed it and silently
    // took the global window instead. And a limit that does not say whether it admits or
    // refuses when its counter fails gets the plugin's default — an error, a 500 carrying
    // whatever the store said — which nobody chose (0170).
    const { limits } = await built(createMemoryStorage(), {})

    const unsaid = limits
      .filter(({ rateLimit }) => typeof rateLimit.skipOnError !== 'boolean')
      .map(({ method, url }) => `${method} ${url}`)
    const misnamed = limits
      .filter(({ rateLimit }) => typeof rateLimit.timeWindow !== 'number' || 'timeWindowMs' in rateLimit)
      .map(({ method, url }) => `${method} ${url}`)

    expect(unsaid).toEqual([])
    expect(misnamed).toEqual([])
  })
})

describe('every limit', () => {
  test('counts in the store the app was given, never one of its own', async () => {
    // The defect: every limit counted in the plugin's default store, which lives in the
    // process, so N replicas allowed N times every limit. A limit that is not counted in the
    // store passed in is one that still does.
    const storage = createMemoryStorage()
    const token = await adminSession(storage)
    const { store, counted } = recording()
    const { app, limits } = await built(storage, { rateLimitStore: store })

    const uncounted: string[] = []
    for (const limit of limits) {
      const route = `${limit.method} ${limit.url}`
      counted.length = 0
      await reach(app, limit, token)
      if (!counted.includes(route)) uncounted.push(route)
    }

    expect(limits.length).toBeGreaterThan(0)
    expect(uncounted).toEqual([])
  })

  test('does what it says when its counter cannot answer: admits uncounted, or refuses with 503', async () => {
    // Read from each limit's own declaration, so this holds whichever way a route decides. A
    // route that says it admits and refuses anyway is an outage of that route whenever the
    // database is; one that says it refuses and admits anyway is a limit that switches off
    // whenever somebody can make the database slow.
    const storage = createMemoryStorage()
    const token = await adminSession(storage)
    const { app, limits } = await built(storage, { rateLimitStore: unreachable() })

    const wrong: string[] = []
    for (const limit of limits) {
      const response = await reach(app, limit, token)
      // Unsaid is the plugin's default, which is not to skip: the store's error, as a 500.
      const admits = limit.rateLimit.skipOnError === true
      const refused = response.statusCode === 503
      if (refused === admits) wrong.push(`${limit.method} ${limit.url}: ${response.statusCode}`)
    }

    expect(limits.length).toBeGreaterThan(0)
    expect(wrong).toEqual([])
  })
})

describe('when the counter cannot answer', () => {
  test('a respondent is admitted, uncounted', async () => {
    // Every public route needs the database for its own work, so when the database is down it
    // fails on its own and refusing first adds nothing; when only the counter fails, refusing
    // would make a fault in the defence an outage of every form (0170).
    const { app } = await built(createMemoryStorage(), { rateLimitStore: unreachable() })

    const response = await app.inject({
      method: 'POST',
      url: '/f/contact-us/submissions',
      headers: { 'x-formancy-schema-hash': 'whatever' },
      payload: {},
    })

    // The form does not exist: the request reached the route, past the limit.
    expect(response.statusCode).toBe(404)
  })

  test('a login is refused, and the answer says nothing about the database', async () => {
    // Guessing a password is what this limit is for, and the one an attacker gains most from
    // switching off — and login needs the database anyway, so refusing costs nothing a
    // working database would have given. The store's own error names the address it could not
    // reach; that is the operator's, not the anonymous caller's.
    const { app } = await built(createMemoryStorage(), { bootstrapAdmin: ADMIN, rateLimitStore: unreachable() })

    const response = await app.inject({ method: 'POST', url: '/auth/login', payload: ADMIN })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ code: 'RATE_LIMIT_UNAVAILABLE' })
    expect(response.body).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|5432|postgres/i)
  })

  test('the model is refused, and not asked', async () => {
    // The route does not need the database — sessions are signed, and its audit row never
    // throws — so admitting it uncounted would make a database outage an unlimited spend on
    // the operator's key by every session (hazard C9).
    const storage = createMemoryStorage()
    const token = await adminSession(storage)
    const { model: configured, asked } = model()
    const { app } = await built(storage, { model: configured, rateLimitStore: unreachable() })

    const response = await app.inject({
      method: 'POST',
      url: '/model/complete',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'authoring', user: 'Add a field' },
    })

    expect(response.statusCode).toBe(503)
    expect(asked).toEqual([])
  })

  test('the operator is told once, not once a request', async () => {
    // Admitting uncounted is silent to the respondent by design, so the process says it — once
    // when the counter stops answering, rather than a line per request that buries everything
    // else in the log while the database is down.
    const lines: string[] = []
    const { app } = await built(createMemoryStorage(), { rateLimitStore: unreachable((line) => lines.push(line)) })

    for (let attempt = 0; attempt < 3; attempt++) {
      await app.inject({ method: 'POST', url: '/f/contact-us/submissions', payload: {} })
    }

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/rate limits/i)
  })

  test('a sweep that fails is said, and takes nothing down', async () => {
    // Nobody waits for a sweep, so nobody would catch it: a rejection left unhandled ends a
    // Node process, and a database that went away would take every replica down with it at
    // its next sweep. Said instead, like a sweep of spent challenges that fails.
    const lines: string[] = []
    const { app } = await built(createMemoryStorage(), {
      rateLimitStore: unreachable((line) => lines.push(line), 0),
    })

    const response = await app.inject({ method: 'POST', url: '/f/contact-us/submissions', payload: {} })

    expect(response.statusCode).toBe(400)
    await vi.waitFor(() => expect(lines.some((line) => /expired counters could not be deleted/.test(line))).toBe(true))
  })
})
