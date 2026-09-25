import type { WebhookRecord } from './ports.js'

/**
 * Stopping, when a destination has plainly stopped listening.
 *
 * ── WHY A BREAKER AT ALL ────────────────────────────────────────────────────
 *
 * The retry schedule already gives up after eight attempts, per delivery. That
 * is the wrong unit when the *destination* is down: a form taking a submission
 * a minute produces a minute's worth of deliveries, each independently trying
 * eight times against an endpoint that has been returning 502 since Tuesday.
 * The receiver gets hammered, the worker spends its batch on work that cannot
 * succeed, and the deliveries that might have worked queue behind it.
 *
 * So failure is counted per WEBHOOK as well as per delivery. Enough
 * consecutive failures and the breaker opens: nothing is attempted for that
 * webhook until a cool-down passes, then exactly one delivery goes through as
 * a probe. It succeeds and the breaker closes; it fails and the cool-down
 * starts again.
 *
 * ── AND WHY IT IS VISIBLE ───────────────────────────────────────────────────
 *
 * A self-hoster has no operations team watching a dashboard. A webhook that
 * has been failing for six hours has to be visible *in the product*, or it is
 * discovered when somebody asks why the CRM has no leads this week. That is
 * the reason `consecutiveFailures` and `openedAt` live on the record rather
 * than in the worker's memory: memory does not survive a restart and cannot be
 * shown on a screen.
 *
 * Everything here is a pure function of a record and a clock, for the same
 * reason `afterAttempt` is: these are the decisions, and decisions tangled
 * into network code can only be tested by making requests.
 */

/**
 * How many consecutive failures open the breaker.
 *
 * Three, not one. A single failure is a bad minute — a deploy, a timeout, a
 * receiver restarting — and opening on it would make every routine blip a
 * visible outage. Three in a row is a destination that is not coming back on
 * its own.
 */
export const BREAKER_THRESHOLD = 3

/**
 * How long the breaker stays shut before one probe is allowed through.
 *
 * Five minutes: long enough that a restarting receiver is finished, short
 * enough that nobody notices the delay once it recovers. The retry schedule
 * handles patience within a delivery; this handles patience about a
 * destination.
 */
export const BREAKER_COOLDOWN_MS = 5 * 60 * 1000

/** Shut, letting one through, or open. */
export type BreakerState = 'closed' | 'half-open' | 'open'

export function breakerState(webhook: WebhookRecord, now: Date): BreakerState {
  if (webhook.consecutiveFailures < BREAKER_THRESHOLD) return 'closed'
  if (webhook.openedAt === null) return 'closed'

  const since = now.getTime() - new Date(webhook.openedAt).getTime()
  // Half-open rather than closed: the cool-down earns ONE attempt, not a
  // return to normal. Closing on the clock alone would send the whole backlog
  // at a destination that has not answered yet.
  return since >= BREAKER_COOLDOWN_MS ? 'half-open' : 'open'
}

/** Whether a delivery for this webhook may be attempted now. */
export function mayAttempt(webhook: WebhookRecord, now: Date): boolean {
  return breakerState(webhook, now) !== 'open'
}

/**
 * The webhook's health after one attempt against it.
 *
 * A success always closes the breaker completely. Decaying the count instead
 * would leave a destination that fails twice for every success permanently
 * one blip from opening, and that destination is working.
 */
export function afterWebhookAttempt(
  webhook: WebhookRecord,
  ok: boolean,
  now: Date,
): WebhookRecord {
  if (ok) {
    return { ...webhook, consecutiveFailures: 0, openedAt: null }
  }

  const consecutiveFailures = webhook.consecutiveFailures + 1
  const opening = consecutiveFailures >= BREAKER_THRESHOLD
  return {
    ...webhook,
    consecutiveFailures,
    // Re-stamped on every failure once open, so a probe that fails starts the
    // cool-down again rather than letting the next one through immediately.
    openedAt: opening ? now.toISOString() : webhook.openedAt,
  }
}

/**
 * What a person is shown about a webhook's health.
 *
 * Shaped for a screen rather than for a log: the question being answered is
 * "is this working, and if not since when", which is what somebody asks when
 * the CRM has no leads this week.
 */
export interface WebhookHealth {
  id: string
  url: string
  state: BreakerState
  consecutiveFailures: number
  /** When it stopped working, or null while it is working. */
  failingSince: string | null
}

export function healthOf(webhook: WebhookRecord, now: Date): WebhookHealth {
  return {
    id: webhook.id,
    url: webhook.url,
    state: breakerState(webhook, now),
    consecutiveFailures: webhook.consecutiveFailures,
    failingSince: webhook.openedAt,
  }
}
