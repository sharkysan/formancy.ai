import { describe, expect, test } from 'vitest'
import {
  BREAKER_COOLDOWN_MS,
  BREAKER_THRESHOLD,
  afterWebhookAttempt,
  breakerState,
  healthOf,
  mayAttempt,
} from './breaker.js'
import type { WebhookRecord } from './ports.js'

/**
 * Stopping, when a destination has plainly stopped listening.
 *
 * The retry schedule is per delivery; this is per destination, and the
 * difference is the whole point. A form taking a submission a minute produces
 * a minute's worth of deliveries, each independently trying eight times
 * against an endpoint that has been returning 502 since Tuesday.
 */
const hook = (over: Partial<WebhookRecord> = {}): WebhookRecord => ({
  id: 'w1',
  formId: 'f1',
  url: 'https://example.ch/hook',
  secret: 'whsec_x',
  consecutiveFailures: 0,
  openedAt: null,
  ...over,
})

const at = (iso: string): Date => new Date(iso)
const NOON = '2026-09-25T12:00:00.000Z'

describe('opening', () => {
  test('one failure is a bad minute, not an outage', () => {
    const after = afterWebhookAttempt(hook(), false, at(NOON))

    // A deploy, a timeout, a receiver restarting. Opening on one would make
    // every routine blip a visible outage.
    expect(after.consecutiveFailures).toBe(1)
    expect(after.openedAt).toBeNull()
    expect(mayAttempt(after, at(NOON))).toBe(true)
  })

  test('three in a row is a destination that is not coming back on its own', () => {
    let current = hook()
    for (let i = 0; i < BREAKER_THRESHOLD; i += 1) {
      current = afterWebhookAttempt(current, false, at(NOON))
    }

    expect(current.openedAt).toBe(NOON)
    expect(breakerState(current, at(NOON))).toBe('open')
    expect(mayAttempt(current, at(NOON))).toBe(false)
  })

  test('a success clears it completely, rather than decaying the count', () => {
    const failing = hook({ consecutiveFailures: 2 })

    const after = afterWebhookAttempt(failing, true, at(NOON))

    // Decaying would leave a destination that fails twice for every success
    // permanently one blip from opening. That destination is working.
    expect(after.consecutiveFailures).toBe(0)
    expect(after.openedAt).toBeNull()
  })
})

describe('the cool-down', () => {
  const open = hook({ consecutiveFailures: BREAKER_THRESHOLD, openedAt: NOON })

  test('holds everything back while it runs', () => {
    const soon = new Date(at(NOON).getTime() + BREAKER_COOLDOWN_MS - 1000)

    expect(breakerState(open, soon)).toBe('open')
  })

  test('earns ONE attempt, not a return to normal', () => {
    const later = new Date(at(NOON).getTime() + BREAKER_COOLDOWN_MS)

    // Half-open rather than closed. Closing on the clock alone would send the
    // whole backlog at a destination that has not answered yet.
    expect(breakerState(open, later)).toBe('half-open')
    expect(mayAttempt(open, later)).toBe(true)
  })

  test('a failed probe starts it again rather than letting the next one through', () => {
    const later = new Date(at(NOON).getTime() + BREAKER_COOLDOWN_MS)

    const after = afterWebhookAttempt(open, false, later)

    expect(after.openedAt).toBe(later.toISOString())
    expect(breakerState(after, later)).toBe('open')
  })

  test('a successful probe closes it', () => {
    const later = new Date(at(NOON).getTime() + BREAKER_COOLDOWN_MS)

    const after = afterWebhookAttempt(open, true, later)

    expect(breakerState(after, later)).toBe('closed')
  })
})

describe('what a person is shown', () => {
  test('answers "is this working, and since when"', () => {
    const open = hook({ consecutiveFailures: 7, openedAt: NOON })

    const health = healthOf(open, at(NOON))

    // The question somebody asks when the CRM has no leads this week.
    expect(health).toMatchObject({
      url: 'https://example.ch/hook',
      state: 'open',
      consecutiveFailures: 7,
      failingSince: NOON,
    })
  })

  test('and says nothing is wrong when nothing is', () => {
    expect(healthOf(hook(), at(NOON))).toMatchObject({
      state: 'closed',
      failingSince: null,
    })
  })

  test('never carries the secret', () => {
    // It is shown on a screen. The signing secret is not a health indicator.
    expect(JSON.stringify(healthOf(hook(), at(NOON)))).not.toContain('whsec_x')
  })
})
