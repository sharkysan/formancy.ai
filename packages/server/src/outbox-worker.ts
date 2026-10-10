import { drainOutbox } from '@formancy/server-core'
import type { Storage } from '@formancy/server-core'
import { deliver } from './deliver.js'
import { workerLog } from './server-log.js'
import type { WorkerLog } from './server-log.js'

/**
 * Runs the outbox on a timer.
 *
 * Everything that decides anything — whether to retry, when, when to give up —
 * is in @formancy/server-core and tested without a network. This is only the
 * clock and the wiring, which is why it is short.
 *
 * NOT a distributed queue. `claimDueDeliveries` does not lock rows, so two
 * replicas would both pick up the same delivery and send it twice. The event
 * id is stable across attempts precisely so a receiver can dedupe that, but a
 * multi-replica deployment should still run exactly one worker until the claim
 * takes a lock. Said plainly here rather than discovered in production.
 */
export interface WorkerHandle {
  stop: () => void
}

export function startOutboxWorker(
  storage: Storage,
  options: { intervalMs?: number; allowHttp?: boolean; allowPrivateAddresses?: boolean; log?: WorkerLog } = {},
): WorkerHandle {
  const interval = options.intervalMs ?? 5_000
  const log = workerLog(options.log)
  let stopped = false
  let running = false

  const tick = async (): Promise<void> => {
    // One pass at a time. Overlapping passes would let a slow receiver cause
    // the same delivery to be picked up twice by this very process.
    if (running || stopped) return
    running = true
    try {
      await drainOutbox({
        storage,
        now: () => new Date(),
        random: () => Math.random(),
        send: async (delivery, webhook, nowSeconds) =>
          deliver(
            {
              url: webhook.url,
              body: delivery.body,
              secret: webhook.secret,
              eventId: delivery.eventId,
              attempt: delivery.attempt + 1,
              nowSeconds,
            },
            {
              allowHttp: options.allowHttp ?? false,
              allowPrivateAddresses: options.allowPrivateAddresses ?? false,
            },
          ),
      })
    } catch (error) {
      // A worker that throws is a worker that stops. Deliveries retry on their
      // own schedule, so the right response to an unexpected failure is to
      // complain and come back — with what was thrown as its kind and code, never
      // its words, which for a query are its parameters (C3).
      log.error({ event: 'outbox.failed', err: error })
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), interval)
  // Do not hold the process open: a server whose only remaining work is an
  // empty poll should be able to exit.
  timer.unref?.()

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
  }
}
