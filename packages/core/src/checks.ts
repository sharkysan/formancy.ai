/**
 * The check protocol: what a deployment is asked, and what it answers.
 *
 * A `check` rule names a validator rather than carrying an expression, because
 * a CEL expression is pure and synchronous by construction — which is what makes
 * the dependency graph derivable and the evaluation bounded, so an asynchronous
 * validator cannot be an expression with a property on it
 * ([0086](../../../docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).
 *
 * Its own module because `engine.ts`'s size budget names the check and skip
 * machinery as its seam, and the protocol is the half of that which closes over
 * nothing. The machinery itself still lives in the engine, where it has the
 * graph and the store to hand.
 */

/** What a deployment is asked, and what it answers. */
export interface CheckRequest {
  /** The name the rule gave. */
  check: string
  /** The data path of the field being checked. */
  path: string
  /** The answer in question. Never empty: emptiness is `required`'s business. */
  value: unknown
  /** The whole submission so far, for a check that needs more than one answer. */
  data: unknown
}

/** An error code while the answer is refused, or `undefined` while it is fine. */
export type Check = (request: CheckRequest) => Promise<string | undefined> | string | undefined
