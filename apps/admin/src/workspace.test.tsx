import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'
import { setToken } from './api.js'

/**
 * The workspace: the four tabs over one form, and the one publish path
 * underneath all of them.
 *
 * `app.test.tsx` covers the shell — who gets the sign-in form and what a 401
 * does. This covers what an operator actually spends their day in, which was
 * the least-tested part of the product despite being the part a self-hoster
 * touches most. Every case here is a thing that would be silently wrong rather
 * than loudly broken: a publish that reports success it did not get, a tab
 * that shows another tab's form, a new form that cannot use half the spec.
 */
vi.mock('@monaco-editor/react', () => ({
  // Monaco loads a worker and measures a DOM jsdom has not got. A textarea
  // that reports its value is everything these tests need from it.
  default: ({ value, onChange }: { value?: string; onChange?: (next: string) => void }) => (
    <textarea
      aria-label="Schema"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

const SCHEMA = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact us',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email', required: true }] },
}

const forms = [{ path: 'contact', title: 'Contact us', version: 2, schemaHash: 'hash-abcdef012345' }]

const versions = [
  { version: 1, title: 'Contact us', schemaHash: '1111111111111111aaaa' },
  { version: 2, title: 'Contact us', schemaHash: '2222222222222222bbbb' },
]

const submissions = [
  { id: 's1', submittedAt: '2026-09-20T10:00:00Z', version: 2, data: { email: 'ada@example.ch' } },
]

/** Every request the workspace makes, and a record of what it sent. */
interface Stub {
  readonly calls: { url: string; method: string; body: unknown }[]
  formMissing?: boolean
  publishFails?: boolean
}

function serve(stub: Stub): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      let body: unknown
      try {
        body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      } catch {
        body = init?.body
      }
      stub.calls.push({ url, method, body })

      const json = (value: unknown, status = 200): Response =>
        new Response(JSON.stringify(value), {
          status,
          headers: { 'content-type': 'application/json' },
        })

      if (url.endsWith('/forms') && method === 'GET') return Promise.resolve(json({ forms }))
      if (url.includes('/versions')) return Promise.resolve(json({ versions }))
      if (url.includes('/submissions')) return Promise.resolve(json({ submissions }))
      if (method === 'POST' || method === 'PUT') {
        return Promise.resolve(
          stub.publishFails === true
            ? json({ error: 'schema_invalid', message: 'canton is not a field' }, 422)
            : json({ version: 3, schemaHash: 'hash-published9999' }),
        )
      }
      return Promise.resolve(
        stub.formMissing === true
          ? json({ error: 'not_found' }, 404)
          : json({ version: 2, schemaHash: 'hash-abcdef012345', schema: SCHEMA }),
      )
    }),
  )
}

/** Sign in, load the list, open the one form. */
async function openForm(stub: Stub): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  serve(stub)
  render(<App />)
  // The first test in the file also pays for a cold jsdom and the lazy
  // imports behind the list, which on a loaded CI runner can outlast the
  // default one-second wait even though nothing is wrong.
  await user.click(await screen.findByRole('button', { name: /Contact us/ }, { timeout: 5000 }))
  return user
}

beforeEach(() => {
  sessionStorage.clear()
  setToken('t_abc')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('opening a form', () => {
  test('loads it and says which version is published', async () => {
    const stub: Stub = { calls: [] }
    await openForm(stub)

    // The hash is truncated on screen, and that is the point of showing it at
    // all: an operator comparing what is live against what they are editing.
    expect(await screen.findByText(/published hash-abcdef0/)).toBeTruthy()
  })

  test('a path the server has never heard of opens a template, not an error', async () => {
    const stub: Stub = { calls: [], formMissing: true }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))

    const editor = await screen.findByLabelText<HTMLTextAreaElement>('Schema')
    expect(editor.value).toContain('"specVersion"')
    // Typing a new path on the left is how a form is created here, so a 404 is
    // the normal case rather than a failure.
    expect(screen.getByText('never published')).toBeTruthy()
  })

  test('a new form starts at the spec version this build speaks', async () => {
    const stub: Stub = { calls: [], formMissing: true }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))

    // Not cosmetic, and it was wrong: a version 1 document may not hold a
    // version 2 construct, so a form started at version 1 cannot be given
    // tick boxes, a file field or formatted text. The builder refuses them
    // by name — correct, and a dead end nobody asked to be in.
    const editor = await screen.findByLabelText<HTMLTextAreaElement>('Schema')
    expect(JSON.parse(editor.value)).toMatchObject({ specVersion: '2' })
  })
})

