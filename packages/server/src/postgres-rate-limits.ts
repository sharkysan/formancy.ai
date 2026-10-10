import type postgres from 'postgres'
import type { FastifyRateLimitStore, FastifyRateLimitStoreCtor } from '@fastify/rate-limit'

/**
 * How long a request waits for its count before its limit decides without one (0170).
 *
 * Far above what a count takes when the database is well — the record has the measurement —
 * and short enough that a database which has stopped answering costs each limited request a
 * second rather than the thirty the driver waits to connect.
 */
export const COUNT_TIMEOUT_MS = 1_000

/** How often, at most, a count also deletes the counters whose window has ended. */
export const SWEEP_EVERY_MS = 10 * 60_000

export interface PostgresRateLimitOptions {
  /** {@link COUNT_TIMEOUT_MS} unless a test needs a slow database to be slow sooner. */
  readonly timeoutMs?: number
  /** {@link SWEEP_EVERY_MS} unless a test needs to see a sweep. */
  readonly sweepEveryMs?: number
  /** Where the process says the counter stopped or started answering; `console.error` by default. */
  readonly report?: (line: string) => void
}

/**
 * `@fastify/rate-limit`'s store over the PostgreSQL every replica already shares (0170).
 *
 * The plugin's own store keeps its counts in the process, so behind N replicas each limit
 * allowed N times what it said. This one keeps them in `rate_limit_counters`, one row per
 * route and client, and counts with one statement: the upsert takes the row's lock, so two
 * replicas counting the same client at once are counted one after the other and neither
 * increment is lost.
 *
 * A window starts at a key's first request and lasts the route's `timeWindow`, as the plugin's
 * own stores do it, on the database's clock — one clock for every replica, where each
 * process's own would end the window at a different moment on each.
 *
 * When the database does not answer within the bound, the count is abandoned, not cancelled:
 * cancelling costs a connection to a database that is already not answering, so the statement
 * runs whenever it can and may count its request late. The error the plugin is handed says
 * nothing about the database, because a route that refuses without a count sends it to
 * whoever asked; what each route does then is its own declaration (`rate-limits.ts`).
 *
 * The plugin's in-memory store is the second implementation of the same interface, and what
 * `createApp` counts in when it is given none.
 */
export function createPostgresRateLimitStore(
  sql: postgres.Sql,
  options: PostgresRateLimitOptions = {},
): FastifyRateLimitStoreCtor {
  const timeoutMs = options.timeoutMs ?? COUNT_TIMEOUT_MS
  const sweepEveryMs = options.sweepEveryMs ?? SWEEP_EVERY_MS
  const report = options.report ?? ((line: string) => console.error(line))

  // Whether the last count was answered: said when it changes, not once a request.
  let answering = true
  let sweptAt = Date.now()

  function count(key: string, windowMs: number): Promise<{ current: number; ttl: number }> {
    const counted = sql<Array<{ current: number; ttl: number }>>`
      INSERT INTO rate_limit_counters AS counter (key, hits, resets_at)
      VALUES (${key}, 1, now() + ${windowMs}::double precision * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN counter.resets_at <= now() THEN 1 ELSE counter.hits + 1 END,
        resets_at = CASE WHEN counter.resets_at <= now() THEN excluded.resets_at ELSE counter.resets_at END
      RETURNING hits AS current, ceil(extract(epoch FROM resets_at - now()) * 1000)::integer AS ttl`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs)
      counted.then(
        ([row]) => {
          clearTimeout(timer)
          if (row === undefined) reject(new Error('the count returned no row'))
          else resolve(row)
        },
        (error: unknown) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }

  /** On the back of a count, at most once per interval, and never waited for. */
  function sweep(): void {
    const now = Date.now()
    if (now - sweptAt < sweepEveryMs) return
    sweptAt = now
    sql`DELETE FROM rate_limit_counters WHERE resets_at <= now()`.then(
      () => {},
      (error: unknown) => report(`rate limits: expired counters could not be deleted (${reason(error)})`),
    )
  }

  class PostgresRateLimitStore implements FastifyRateLimitStore {
    readonly #route: string

    constructor(_options?: unknown, route = '') {
      this.#route = route
    }

    incr(
      key: string,
      callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
      timeWindow: number,
    ): void {
      count(`${this.#route}${key}`, timeWindow).then(
        (result) => {
          if (!answering) {
            answering = true
            report('rate limits: the counter in PostgreSQL is answering again')
          }
          callback(null, result)
        },
        (error: unknown) => {
          if (answering) {
            answering = false
            report(
              `rate limits: the counter in PostgreSQL is not answering (${reason(error)}); until it does, ` +
                'each limit admits requests uncounted or refuses them with 503, as it declares (decision 0170)',
            )
          }
          callback(uncounted())
        },
      )
      sweep()
    }

    child(routeOptions: Parameters<FastifyRateLimitStore['child']>[0]): FastifyRateLimitStore {
      // The plugin hands a route over as `routeInfo` (its index.js, and its own Redis store
      // reads it there); its type definitions say otherwise, so it is read as it arrives. The
      // route is part of the key, or every limit an address has would be one budget.
      const { method, url } = (routeOptions as unknown as { routeInfo: { method: string | string[]; url: string } })
        .routeInfo
      return new PostgresRateLimitStore(undefined, `${[method].flat().join(',')} ${url} `)
    }
  }

  return PostgresRateLimitStore
}

/** What a route that refuses without a count answers: a 503, and nothing about the database. */
function uncounted(): Error {
  return Object.assign(
    new Error('This request could not be counted against its limit, so it was not taken. Try again in a moment.'),
    { statusCode: 503, code: 'RATE_LIMIT_UNAVAILABLE' },
  )
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
