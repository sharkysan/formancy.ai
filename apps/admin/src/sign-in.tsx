import { useState } from 'react'
import { login } from './api.js'

/**
 * The admin's sign-in.
 *
 * It exists because the management plane requires an identity and this app
 * was written before it did — every call was returning 401 and the admin
 * rendered an empty list with no explanation, which looks like "there are no
 * forms" rather than "you are not signed in".
 */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <form
      style={{ maxWidth: '22rem', margin: '4rem auto', display: 'grid', gap: '0.75rem' }}
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        void login(email, password)
          .then((ok) => {
            setFailed(!ok)
            if (ok) onSignedIn()
          })
          .finally(() => setBusy(false))
      }}
    >
      <h1 style={{ fontSize: '1.1rem' }}>Sign in to formancy.ai</h1>

      <label htmlFor="admin-email">Email</label>
      <input
        id="admin-email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label htmlFor="admin-password">Password</label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      {/* The server does not say whether the address exists, and neither does
          this: repeating a specific reason would undo the enumeration
          resistance the login endpoint was built for. */}
      {failed ? (
        <p role="alert" style={{ color: '#a81d1d' }}>
          That email and password did not match.
        </p>
      ) : null}
    </form>
  )
}
