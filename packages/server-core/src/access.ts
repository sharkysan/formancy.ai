import type { FormRecord } from './ports.js'

/**
 * Whether this caller may submit this form at all, before any of the work.
 *
 * Every branch that is not an explicit permission returns false. An allowlist
 * that exists but does not name the origin refuses; an origin header that is
 * absent refuses, because absent is not the same as allowed; an empty
 * allowlist refuses everything, because a list of no origins is a list.
 */
export function maySubmit(
  form: FormRecord,
  actor: 'anonymous' | 'authenticated',
  origin: string | undefined,
): boolean {
  if (actor === 'authenticated') return true
  if (form.accessSubmit !== 'public') return false

  const allowed = form.allowedOrigins
  if (allowed === null) return true
  if (origin === undefined) return false

  // Exact match, never a prefix or suffix one: `https://evil-example.ch` ends
  // with the same characters as `example.ch` and must not pass, and
  // `https://example.ch:8443` is a different origin from `https://example.ch`.
  return allowed.includes(origin)
}
