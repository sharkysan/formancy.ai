import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  fetchDeadDeliveries,
  fetchWebhookHealth,
  replayDelivery,
} from './api.js'
import type { DeadDeliveryEntry, WebhookHealthEntry } from './api.js'

/**
 * Which destinations are failing, and what died on the way to them.
 *
 * This is the argument in
 * [0058](../../../docs/decisions/0058-a-breaker-per-destination.md) finishing.
 * The breaker's counters live on the webhook row rather than in the worker's
 * memory *so that they can be shown here* — a self-hoster has no operations
 * team watching a dashboard, so a destination that has been refusing
 * deliveries since Tuesday has to be answerable from the product. Otherwise it
 * is discovered when somebody asks why the CRM has no leads this week.
 *
 * Two things it will not do. It does not poll: a pane that refreshes itself
 * every five seconds is a pane that hides a stale reading behind a number that
 * keeps moving, and an operator looking at a failure wants it to hold still.
 * And it does not hide a replayed row — it marks it, because a list that
 * silently shrinks as you work leaves you unsure whether you pressed the right
 * one.
 */
export function WebhooksPane(): ReactElement {
  const [health, setHealth] = useState<WebhookHealthEntry[] | undefined>(undefined)
  const [dead, setDead] = useState<DeadDeliveryEntry[] | undefined>(undefined)
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const [replayed, setReplayed] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    setProblem(undefined)
    try {
      const [hooks, deliveries] = await Promise.all([fetchWebhookHealth(), fetchDeadDeliveries()])
      setHealth(hooks)
      setDead(deliveries)
    } catch (error) {
      // Said out loud. A pane that silently shows nothing is indistinguishable
      // from a deployment where nothing has failed, which is the one reading
      // it must never give by accident.
      setProblem(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const replay = async (id: string): Promise<void> => {
    setBusy(id)
    setProblem(undefined)
    const outcome = await replayDelivery(id)
    setBusy(undefined)
    if (outcome.ok) {
      setReplayed((before) => new Set([...before, id]))
      return
    }
    setProblem(outcome.message ?? 'The replay was refused.')
  }

  return (
    <div className="wb-body" style={{ overflow: 'auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Destinations</h3>
        <button type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {problem === undefined ? null : (
        <p className="wb-problem" role="status">
          {problem}
        </p>
      )}

      {health === undefined ? (
        <p>Loading…</p>
      ) : health.length === 0 ? (
        <p>No webhooks are configured.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', marginBlockStart: '0.5rem' }}>
          <thead>
            <tr>
              <th style={cell}>Destination</th>
              <th style={cell}>State</th>
              <th style={cell}>Failures in a row</th>
              <th style={cell}>Failing since</th>
            </tr>
          </thead>
          <tbody>
            {health.map((hook) => (
              <tr key={hook.id}>
                <td style={cell}>
                  <code>{hook.url}</code>
                </td>
                <td style={cell}>
                  {/* The word, not a colour. A state carried only by a red dot
                      is a state somebody cannot perceive (WCAG 1.4.1). */}
                  <span data-state={hook.state}>{LABELS[hook.state]}</span>
                </td>
                <td style={cell}>{hook.consecutiveFailures}</td>
                <td style={cell}>{hook.failingSince ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginBlockStart: '2rem' }}>Deliveries that died</h3>
      {dead === undefined ? (
        <p>Loading…</p>
      ) : dead.length === 0 ? (
        <p>Nothing has run out of attempts.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>Submission</th>
              <th style={cell}>Attempts</th>
              <th style={cell}>Last error</th>
              <th style={cell}> </th>
            </tr>
          </thead>
          <tbody>
            {dead.map((delivery) => (
              <tr key={delivery.id}>
                <td style={cell}>
                  <code>{delivery.submissionId.slice(0, 8)}…</code>
                </td>
                <td style={cell}>{delivery.attempt}</td>
                <td style={cell}>{delivery.lastError ?? '—'}</td>
                <td style={cell}>
                  {replayed.has(delivery.id) ? (
                    // Marked rather than removed: a list that shrinks as you
                    // work leaves you unsure which one you pressed.
                    <span>Queued again</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === delivery.id}
                      onClick={() => void replay(delivery.id)}
                    >
                      {busy === delivery.id ? 'Sending…' : `Replay ${delivery.submissionId.slice(0, 8)}`}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Plain words. "Open" means nothing to somebody who has not read the ADR. */
const LABELS: Readonly<Record<WebhookHealthEntry['state'], string>> = {
  closed: 'Working',
  'half-open': 'Trying again',
  open: 'Not delivering',
}

const cell = { textAlign: 'left', padding: '0.3rem 1rem' } as const
