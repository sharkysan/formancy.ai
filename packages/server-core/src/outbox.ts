import type { DeliveryRecord, Storage, WebhookRecord } from './ports.js'
import { MAX_ATTEMPTS, retryDelayMs } from './webhook.js'

/**
 * What to do with a delivery once an attempt has finished.
 *
 * Pure, and separate from the thing that does the posting, because this is
 * where the decisions are: whether to retry, when, and when to stop. Tangled
 * into the network code those decisions are only testable by making requests.
 */

export interface AttemptOutcome {
  ok: boolean
  status?: number
  error?: string
}

export function afterAttempt(
  delivery: DeliveryRecord,
  outcome: AttemptOutcome,
  now: Date,
  random: () => number,
): DeliveryRecord {
  const attempt = delivery.attempt + 1

  if (outcome.ok) {
    return { ...delivery, attempt, state: 'delivered', lastError: null }
  }

  const reason = outcome.error ?? `Receiver answered ${String(outcome.status ?? 0)}.`

  if (attempt >= MAX_ATTEMPTS) {
    // Dead, not deleted. The row is the evidence that something was supposed
    // to be sent and never arrived, and a self-hoster with no operations team
    // needs to be able to find it and replay it.
    return { ...delivery, attempt, state: 'dead', lastError: reason }
  }

  return {
    ...delivery,
    attempt,
    state: 'pending',
    nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempt, random)).toISOString(),
    lastError: reason,
  }
}

export interface OutboxDeps {
  storage: Storage
  /** Posts one delivery. Injected so the loop is testable without a network. */
  send: (
    delivery: DeliveryRecord,
    webhook: WebhookRecord,
    nowSeconds: number,
  ) => Promise<AttemptOutcome>
  now: () => Date
  random: () => number
}

/**
 * Drain one batch of due deliveries.
 *
 * Returns how many were attempted, so a caller can decide whether to come back
 * immediately or wait. Deliberately one batch rather than a loop that runs
 * forever: the thing that decides *when* to run belongs to the host, and a
 * function that never returns cannot be tested.
 */
export async function drainOutbox(deps: OutboxDeps, limit = 20): Promise<number> {
  const now = deps.now()
  const due = await deps.storage.claimDueDeliveries(now.toISOString(), limit)

  for (const delivery of due) {
    // A webhook deleted since the row was queued leaves nothing to deliver to.
    // Marked dead rather than retried forever against a destination that no
    // longer exists.
    const webhook = await findWebhook(deps.storage, delivery.webhookId)
    if (webhook === undefined) {
      await deps.storage.updateDelivery({
        ...delivery,
        state: 'dead',
        lastError: 'The webhook it was queued for no longer exists.',
      })
      continue
    }

    let outcome: AttemptOutcome
    try {
      outcome = await deps.send(delivery, webhook, Math.floor(now.getTime() / 1000))
    } catch (error) {
      // A thrown send is a failed attempt, not a lost job. Letting it escape
      // would abandon every remaining delivery in the batch.
      outcome = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }

    await deps.storage.updateDelivery(afterAttempt(delivery, outcome, now, deps.random))
  }

  return due.length
}

async function findWebhook(storage: Storage, id: string): Promise<WebhookRecord | undefined> {
  // The port lists per form rather than by id, which is the shape every other
  // caller wants; this is the one place that pays for it.
  const forms = await storage.listForms()
  for (const form of forms) {
    const hooks = await storage.webhooksForForm(form.id)
    const found = hooks.find((hook) => hook.id === id)
    if (found !== undefined) return found
  }
  return undefined
}
