import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'
import { setToken } from './api.js'

/**
 * The admin shell: which screen you get, and what happens when the session
 * ends underneath you.
 *
 * Not a test of the panes — those have their own — but of the three decisions
 * this file makes, each of which was a real bug at some point: an unsigned-in
 * visitor must see the sign-in form rather than an empty list, a 401 arriving
 * later must return them to it rather than leave an admin that silently does
 * nothing, and signing out must actually drop the token.
 */
vi.mock('@monaco-editor/react', () => ({
  // Monaco loads a worker and measures a DOM jsdom does not have. The editor
  // is not what any of this is about, so it is a textarea here.
  default: ({ value }: { value?: string }) => <textarea readOnly aria-label="Schema" value={value ?? ''} />,
}))

const forms = [{ path: 'contact', title: 'Contact us', version: 2, schemaHash: 'h2' }]

const answer = (url: string, status = 200): Response => {
  const body = url.endsWith('/forms')
    ? { forms }
    : url.includes('/versions')
      ? { versions: [] }
      : url.includes('/submissions')
        ? { submissions: [] }
        : {
            version: 2,
            schemaHash: 'h2',
            schema: {
              specVersion: '1',
              id: 'contact',
              title: 'Contact us',
              model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
            },
          }
  return new Response(JSON.stringify(status === 200 ? body : { error: 'unauthorized' }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const serving = (status = 200): void => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(answer(url, status))))
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('before signing in', () => {
  test('the sign-in form is the whole app', () => {
    serving()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    // Rendering the shell with an empty list reads as "there are no forms".
    expect(screen.queryByRole('heading', { name: 'formancy.ai' })).toBeNull()
  })
})

describe('signed in', () => {
  beforeEach(() => setToken('t_abc'))

  test('the forms load and are listed', async () => {
    serving()
    render(<App />)

    expect(await screen.findByRole('button', { name: /Contact us/ })).toBeTruthy()
  })

  test('a 401 arriving later puts the sign-in form back', async () => {
    // Otherwise the admin sits there with an empty list and no explanation,
    // which is what it did before it had any authentication at all.
    serving(401)
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  test('signing out drops the token', async () => {
    const user = userEvent.setup()
    serving()
    render(<App />)
    await screen.findByRole('button', { name: /Contact us/ })

    await user.click(screen.getByRole('button', { name: /Sign out/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy())
    expect(sessionStorage.getItem('formancy.admin.token')).toBeNull()
  })
})
