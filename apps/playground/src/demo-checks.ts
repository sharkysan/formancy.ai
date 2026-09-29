import type { Check } from '@formancy/core'

/**
 * The checks this playground answers, because a `check` rule has no expression.
 *
 * `kind: "check"` names a validator and says nothing about how it decides — a CEL
 * expression is pure and synchronous by construction, so the asynchronous thing
 * could never be an expression with a flag on it
 * ([0086](../../../docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).
 * The deployment answers it. Here the deployment is this tab.
 *
 * Which makes this file the demonstration rather than a stub: a document naming a
 * check nothing answers fails **closed**, so the field shows an error the visitor
 * cannot clear and nothing on screen says that the deployment, not the answer, is
 * what is missing. `wizard.test.ts` refuses a demo that names a check absent from
 * here, for exactly that reason.
 *
 * **The delay is deliberate and it is the point.** A check that answered instantly
 * would look like every other validator, and the one thing only a check does is
 * take time: the control keeps its focus and its value, carries `aria-busy` while
 * the answer is outstanding, and is never `disabled` — disabling the element
 * somebody is typing into moves focus somewhere they did not ask for.
 */
const REFERENCE = /^FM-\d{4}$/

/** Long enough to watch, short enough not to feel broken. Measured by trying it. */
const LATENCY_MS = 700

export const PLAYGROUND_CHECKS: Record<string, Check> = {
  'known-reference': ({ value }) =>
    new Promise<string | undefined>((resolve) => {
      setTimeout(() => {
        // The code is what the field shows: the renderers print the codes a rule
        // returns rather than inventing sentences for them, so a code a person can
        // read is part of authoring the rule.
        resolve(REFERENCE.test(String(value)) ? undefined : 'unknownReference')
      }, LATENCY_MS)
    }),
}
