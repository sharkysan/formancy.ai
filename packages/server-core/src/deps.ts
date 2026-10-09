import type { CapabilitySource, Check } from '@formancy/core'
import type { ServerOptionsSources } from './options-membership.js'
import type { Storage } from './ports.js'
import type { Scanner } from './uploads.js'

/**
 * What a deployment supplies to the use-cases: storage, identity, time, and the
 * answers a document may only name — checks, lists and a scanner.
 *
 * Its own file because it is the one contract every use-case family shares, and
 * `use-cases.ts` is where the families used to live; it moved when that file's size
 * budget refused the scanner.
 */
export interface ServerDeps {
  storage: Storage
  newId(): string
  nowIso(): string
  /**
   * Validators this deployment answers, by the name a `check` rule gives.
   *
   * The same shape `optionsSources` takes, and the same rule: the document names
   * a check, the deployment says how to answer it, and nothing in the engine
   * fetches anything. A check a document names and a deployment has not supplied
   * fails the field closed.
   */
  checks?: Record<string, Check>
  /** The clock/randomness the ENGINE sees during replay. */
  capabilities: CapabilitySource
  /**
   * Signs the token that proves somebody started a draft.
   *
   * The public plane is anonymous, so a draft has no account behind it — which
   * is exactly why it needs a secret of its own. The host's own signing key is
   * reused rather than a second one being configured: a draft token is a
   * server-signed bearer token, which is what that key is already for, and an
   * optional secret would mean drafts are unprotected whenever nobody set it.
   */
  draftSecret: string
  /**
   * The lists a form document may name with `optionsSource`, and how to check a
   * value against one.
   *
   * A function and never an address: for a real source this is a database query, not
   * a request to somewhere a form author typed. Shipping an HTTP adapter here would
   * add outbound-request and confused-deputy surface to a regulatory set that
   * currently claims neither — for a convenience nobody asked for.
   *
   * Absent entirely means this deployment has no vocabulary: publishing cannot be
   * judged against it, and no submission is checked. Present but without `members`
   * for a name means *this source exists and I cannot check membership* — a
   * legitimate configuration, and the reason the guarantee is written down.
   */
  optionsSources?: ServerOptionsSources
  /**
   * The deployment's virus scanner, asked about every upload's bytes before they are
   * kept. Absent means none is asked — a supported state, and the documented one.
   */
  scanner?: Scanner
}
