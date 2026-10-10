import postgres from 'postgres'
import type { FastifyBaseLogger } from 'fastify'
import type { FastifyRateLimitStore, FastifyRateLimitStoreCtor } from '@fastify/rate-limit'
import { databaseNotices } from './server-log.js'

/**
 * How long a request waits for its count before its limit decides without one (0170).
 *
 * Far above what a count takes when the database is well — the record has the measurement —
 * and short enough that a database which has stopped answering costs each limited request a
 * second rather than the thirty the driver waits to connect. The database ends a count at the
 * same bound, so one abandoned there does not go on holding its connection.
 */
export const COUNT_TIMEOUT_MS = 1_000

/**
 * The connections the counter has of its own (0170).
 *
 * Its own, because a count waiting for a lock held a connection that storage queried on, and
 * the queries sent after it on that connection waited for the lock too: with the table locked,
 * a few more limited requests than storage had connections stopped every route, unlimited ones
 * included. A few, because each is one more against the database's own limit on connections.
 */
export const COUNTER_CONNECTIONS = 4

/**
 * The most counts sent and not yet answered: eight pipelined on each connection.
 *
 * Measured (0170): one a connection counted a third to a half as many a second as storage's ten
 * connections had, and eight a connection more. A count past this waits in the process, where
 * one abandoned at the bound is dropped unsent — so no more than this can land late.
 */
export const COUNTS_AT_ONCE = 8 * COUNTER_CONNECTIONS

/** How often, at most, a count also deletes the counters whose window has ended. */
export const SWEEP_EVERY_MS = 10 * 60_000

export interface PostgresRateLimitOptions {
  /** {@link COUNT_TIMEOUT_MS} unless a test needs a slow database to be slow sooner. */
  readonly timeoutMs?: number
  /** {@link SWEEP_EVERY_MS} unless a test needs to see a sweep. */
  readonly sweepEveryMs?: number
  /**
   * The server's log (0168), where the counter says that it stopped answering, that it answers
   * again and that a sweep failed — each an event from `LOG_EVENTS`, by what was thrown and never
   * its words, which name the database's address — and where its connections' notices go.
   * Without one it says nothing, as `createApp` without one keeps no log: a host embedding both
   * decides.
   */
  readonly log?: FastifyBaseLogger
}

