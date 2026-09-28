import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { FormSchema } from '@formancy/spec'
import { FillPane } from './fill-pane.js'

/**
 * The host that saves and resumes a draft.
 *
 * Every piece of this existed and nothing put them together: three public
 * routes, a token that addresses a draft, and a notice both renderers ship for a
 * resume that lost answers. The roadmap said so in as many words — "the debounce,
 * the stored token and the read-only path are described and not demonstrated" —
 * and a feature that is documented and not demonstrated is the failure mode this
 * repository has already shipped once.
 *
 * So this is the demonstration, and these are the three things
 * [Drafts](../../docs/src/content/docs/concepts/drafts.md) says a host has to get
 * right. Each test is one of them.
 */
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
})

const schema: FormSchema = {
  specVersion: '2',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', format: 'email' },
      { key: 'message', type: 'textarea', label: 'Message' },
    ],
  },
}

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

let calls: Call[] = []
/** Replies keyed by `METHOD path`, so a test states only what it cares about. */
let replies: Record<string, { status?: number; body: unknown }> = {}

beforeEach(() => {
  calls = []
  replies = {
    'GET /api/f/contact': { body: { version: 3, schemaHash: 'abc', schema } },
    'POST /api/f/contact/drafts': { body: { draftId: 'd1', token: 't1' } },
    'PUT /api/f/contact/drafts/d1': { body: { ok: true } },
  }
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const url = String(input)
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    const reply = replies[`${method} ${url}`]
    if (reply === undefined) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  })
})

const saves = (): Call[] => calls.filter((c) => c.method === 'PUT')
const starts = (): Call[] => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/drafts'))

describe('filling in a published form', () => {
  test('renders the published form, not the one being edited', async () => {
    render(<FillPane path="contact" />)

    // The schema comes from `GET /f/:path`, which answers with the CURRENT
    // published version — the point of the pane is to see what a respondent
    // sees, and an unpublished draft of the schema is not that.
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    expect(calls[0]?.url).toBe('/api/f/contact')
  })

  test('saves once after the typing stops, not once per keystroke', async () => {
    // `shouldAdvanceTime`, because `findBy*` polls: frozen timers make the query
    // that waits for the form to load wait forever, which reads as a hung
    // component rather than as a test holding its own clock.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FillPane path="contact" />)

    const email = await screen.findByLabelText('Email')
    await user.type(email, 'a@b.ch')

    // Eight keystrokes, and a database write per keystroke is what the
    // documentation says not to do — and what the rate limiter would start
    // answering 429 to while somebody is typing hardest.
    expect(saves()).toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })

    expect(saves()).toHaveLength(1)
    expect(saves()[0]?.body).toMatchObject({ email: 'a@b.ch' })
  })

  test('starts the draft once, and sends the token in the header rather than the URL', async () => {
    // `shouldAdvanceTime`, because `findBy*` polls: frozen timers make the query
    // that waits for the form to load wait forever, which reads as a hung
    // component rather than as a test holding its own clock.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FillPane path="contact" />)

    await user.type(await screen.findByLabelText('Email'), 'a@b.ch')
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    await user.type(screen.getByLabelText('Message'), 'hello')
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })

    // One start, two saves: the id and token are minted once and kept.
    expect(starts()).toHaveLength(1)
    expect(saves()).toHaveLength(2)
    // In the header. A token in a URL lands in logs, in a Referer, and in
    // somebody's browser history.
    expect(saves()[0]?.headers['x-formancy-draft-token']).toBe('t1')
    expect(saves()[0]?.url).not.toContain('t1')
  })

  test('resumes on the next visit, using the token it kept', async () => {
    window.localStorage.setItem('formancy.draft.contact', JSON.stringify({ id: 'd1', token: 't1' }))
    replies['GET /api/f/contact/drafts/d1'] = {
      body: { outcome: 'resumed', version: 3, schema, schemaHash: 'abc', data: { email: 'kept@example.ch' } },
    }

    render(<FillPane path="contact" />)

    await waitFor(() => {
      expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('kept@example.ch')
    })
    const resume = calls.find((c) => c.url.endsWith('/drafts/d1'))
    expect(resume?.headers['x-formancy-draft-token']).toBe('t1')
  })

  test('says what a republish set aside, rather than showing the answer as blank', async () => {
    window.localStorage.setItem('formancy.draft.contact', JSON.stringify({ id: 'd1', token: 't1' }))
    replies['GET /api/f/contact/drafts/d1'] = {
      body: {
        outcome: 'resumed',
        version: 4,
        schema,
        schemaHash: 'def',
        data: { email: 'kept@example.ch' },
        migration: { severity: 'lossy', changes: [{ kind: 'field.removed', path: 'fax' }] },
      },
    }

    render(<FillPane path="contact" />)

    // Without this somebody resumes, sees a field they know they filled in now
    // empty, and submits believing everything they typed is included.
    const notice = await screen.findByRole('region', { name: /changed while you were away/i })
    expect(notice.textContent).toMatch(/fax/i)
  })

  test('a draft that can no longer be submitted says so, and stops saving', async () => {
    // `shouldAdvanceTime`, because `findBy*` polls: frozen timers make the query
    // that waits for the form to load wait forever, which reads as a hung
    // component rather than as a test holding its own clock.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.localStorage.setItem('formancy.draft.contact', JSON.stringify({ id: 'd1', token: 't1' }))
    replies['GET /api/f/contact/drafts/d1'] = {
      body: {
        outcome: 'readOnly',
        version: 2,
        schema,
        schemaHash: 'old',
        data: { email: 'kept@example.ch' },
        migration: { severity: 'breaking', changes: [{ kind: 'field.type.changed', path: 'email' }] },
      },
    }

    render(<FillPane path="contact" />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /changed while you were away/i }).textContent).toMatch(/cannot be submitted/i)
    })
    // And the other half: a read-only draft that kept saving would overwrite the
    // answers it is showing with the ones it could not rebind.
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(saves()).toHaveLength(0)
    expect(screen.getByRole('button', { name: /start over/i })).toBeTruthy()
  })

  test('starting over forgets the token, so the next save starts a new draft', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('formancy.draft.contact', JSON.stringify({ id: 'd1', token: 't1' }))
    replies['GET /api/f/contact/drafts/d1'] = {
      body: {
        outcome: 'readOnly',
        version: 2,
        schema,
        schemaHash: 'old',
        data: { email: 'kept@example.ch' },
        migration: { severity: 'breaking', changes: [] },
      },
    }

    render(<FillPane path="contact" />)
    await user.click(await screen.findByRole('button', { name: /start over/i }))

    expect(window.localStorage.getItem('formancy.draft.contact')).toBeNull()
    await waitFor(() => {
      expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('')
    })
  })
})
