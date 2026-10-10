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
    'GET /api/f/contact': { body: { version: 3, schemaHash: 'abc', schema, submissionToken: 'st-form' } },
    'POST /api/f/contact/drafts': { body: { draftId: 'd1', token: 't1', submissionToken: 'st-d1' } },
    'PUT /api/f/contact/drafts/d1': { body: { ok: true } },
    'POST /api/f/contact/submissions': { status: 201, body: { id: 'st', data: {} } },
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
    render(<FillPane path="contact" quietMs={60} />)

    // The schema comes from `GET /f/:path`, which answers with the CURRENT
    // published version — the point of the pane is to see what a respondent
    // sees, and an unpublished draft of the schema is not that.
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    expect(calls[0]?.url).toBe('/api/f/contact')
  })

  test('coalesces a burst of typing into a save, rather than one per keystroke', () => {
    /*
     * The claim is "fewer saves than keystrokes", and it is written that way on
     * purpose. It was "exactly one save, and none before the interval" over a
     * fake clock, which passed here and failed on CI: the save is two awaited
     * fetches deep, so whether it has happened when the assertion runs depends on
     * how a runner schedules microtasks. A timing test whose answer depends on
     * whose machine it is tells you nothing about the code.
     *
     * So: a real clock, a short interval, and the invariant that survives a
     * stalled runner. One save per keystroke is what the documentation says not
     * to do — a database write per key, and the rate limiter answering 429 while
     * somebody is typing hardest.
     */
    const typed = 'a@b.ch'
    return (async () => {
      const user = userEvent.setup()
      render(<FillPane path="contact" quietMs={60} />)

      await user.type(await screen.findByLabelText('Email'), typed)

      await waitFor(() => {
        expect(saves().length).toBeGreaterThan(0)
      })
      // Long enough that any per-keystroke save would have landed by now.
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(saves().length).toBeLessThan(typed.length)
      expect(saves().at(-1)?.body).toMatchObject({ email: typed })
    })()
  })

  test('starts the draft once however many times it saves, and keeps the token out of the URL', async () => {
    // Counting saves was the wrong assertion twice: two fields typed back to
    // back coalesce into ONE save, which is the debounce working. What this is
    // really about is that the id and token are minted once and kept — true
    // whatever the count — and that the token travels in a header.
    const user = userEvent.setup()
    render(<FillPane path="contact" quietMs={60} />)

    await user.type(await screen.findByLabelText('Email'), 'a@b.ch')
    await waitFor(() => {
      expect(saves().length).toBeGreaterThan(0)
    })
    await user.type(screen.getByLabelText('Message'), 'hello')
    await waitFor(() => {
      expect(saves().at(-1)?.body).toMatchObject({ message: 'hello' })
    })

    expect(starts()).toHaveLength(1)
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

    render(<FillPane path="contact" quietMs={60} />)

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

    render(<FillPane path="contact" quietMs={60} />)

    // Without this somebody resumes, sees a field they know they filled in now
    // empty, and submits believing everything they typed is included.
    const notice = await screen.findByRole('region', { name: /changed while you were away/i })
    expect(notice.textContent).toMatch(/fax/i)
  })

  test('a draft that can no longer be submitted says so, and stops saving', async () => {
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

    render(<FillPane path="contact" quietMs={60} />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /changed while you were away/i }).textContent).toMatch(/cannot be submitted/i)
    })
    // And the other half: a read-only draft that kept saving would overwrite the
    // answers it is showing with the ones it could not rebind. Waited out rather
    // than asserted immediately — "no save happened" is only worth anything after
    // the interval a save would have used.
    await new Promise((resolve) => setTimeout(resolve, 60))
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

    render(<FillPane path="contact" quietMs={60} />)
    await user.click(await screen.findByRole('button', { name: /start over/i }))

    expect(window.localStorage.getItem('formancy.draft.contact')).toBeNull()
    await waitFor(() => {
      expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('')
    })
  })
})

/**
 * Sending the response, with the token it was handed
 * ([0169](../../../docs/decisions/0169-a-response-is-stored-once.md)).
 *
 * The renderers send nothing — the host holds the transport — so this pane is the one place in
 * the repository where a browser submits to the server, and these hold it to what the
 * documentation tells every host to do.
 */
describe('sending the response', () => {
  const sent = (): Call[] => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/submissions'))

  async function fillAndSend(): Promise<void> {
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email'), 'a@b.ch')
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(sent().length).toBeGreaterThan(0)
    })
  }

  test('sends the token the form was handed out with, in a header', async () => {
    // Without it an anonymous response is refused, and a retry of one that was sent is stored
    // twice. In the header for the reason the draft key is: a URL lands in logs.
    render(<FillPane path="contact" quietMs={60_000} />)

    await fillAndSend()

    expect(sent()[0]?.headers['x-formancy-submission-token']).toBe('st-form')
    expect(sent()[0]?.url).not.toContain('st-form')
  })

  test("once a draft has started, sends the draft's token, which is the one a resume hands back", async () => {
    // Sent with the form's token, a response whose answer was lost would be sent again after a
    // reload with the draft's — a different token, so stored twice.
    render(<FillPane path="contact" quietMs={60} />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email'), 'a@b.ch')
    await waitFor(() => {
      expect(starts()).toHaveLength(1)
    })

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(sent()[0]?.headers['x-formancy-submission-token']).toBe('st-d1')
    })
  })

  test('a resumed draft sends the token the resume handed back', async () => {
    window.localStorage.setItem('formancy.draft.contact', JSON.stringify({ id: 'd1', token: 't1' }))
    replies['GET /api/f/contact/drafts/d1'] = {
      body: { outcome: 'resumed', version: 3, schema, schemaHash: 'abc', data: {}, submissionToken: 'st-d1' },
    }
    render(<FillPane path="contact" quietMs={60_000} />)

    await fillAndSend()

    expect(sent()[0]?.headers['x-formancy-submission-token']).toBe('st-d1')
  })

  test('a response already sent says so in a sentence, and the answers stay on the page', async () => {
    // Refused as already sent is not a lost answer — the first send is stored — and the page
    // must not make it look like one by clearing the form or saying nothing.
    replies['POST /api/f/contact/submissions'] = {
      status: 409,
      body: {
        error: 'submission_token_spent',
        id: 'st',
        message: 'These answers were already sent, and are stored once. Nothing was stored again.',
      },
    }
    render(<FillPane path="contact" quietMs={60_000} />)

    await fillAndSend()

    expect(await screen.findByText(/already sent, and are stored once/)).toBeTruthy()
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('a@b.ch')
  })
})