/** The counter: a store for `createApp`, and its connections, for whoever made it to end. */
export interface PostgresRateLimits {
  /** `@fastify/rate-limit`'s store, which `createApp` takes as `rateLimitStore`. */
  readonly store: FastifyRateLimitStoreCtor
  /** Closes the counter's connections, once the app that counts in them is closed. */
  readonly end: () => Promise<void>
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
 * It opens its own connections from the database's address rather than taking a pool, because
 * which connections it counts on is what keeps a counter that cannot answer from stopping
 * everything else: handed the pool storage queries on, it would count correctly and bring that
 * outage back. A count that does not come back within the bound is abandoned: one still waiting
 * here to be sent is dropped unsent, and one already sent is ended by the database once it runs,
 * by the `statement_timeout` of these connections, with no cancel request — a connection more —
 * needed for it. The error the plugin is handed says nothing about the database, because a route
 * that refuses without a count sends it to whoever asked; what each route does then is its own
 * declaration (`rate-limits.ts`).
 *
 * The plugin's in-memory store is the second implementation of the same interface, and what
 * `createApp` counts in when it is given none.
 */
export function createPostgresRateLimitStore(
  databaseUrl: string,
  options: PostgresRateLimitOptions = {},
): PostgresRateLimits {
  const timeoutMs = options.timeoutMs ?? COUNT_TIMEOUT_MS
  const sweepEveryMs = options.sweepEveryMs ?? SWEEP_EVERY_MS
  const log = options.log
  const sql = postgres(databaseUrl, {
    max: COUNTER_CONNECTIONS,
    connection: { statement_timeout: timeoutMs },
    // By their code, as storage's are, rather than printed whole by the driver.
    onnotice: databaseNotices(log),
  })

  // Whether the last count was answered: said when it changes, not once a request.
  let answering = true
  let sweptAt = Date.now()
  let sweeping = false

  // Statements sent and not yet answered, never more than COUNTS_AT_ONCE: past that the driver
  // would queue them itself, and send each in turn whether anybody still waited for it or not.
  // The rest wait here, in order.
  let running = 0
  const waiting: Array<() => void> = []

  function done(): void {
    running--
    waiting.shift()?.()
  }

  function count(key: string, windowMs: number): Promise<{ current: number; ttl: number }> {
    return new Promise((resolve, reject) => {
      const send = (): void => {
        running++
        sql<Array<{ current: number; ttl: number }>>`
          INSERT INTO rate_limit_counters AS counter (key, hits, resets_at)
          VALUES (${key}, 1, now() + ${windowMs}::double precision * interval '1 millisecond')
          ON CONFLICT (key) DO UPDATE SET
            hits = CASE WHEN counter.resets_at <= now() THEN 1 ELSE counter.hits + 1 END,
            resets_at = CASE WHEN counter.resets_at <= now() THEN excluded.resets_at ELSE counter.resets_at END
          RETURNING hits AS current, ceil(extract(epoch FROM resets_at - now()) * 1000)::integer AS ttl`
          .then(
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
          .finally(done)
      }
      const timer = setTimeout(() => {
        const queued = waiting.indexOf(send)
        if (queued !== -1) waiting.splice(queued, 1)
        reject(late())
      }, timeoutMs)
      if (running < COUNTS_AT_ONCE) send()
      else waiting.push(send)
    })
  }

  /** On the back of a count, at most once per interval, one at a time, and never waited for. */
  function sweep(): void {
    const now = Date.now()
    if (sweeping || running >= COUNTS_AT_ONCE || now - sweptAt < sweepEveryMs) return
    sweptAt = now
    sweeping = true
    running++
    sql
      .begin(async (tx) => {
        // However long it takes: a table grown past what one bound deletes — a flood from many
        // addresses — would otherwise fail every sweep and never shrink.
        await tx`SELECT set_config('statement_timeout', '0', true)`
        await tx`DELETE FROM rate_limit_counters WHERE resets_at <= now()`
      })
      .then(
        () => {},
        (error: unknown) => log?.error({ event: 'ratelimit.sweep.failed', err: error }),
      )
      .finally(() => {
        sweeping = false
        done()
      })
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
            // At the level of the line it ends: below it, a log kept for errors would show a
            // counter that stopped and never one that came back.
            log?.error({ event: 'ratelimit.answering' })
          }
          callback(null, result)
        },
        (error: unknown) => {
          if (answering) {
            answering = false
            // Until it answers, each limit admits uncounted or refuses with a 503, as it declares.
            log?.error({ event: 'ratelimit.unanswered', err: error })
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

  // Whatever is still on the database by then is a count nobody waits for, or a sweep the next
  // start does again; neither is worth holding a shutdown past the bound.
  return { store: PostgresRateLimitStore, end: () => sql.end({ timeout: timeoutMs / 1_000 }) }
}

/** What a route that refuses without a count answers: a 503, and nothing about the database. */
function uncounted(): Error {
  return Object.assign(
    new Error('This request could not be counted against its limit, so it was not taken. Try again in a moment.'),
    { statusCode: 503, code: 'RATE_LIMIT_UNAVAILABLE' },
  )
}

/**
 * A count not answered within the bound. Its own code, because the log writes an error's kind
 * and code and nothing else: without one, a database too slow to count — a lock on the table, a
 * flood — reads the same as any other failure, and the operator cannot tell which to look for.
 */
function late(): Error {
  return Object.assign(new Error('The count was not answered within its bound.'), { code: 'RATE_LIMIT_TIMEOUT' })
}
