import type { RateLimitOptions } from '@fastify/rate-limit'

/** So many requests in so many milliseconds: a limit as `AppOptions` takes it. */
export interface Budget {
  readonly max: number
  readonly timeWindowMs: number
}

/**
 * What a limit does when its count cannot be had — the shared store failing, or slower than
 * its bound (0170).
 *
 * - `admit`: the request goes on, uncounted. For a route that needs the database for its own
 *   work anyway, where the person refused would be a respondent: refusing adds nothing when
 *   the database is down, and turns a fault in the counter into an outage of every form when
 *   it is not.
 * - `refuse`: a 503. For a limit that is what stands between somebody and a thing worth
 *   having — guesses at a password, or the operator's money at a model's provider.
 */
export type WhenUncounted = 'admit' | 'refuse'

/**
 * A route's `config.rateLimit`.
 *
 * The failure mode is an argument, so no limit can be written without saying it; left to the
 * plugin, it is an error, which a route answers as a 500 nobody chose. And the window is
 * translated here, once: `timeWindowMs` is this app's name for it and the plugin does not
 * read it, which one route found out by silently taking the global window instead.
 */
export function limited(budget: Budget, whenUncounted: WhenUncounted): RateLimitOptions {
  return { max: budget.max, timeWindow: budget.timeWindowMs, skipOnError: whenUncounted === 'admit' }
}
