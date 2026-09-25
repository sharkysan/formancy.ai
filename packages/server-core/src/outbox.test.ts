import { beforeEach, describe, expect, test, vi } from 'vitest'
import { afterAttempt, drainOutbox, replayDelivery } from './outbox.js'
import type { AttemptOutcome } from './outbox.js'
import { createMemoryStorage } from './testing/memory-storage.js'
import type { DeliveryRecord, Storage } from './ports.js'
import { MAX_ATTEMPTS } from './webhook.js'

const NOW = new Date('2026-09-20T12:00:00.000Z')

const delivery = (over: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'd1',
  webhookId: 'w1',
  submissionId: 's1',
  eventId: 'ev1',
  body: '{}',
  attempt: 0,
  nextAttemptAt: NOW.toISOString(),
  state: 'pending',
  lastError: null,
  ...over,
})

describe('afterAttempt', () => {
  test('a success is final', () => {
    const next = afterAttempt(delivery(), { ok: true, status: 200 }, NOW, () => 0.5)

    expect(next.state).toBe('delivered')
    expect(next.lastError).toBeNull()
  })

  test('a failure is scheduled again, later', () => {
    const next = afterAttempt(delivery(), { ok: false, status: 503 }, NOW, () => 0.9)

    expect(next.state).toBe('pending')
    expect(next.attempt).toBe(1)
    expect(new Date(next.nextAttemptAt).getTime()).toBeGreaterThan(NOW.getTime())
    expect(next.lastError).toContain('503')
  })

  test('the last attempt is dead, not deleted', () => {
    const next = afterAttempt(
      delivery({ attempt: MAX_ATTEMPTS - 1 }),
      { ok: false, error: 'connect ETIMEDOUT' },
      NOW,
      () => 0.5,
    )

    // The row is the evidence that something was supposed to be sent and never
    // arrived. A self-hoster with no operations team has to be able to find it.
    expect(next.state).toBe('dead')
    expect(next.lastError).toBe('connect ETIMEDOUT')
  })

  test('a dead delivery keeps the reason it died of', () => {
    const next = afterAttempt(
      delivery({ attempt: MAX_ATTEMPTS - 1 }),
      { ok: false, status: 404 },
      NOW,
      () => 0.5,
    )

    expect(next.lastError).toContain('404')
  })
})

describe('drainOutbox', () => {
  let storage: Storage
  let sent: string[]

  beforeEach(async () => {
    storage = createMemoryStorage()
    sent = []
    await storage.createForm({
      id: 'f1',
      path: 'contact',
      currentVersionId: null,
      accessSubmit: 'public',
      allowedOrigins: null,
    })
    await storage.insertWebhook({
      id: 'w1',
      formId: 'f1',
      url: 'https://example.ch/hook',
      secret: 'whsec_x',
      consecutiveFailures: 0,
      openedAt: null,
    })
  })

  const deps = (send: (d: DeliveryRecord) => Promise<AttemptOutcome>) => ({
    storage,
    send: async (d: DeliveryRecord) => {
      sent.push(d.id)
      return send(d)
    },
    now: () => NOW,
    random: () => 0.5,
  })

  const queue = async (over: Partial<DeliveryRecord> = {}): Promise<void> => {
    await storage.insertSubmission(
      { id: 's1', formId: 'f1', formVersionId: 'v1', data: {}, submittedAt: NOW.toISOString() },
      [delivery(over)],
    )
  }

  test('sends what is due and marks it delivered', async () => {
    await queue()

    const count = await drainOutbox(deps(async () => ({ ok: true, status: 200 })))

    expect(count).toBe(1)
    expect(sent).toEqual(['d1'])
    expect(await storage.claimDueDeliveries(NOW.toISOString(), 10)).toEqual([])
  })

  test('leaves a future delivery alone', async () => {
    await queue({ nextAttemptAt: '2026-09-20T13:00:00.000Z' })

    expect(await drainOutbox(deps(async () => ({ ok: true })))).toBe(0)
    expect(sent).toEqual([])
  })

  test('a thrown send fails that delivery without abandoning the batch', async () => {
    await queue()

    await drainOutbox(
      deps(async () => {
        throw new Error('socket hang up')
      }),
    )

    // Letting it escape would lose every remaining delivery in the batch.
    const still = await storage.claimDueDeliveries('2099-01-01T00:00:00.000Z', 10)
    expect(still[0]?.state).toBe('pending')
    expect(still[0]?.lastError).toContain('socket hang up')
  })

  test('a delivery whose webhook is gone dies rather than retrying forever', async () => {
    await queue({ webhookId: 'deleted' })

    await drainOutbox(deps(async () => ({ ok: true })))

    expect(sent).toEqual([])
    const all = await storage.claimDueDeliveries('2099-01-01T00:00:00.000Z', 10)
    // claimDue only returns pending, so a dead one is absent from it.
    expect(all).toEqual([])
  })
})

