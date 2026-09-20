import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryStorage } from '@formancy/server-core'
import type { DeliveryRecord, Storage } from '@formancy/server-core'
import { startOutboxWorker } from './outbox-worker.js'

/**
 * The clock, which is all this file is.
 *
 * Everything that decides anything — whether to retry, when, when to give up —
 * lives in `@formancy/server-core` and is tested there without a network. What
 * is left here is worth its own tests for three reasons that are all about
 * timing: a pass must not overlap itself, a thrown pass must not stop the
 * timer, and `stop()` must actually stop it. Each of those is a bug that only
 * shows up after hours of running.
 */
const NOW = '2026-09-20T12:00:00.000Z'

const delivery = (over: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  id: 'd1',
  webhookId: 'w1',
  submissionId: 's1',
  eventId: 'ev1',
  body: '{}',
  attempt: 0,
  nextAttemptAt: NOW,
  state: 'pending',
  lastError: null,
  ...over,
})

async function seed(storage: Storage, deliveries: DeliveryRecord[]): Promise<void> {
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
    // Refused before a socket is opened, which is the point: these tests are
    // about the timer, and a worker that reached the network would be testing
    // somebody else's DNS.
    url: 'https://127.0.0.1/hook',
    secret: 'whsec_test',
  })
  await storage.insertSubmission(
    { id: 's1', formId: 'f1', formVersionId: 'v1', data: {}, submittedAt: NOW },
    deliveries,
  )
}

/** Let the pass's promise chain settle without advancing the fake clock. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve()
}

describe('startOutboxWorker', () => {
  let storage: Storage

  beforeEach(async () => {
    vi.useFakeTimers()
    storage = createMemoryStorage()
    await seed(storage, [delivery()])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('does nothing until the first interval elapses', async () => {
    startOutboxWorker(storage, { intervalMs: 1000 })

    await settle()

    // A worker that drained on construction would surprise a caller who
    // started it before finishing their own setup.
    const due = await storage.claimDueDeliveries('2099-01-01T00:00:00.000Z', 10)
    expect(due[0]?.attempt).toBe(0)
  })

  test('attempts a due delivery, and records the failure rather than losing it', async () => {
    startOutboxWorker(storage, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    const due = await storage.claimDueDeliveries('2099-01-01T00:00:00.000Z', 10)
    expect(due[0]?.attempt).toBe(1)
    expect(due[0]?.state).toBe('pending')
    // Refused by the address guard, which is what a loopback URL should do.
    expect(due[0]?.lastError).toContain('127.0.0.1')
  })

  test('stop() means stop', async () => {
    const worker = startOutboxWorker(storage, { intervalMs: 1000 })
    worker.stop()

    await vi.advanceTimersByTimeAsync(10_000)
    await settle()

    const due = await storage.claimDueDeliveries('2099-01-01T00:00:00.000Z', 10)
    expect(due[0]?.attempt).toBe(0)
  })

  test('a pass that throws does not stop the timer', async () => {
    // A worker that dies on one bad pass is a worker that looks fine and
    // delivers nothing, which is the failure hardest to notice.
    const failing: Storage = {
      ...storage,
      claimDueDeliveries: vi
        .fn<Storage['claimDueDeliveries']>()
        .mockRejectedValueOnce(new Error('connection terminated'))
        .mockImplementation(async (nowIso, limit) => storage.claimDueDeliveries(nowIso, limit)),
    }
    const complained = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    startOutboxWorker(failing, { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(complained).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(failing.claimDueDeliveries).toHaveBeenCalledTimes(2)
  })

  test('a slow pass suppresses the next tick rather than overlapping it', async () => {
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow: Storage = {
      ...storage,
      claimDueDeliveries: vi.fn<Storage['claimDueDeliveries']>().mockImplementation(async () => {
        await held
        return []
      }),
    }

    startOutboxWorker(slow, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(3000)
    await settle()

    // Three ticks, one pass. Overlapping them would let a slow receiver cause
    // this very process to send the same delivery twice.
    expect(slow.claimDueDeliveries).toHaveBeenCalledTimes(1)

    release()
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(slow.claimDueDeliveries).toHaveBeenCalledTimes(2)
  })

  test('the escape hatches reach delivery, or they are decoration', async () => {
    // allowPrivateAddresses is the difference between refusing this loopback
    // URL before opening a socket and trying to connect to it. Nothing is
    // listening, so both fail — but they fail differently, and the difference
    // is the whole feature.
    startOutboxWorker(storage, { intervalMs: 1000, allowHttp: true, allowPrivateAddresses: true })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    const due = await storage.claimDueDeliveries('2099-01-01T00:00:00.000Z', 10)
    expect(due[0]?.attempt).toBe(1)
    expect(due[0]?.lastError).not.toContain('not reachable from here')
  })
})
