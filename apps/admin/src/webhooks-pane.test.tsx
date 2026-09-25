import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { WebhooksPane } from './webhooks-pane.js'
import { setToken } from './api.js'

/**
 * The pane a self-hoster actually looks at.
 *
 * The breaker's counters live on the webhook row rather than in the worker's
 * memory so that they can be shown here. What is pinned below is the part that
 * would be silently wrong: a failing destination that reads as fine, a state
 * carried only by a colour, and a replay whose refusal is swallowed.
 */
const HEALTH = [
  {
    id: 'w-ok',
    url: 'https://crm.example.ch/hook',
    state: 'closed' as const,
    consecutiveFailures: 0,
    failingSince: null,
  },
  {
    id: 'w-down',
    url: 'https://billing.example.ch/hook',
    state: 'open' as const,
    consecutiveFailures: 9,
    failingSince: '2026-09-25T08:00:00.000Z',
  },
]

const DEAD = [
  {
    id: 'd1',
    webhookId: 'w-down',
    submissionId: 'ab12cd34-0000-4000-8000-000000000000',
    eventId: 'e1',
    attempt: 8,
    lastError: 'Receiver answered 502.',
  },
]

interface Stub {
  readonly calls: string[]
  replayStatus?: number
  replayBody?: unknown
  healthFails?: boolean
}

function serve(stub: Stub): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      stub.calls.push(`${init?.method ?? 'GET'} ${url}`)
      const json = (body: unknown, status = 200): Response =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })

      if (url.endsWith('/webhooks')) {
        return Promise.resolve(stub.healthFails === true ? json({}, 500) : json({ webhooks: HEALTH }))
      }
      if (url.endsWith('/deliveries/dead')) return Promise.resolve(json({ deliveries: DEAD }))
      return Promise.resolve(json(stub.replayBody ?? {}, stub.replayStatus ?? 202))
    }),
  )
}

beforeEach(() => {
  sessionStorage.clear()
  setToken('t_abc')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('what is failing', () => {
  test('a destination that has stopped delivering says so, and since when', async () => {
    serve({ calls: [] })
    render(<WebhooksPane />)

    const row = (await screen.findByText('https://billing.example.ch/hook')).closest(
      'tr',
    ) as HTMLElement
    // The question somebody asks when the CRM has no leads this week.
    expect(within(row).getByText('Not delivering')).toBeTruthy()
    expect(within(row).getByText('9')).toBeTruthy()
    expect(within(row).getByText(/2026-09-25/)).toBeTruthy()
  })

  test('the state is a word, not only a colour', async () => {
    serve({ calls: [] })
    render(<WebhooksPane />)

    // 1.4.1: a state carried by a red dot alone is a state somebody cannot
    // perceive. "Open" is also jargon, so it is not the word used.
    expect(await screen.findByText('Working')).toBeTruthy()
    expect(screen.getByText('Not delivering')).toBeTruthy()
  })

  test('a server that will not answer is said out loud', async () => {
    serve({ calls: [], healthFails: true })
    render(<WebhooksPane />)

    // A pane showing nothing is indistinguishable from a deployment where
    // nothing has failed, which is the one reading it must never give by
    // accident.
    expect(await screen.findByRole('status')).toBeTruthy()
  })
})

describe('what died', () => {
  test('is listed with the error that killed it', async () => {
    serve({ calls: [] })
    render(<WebhooksPane />)

    expect(await screen.findByText('Receiver answered 502.')).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
  })

  test('replaying one sends it, and the row says so rather than vanishing', async () => {
    const user = userEvent.setup()
    const stub: Stub = { calls: [] }
    serve(stub)
    render(<WebhooksPane />)

    await user.click(await screen.findByRole('button', { name: /Replay ab12cd34/ }))

    await waitFor(() => expect(screen.getByText('Queued again')).toBeTruthy())
    expect(stub.calls).toContain('POST /api/deliveries/d1/replay')
    // Marked rather than removed: a list that shrinks as you work leaves you
    // unsure which one you pressed.
    expect(screen.getByText('Receiver answered 502.')).toBeTruthy()
  })

  test('a refusal is shown, not swallowed', async () => {
    const user = userEvent.setup()
    serve({
      calls: [],
      replayStatus: 409,
      replayBody: { error: 'not_dead', message: 'Only a dead delivery can be replayed.' },
    })
    render(<WebhooksPane />)

    await user.click(await screen.findByRole('button', { name: /Replay ab12cd34/ }))

    // Somebody else replayed it, or it went through on its own. Both are
    // worth telling the operator plainly.
    expect(await screen.findByText(/Only a dead delivery can be replayed/)).toBeTruthy()
    expect(screen.queryByText('Queued again')).toBeNull()
  })
})

describe('refreshing', () => {
  test('is asked for, not done on a timer', async () => {
    const user = userEvent.setup()
    const stub: Stub = { calls: [] }
    serve(stub)
    render(<WebhooksPane />)
    await screen.findByText('Receiver answered 502.')
    const before = stub.calls.length

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    // A pane that refreshes itself every five seconds hides a stale reading
    // behind a number that keeps moving, and an operator looking at a failure
    // wants it to hold still.
    await waitFor(() => expect(stub.calls.length).toBeGreaterThan(before))
  })
})
