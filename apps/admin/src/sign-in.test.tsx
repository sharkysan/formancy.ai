import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { SignIn } from './sign-in.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

/**
 * The sign-in form, by role and accessible name only — the same rule the
 * conformance suite holds the renderers to. A form whose fields cannot be
 * found that way cannot be filled in by a screen reader either.
 */
const answering = (status: number): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(status === 200 ? { token: 't_abc' } : { error: 'no' }), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  )
}

const signIn = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(screen.getByLabelText('Email'), 'admin@example.ch')
  await user.type(screen.getByLabelText('Password'), 'hunter2')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('signing in', () => {
  test('a success calls back, and leaves no error behind', async () => {
    const user = userEvent.setup()
    const onSignedIn = vi.fn()
    answering(200)
    render(<SignIn onSignedIn={onSignedIn} />)

    await signIn(user)

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a refusal says so without saying which half was wrong', async () => {
    const user = userEvent.setup()
    const onSignedIn = vi.fn()
    answering(401)
    render(<SignIn onSignedIn={onSignedIn} />)

    await signIn(user)

    const alert = await screen.findByRole('alert')
    // Naming the half that failed would undo the enumeration resistance the
    // login endpoint exists for.
    expect(alert.textContent).toBe('That email and password did not match.')
    expect(alert.textContent).not.toMatch(/unknown|no such|exist/i)
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  test('the button says what it is doing and cannot be pressed twice', async () => {
    const user = userEvent.setup()
    let release: (value: Response) => void = () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    )
    render(<SignIn onSignedIn={vi.fn()} />)

    await signIn(user)

    const busy = screen.getByRole('button', { name: 'Signing in…' })
    expect(busy).toHaveProperty('disabled', true)

    release(new Response(JSON.stringify({ token: 't' }), { status: 200 }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy())
  })

  test('the fields tell a password manager what they are', () => {
    render(<SignIn onSignedIn={vi.fn()} />)

    // WCAG 2.2 SC 1.3.5, and the difference between a form people use and a
    // form people retype their password into every time.
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username')
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password')
  })
})