describe('the tabs', () => {
  test('build is what you land on, because it is what the form is for', async () => {
    const stub: Stub = { calls: [] }
    await openForm(stub)

    const build = await screen.findByRole('button', { name: 'build' })
    expect(build.getAttribute('aria-pressed')).toBe('true')
  })

  test('versions lists what has been published, newest and oldest alike', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)

    await user.click(await screen.findByRole('button', { name: 'versions' }))

    const table = await screen.findByRole('table')
    expect(within(table).getByText('v1')).toBeTruthy()
    expect(within(table).getByText('v2')).toBeTruthy()
    // Truncated, like the titlebar's: enough to compare, not enough to fill
    // the column with sixty-four characters of hex.
    expect(within(table).getByText(/1111111111111111/)).toBeTruthy()
  })

  test('submissions lists them and offers the export', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)

    await user.click(await screen.findByRole('button', { name: 'submissions' }))

    expect(await screen.findByText(/ada@example.ch/)).toBeTruthy()
    // The columns are unioned across schema versions, which is the whole
    // reason the export is a server concern rather than a table dump.
    const link = screen.getByRole('link', { name: /Download CSV/ })
    expect(link.getAttribute('href')).toContain('contact')
  })

  test('switching away and back does not lose an unpublished edit', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))

    const editor = await screen.findByLabelText<HTMLTextAreaElement>('Schema')
    fireEvent.change(editor, { target: { value: '{"title": "edited"}' } })

    await user.click(screen.getByRole('button', { name: 'versions' }))
    await user.click(screen.getByRole('button', { name: 'editor' }))

    // The source lives above the tabs on purpose. Held in the pane, every tab
    // switch would silently discard whatever was being written.
    expect(screen.getByLabelText<HTMLTextAreaElement>('Schema').value).toContain('edited')
  })
})

describe('publishing', () => {
  test('sends what is in the editor, and reports the new hash', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))
    await user.click(await screen.findByRole('button', { name: /Publish/i }))

    await waitFor(() => expect(screen.getByText(/published hash-publish/)).toBeTruthy())

    const sent = stub.calls.find((call) => call.method === 'POST' || call.method === 'PUT')
    expect(sent?.body).toMatchObject({ schema: { id: 'contact' } })
  })

  test('a refusal is shown, not swallowed', async () => {
    const stub: Stub = { calls: [], publishFails: true }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))
    await user.click(await screen.findByRole('button', { name: /Publish/i }))

    // A publish that fails quietly leaves an operator believing the form they
    // are looking at is the one their users are filling in.
    expect(await screen.findByText(/canton is not a field/)).toBeTruthy()
    expect(screen.getByText(/published hash-abcdef0/)).toBeTruthy()
  })

  test('source that is not JSON at all is refused before it is sent', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))

    const editor = await screen.findByLabelText<HTMLTextAreaElement>('Schema')
    fireEvent.change(editor, { target: { value: 'not json' } })
    await user.click(screen.getByRole('button', { name: /Publish/i }))

    await waitFor(() => {
      expect(stub.calls.some((call) => call.method === 'POST' || call.method === 'PUT')).toBe(false)
    })
  })
})

describe('the editor pane', () => {
  test('a schema the spec refuses is listed as problems rather than previewed', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))

    const editor = await screen.findByLabelText<HTMLTextAreaElement>('Schema')
    // A field with no type: valid JSON, not a valid document.
    fireEvent.change(editor, {
      target: {
        value: JSON.stringify({
          specVersion: '2',
          id: 'x',
          title: 'x',
          model: { fields: [{ key: 'a' }] },
        }),
      },
    })

    // A preview of an invalid document is a blank box with no explanation.
    // The problems are the preview, until there is something to draw.
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0))
  })

  test('a valid schema previews as a real form', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)
    await user.click(await screen.findByRole('button', { name: 'editor' }))

    // The same renderer a consumer gets, against the document in the editor.
    expect(await screen.findByLabelText(/Email/)).toBeTruthy()
  })
})
