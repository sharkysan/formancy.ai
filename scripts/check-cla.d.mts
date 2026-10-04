/**
 * Types for `check-cla.mjs`, which is plain JavaScript because the workflow runs
 * it with `node` before anything installs the workspace, and nothing builds
 * `scripts/`.
 *
 * Hand-written, like `release-notes.d.mts`, and for the same reason: the surface
 * is small enough to stay honest. What it cannot drift on is behaviour —
 * `apps/docs/src/cla.test.ts` calls the implementation, not a stub of it.
 */

/** The agreement itself, at the repository root. */
export const AGREEMENT: string

/** The record of who has agreed to it, and to which version of it. */
export const SIGNATORIES: string

/** One signature: an identity, a date, and the hash of what was agreed to. */
export interface Signatory {
  name: string
  login: string | undefined
  emails: string[]
  signed: string
  agreement: string
}

/** An address that cannot sign anything, and the reason it is covered anyway. */
export interface Machine {
  name: string
  emails: string[]
  reason: string
}

export interface Record {
  agreement: string
  signatories: Signatory[]
  machines: Machine[]
}

/** The hash a signature records, over content rather than bytes. */
export function agreementHash(text: string): string

/**
 * The record, shape-checked and normalised. Throws on an entry missing a field
 * the check reads.
 *
 * `raw` and `agreement` exist for the tests, which need records this repository
 * does not contain.
 */
export function readRecord(repoRoot: string, raw?: unknown, agreement?: string): Record

/**
 * The authors this record does not cover, each named once. Throws when given no
 * authors at all, rather than reporting that nobody is missing.
 */
export function unsigned(input: {
  authors: string[]
  record: Record
  hash: string
}): Array<{ email: string; reason: 'unsigned' | 'stale' }>
