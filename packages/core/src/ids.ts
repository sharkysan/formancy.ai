import { formatPath } from './path.js'
import type { Path } from './path.js'

/**
 * Deterministic accessibility ids, minted by the engine rather than by
 * renderers.
 *
 * Central minting is what makes ARIA wiring byte-identical across React and
 * Angular, and deterministic ids are SSR-stable — no useId hydration
 * mismatches, no server/client divergence. The separator is ":" (as React's
 * useId established, valid in HTML ids); a formId containing it could alias
 * another field's id, so it is rejected loudly instead.
 */
export interface FieldIds {
  control: string
  label: string
  hint: string
  description: string
  error: string
}

export function fieldIds(formId: string, path: Path): FieldIds {
  if (formId.includes(':')) {
    throw new Error(`Form id "${formId}" must not contain ":" — it is the id separator`)
  }
  if (/\s/.test(formId)) {
    throw new Error(`Form id "${formId}" must not contain whitespace`)
  }

  const wire = formatPath(path)
  if (/\s/.test(wire)) {
    throw new Error(`Path "${wire}" must not contain whitespace: it becomes an HTML id`)
  }

  const base = `f:${formId}:${wire}`
  return {
    control: `${base}:control`,
    label: `${base}:label`,
    hint: `${base}:hint`,
    description: `${base}:description`,
    error: `${base}:error`,
  }
}

/**
 * The aria-describedby value for a field, or undefined so the attribute is
 * omitted entirely — an empty describedby is an accessibility bug, not a
 * harmless default.
 *
 * Order is hint, description, error: a screen reader announces them in this
 * sequence, and the error belongs last, closest to the user's next action.
 * Error text is referenced here and must NOT also be a live region — that is
 * the classic double-announcement bug.
 */
export function describedBy(
  ids: FieldIds,
  present: { hint?: boolean; description?: boolean; error?: boolean },
): string | undefined {
  const parts: string[] = []
  if (present.hint) parts.push(ids.hint)
  if (present.description) parts.push(ids.description)
  if (present.error) parts.push(ids.error)
  return parts.length > 0 ? parts.join(' ') : undefined
}
