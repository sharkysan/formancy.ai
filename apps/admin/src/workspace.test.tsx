import { CURRENT_SPEC_VERSION } from '@formancy/spec'
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
  readonly calls: { url: string; method: string; body: unknown; headers: Record<string, string> }[]
  formMissing?: boolean
  publishFails?: boolean
  /** Somebody else published while this editor was editing. */
  publishConflicts?: boolean
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
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(
        (init?.headers ?? {}) as Record<string, string>,
      )) {
        headers[name.toLowerCase()] = value
      }
      stub.calls.push({ url, method, body, headers })

      const json = (value: unknown, status = 200): Response =>
        new Response(JSON.stringify(value), {
          status,
          headers: { 'content-type': 'application/json' },
        })

      if (url.endsWith('/forms') && method === 'GET') return Promise.resolve(json({ forms }))
      if (url.includes('/versions')) return Promise.resolve(json({ versions }))
      if (url.includes('/submissions')) return Promise.resolve(json({ submissions }))
      if (method === 'POST' || method === 'PUT') {
        if (stub.publishConflicts === true) {
          return Promise.resolve(
            json(
              {
                error: 'FORM_VERSION_CHANGED',
                current: { version: 7, schemaHash: 'hash-theirs000', schema: SCHEMA },
              },
              409,
            ),
          )
        }
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
    // Against the constant, not a literal: this is about a new form starting at
    // the version this build speaks, and a literal has to be edited every time a
    // version is added — which is the shape that teaches people to edit a test
    // without reading it.
    const editor = await screen.findByLabelText<HTMLTextAreaElement>('Schema')
    expect(JSON.parse(editor.value)).toMatchObject({ specVersion: CURRENT_SPEC_VERSION })
  })
})

describe('the tabs', () => {
  test('build is what you land on, because it is what the form is for', async () => {
    const stub: Stub = { calls: [] }
    await openForm(stub)

    const build = await screen.findByRole('button', { name: 'build' })
    expect(build.getAttribute('aria-pressed')).toBe('true')
  })

  test('fill in opens the published form, so the draft flow is reachable', async () => {
    // The point of this one is reachability, not the flow: `fill-pane.test.tsx`
    // holds the debounce, the token and the read-only path. A pane nobody can
    // open is the documented-but-inert failure this repository has shipped once,
    // and a tab that exists in a file and not in the titlebar is exactly that.
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)

    await user.click(await screen.findByRole('button', { name: 'fill in' }))

    expect(await screen.findByRole('button', { name: /submit/i })).toBeTruthy()
  })

  test('translations opens the pane, so a form can be translated at all', async () => {
    // Reachability, like the fill-in tab: the pane's own behaviour is held in
    // `translations-pane.test.tsx`, and a pane that exists in a file and not in
    // the titlebar is the documented-but-inert failure in another costume.
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)

    await user.click(await screen.findByRole('button', { name: 'translations' }))

    expect(
      await screen.findByRole('button', { name: /make this form translatable/i }),
    ).toBeTruthy()
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

describe('publishing a form somebody else has published meanwhile', () => {
  /*
   * The builder is the one thing that OPENS a version, so it is the one thing
   * that can declare which version it opened — which is why declaring is
   * optional on the route and sent here. A script composes a document and has
   * nothing to declare; this held `serverHash` all along and never sent it.
   *
   * Without it the second of two editors silently wins: no error, no diff, and
   * nothing says anybody else had the form open. The first editor's work is not
   * destroyed — a published version is immutable — but `current_version_id` now
   * points past it and nobody was told.
   */
  test('declares the version it opened, so the server can tell it apart', async () => {
    const stub: Stub = { calls: [] }
    const user = await openForm(stub)

    // Awaited, not assumed: the workspace loads the form and its panes lazily,
    // so the button arrives a tick after `openForm` returns. Written with
    // `getByRole` these passed alone and failed about half the time in the full
    // suite, which is a timing assumption rather than a test.
    await user.click(await screen.findByRole('button', { name: /^publish$/i }))

    const published = stub.calls.find((call) => call.method === 'POST' && call.url.endsWith('/forms'))
    expect(published?.headers?.['x-formancy-schema-hash']).toBe('hash-abcdef012345')
  })

  test('and when it has been overtaken, says so with the version that won', async () => {
    // "Publish failed" would make somebody press it again. What they need is
    // that the form moved, and to what.
    const stub: Stub = { calls: [], publishConflicts: true }
    const user = await openForm(stub)

    await user.click(await screen.findByRole('button', { name: /^publish$/i }))

    const said = await screen.findByText(/somebody else published/i)
    expect(said.textContent).toMatch(/version 7/)
  })

  test('and does not pretend the publish worked', async () => {
    const stub: Stub = { calls: [], publishConflicts: true }
    const user = await openForm(stub)

    await user.click(await screen.findByRole('button', { name: /^publish$/i }))
    await screen.findByText(/somebody else published/i)

    // The header still names the version this editor opened: nothing was
    // published, so nothing about what is current has changed.
    expect(screen.getByText(/published hash-abcdef0/)).toBeTruthy()
  })
})