/**
 * The breaker, from the drain's side.
 *
 * `breaker.test.ts` covers when it opens; this covers what the worker does
 * about it, which is the part that protects the receiver and the batch.
 */
describe('a destination that has stopped listening', () => {
  const openHook = {
    id: 'w-open',
    formId: 'f1',
    url: 'https://example.ch/hook',
    secret: 'whsec_x',
    consecutiveFailures: 3,
    openedAt: '2026-09-25T12:00:00.000Z',
  }

  test('is not attempted while the breaker is open', async () => {
    const storage = createMemoryStorage()
    await storage.createForm({
      id: 'f1',
      path: 'p',
      currentVersionId: null,
      accessSubmit: 'authenticated',
      allowedOrigins: null,
    })
    await storage.insertWebhook(openHook)
    await storage.updateDelivery({
      id: 'd1',
      webhookId: 'w-open',
      submissionId: 's1',
      eventId: 'e1',
      body: '{}',
      attempt: 1,
      nextAttemptAt: '2026-09-25T12:00:00.000Z',
      state: 'pending',
      lastError: 'was 502',
    })

    const send = vi.fn()
    const attempted = await drainOutbox({
      storage,
      send,
      now: () => new Date('2026-09-25T12:01:00.000Z'),
      random: () => 0.5,
    })

    // Nothing was posted, and the caller is told nothing was attempted — so
    // a poller draining until the queue is quiet does not spin on a dead
    // endpoint.
    expect(send).not.toHaveBeenCalled()
    expect(attempted).toBe(0)
  })

  test('and being skipped does not cost the delivery an attempt', async () => {
    const storage = createMemoryStorage()
    await storage.createForm({
      id: 'f1',
      path: 'p',
      currentVersionId: null,
      accessSubmit: 'authenticated',
      allowedOrigins: null,
    })
    await storage.insertWebhook(openHook)
    await storage.updateDelivery({
      id: 'd1',
      webhookId: 'w-open',
      submissionId: 's1',
      eventId: 'e1',
      body: '{}',
      attempt: 1,
      nextAttemptAt: '2026-09-25T12:00:00.000Z',
      state: 'pending',
      lastError: 'was 502',
    })

    await drainOutbox({
      storage,
      send: vi.fn(),
      now: () => new Date('2026-09-25T12:01:00.000Z'),
      random: () => 0.5,
    })

    // Charging one would spend a delivery's eight tries on a destination it
    // never reached.
    const after = await storage.getDelivery('d1')
    expect(after?.attempt).toBe(1)
    expect(after?.state).toBe('pending')
    // Pushed out, so the next batch is not the same rows again.
    expect(after?.nextAttemptAt).not.toBe('2026-09-25T12:00:00.000Z')
  })
})

describe('replaying a dead delivery', () => {
  const deadOne = {
    id: 'd-dead',
    webhookId: 'w1',
    submissionId: 's1',
    eventId: 'e1',
    body: '{}',
    attempt: 8,
    nextAttemptAt: '2026-09-25T10:00:00.000Z',
    state: 'dead' as const,
    lastError: 'Receiver answered 502.',
  }

  const now = () => new Date('2026-09-25T12:00:00.000Z')

  test('puts it back in the queue, with its attempts reset', async () => {
    const storage = createMemoryStorage()
    await storage.updateDelivery(deadOne)

    const outcome = await replayDelivery({ storage, now }, 'd-dead')

    expect(outcome.ok).toBe(true)
    const after = await storage.getDelivery('d-dead')
    // A new run against a destination somebody has looked at and decided is
    // fixed. Carrying the count over would give it one try before dying
    // again, which is a formality rather than a replay.
    expect(after).toMatchObject({ state: 'pending', attempt: 0 })
    expect(after?.nextAttemptAt).toBe('2026-09-25T12:00:00.000Z')
  })

  test('refuses one that is still pending', async () => {
    const storage = createMemoryStorage()
    await storage.updateDelivery({ ...deadOne, state: 'pending' })

    const outcome = await replayDelivery({ storage, now }, 'd-dead')

    // It is already queued. Replaying would duplicate it.
    expect(outcome).toMatchObject({ ok: false, kind: 'not-dead', state: 'pending' })
  })

  test('refuses one that was delivered', async () => {
    const storage = createMemoryStorage()
    await storage.updateDelivery({ ...deadOne, state: 'delivered' })

    const outcome = await replayDelivery({ storage, now }, 'd-dead')

    // The event id is stable across retries so a well-behaved receiver would
    // ignore the second. This service does not get to assume that.
    expect(outcome).toMatchObject({ ok: false, kind: 'not-dead' })
  })

  test('and one that does not exist', async () => {
    const outcome = await replayDelivery({ storage: createMemoryStorage(), now }, 'nope')

    expect(outcome).toMatchObject({ ok: false, kind: 'unknown' })
  })
})
