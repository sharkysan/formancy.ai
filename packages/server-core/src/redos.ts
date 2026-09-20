import { check } from 'recheck'
import type { FieldDef, FormSchema } from '@formancy/spec'

/**
 * Refuse a form whose `pattern` values can be made to backtrack.
 *
 * A form author supplies these, and the server runs them against whatever a
 * submitter typed. That makes a regular expression an author-side denial of
 * service vector: one bad pattern, published once, and every submission after
 * it can be turned into unbounded CPU by anyone who can reach the form.
 *
 * Checked at PUBLISH time rather than at match time, because there is no way
 * to time out a JavaScript regular expression once it has started. The only
 * moment the cost can be refused is before the pattern is stored.
 *
 * The check is static — `recheck` analyses the expression rather than running
 * it — so it costs nothing per submission, and it found a polynomial case in
 * formancy's own built-in email format before it was ever pointed at a user's.
 */

// Which engine recheck uses is chosen by the HOST, not here: this package has
// no @types/node by design, so it cannot read an environment variable, and
// that boundary is worth more than the convenience of setting one.
// `@formancy/server` pins `RECHECK_BACKEND=pure` at startup and says why.
// Absent that, recheck picks for itself and falls back to the pure engine,
// which reaches the same verdicts on every case in the test suite.

export interface UnsafePattern {
  /** Data path of the field carrying it, e.g. `contacts[].code`. */
  path: string
  pattern: string
  /** `exponential` or `polynomial`, with the degree where there is one. */
  complexity: string
}

/** Every `pattern` in the model, with the data path of the field it sits on. */
function patternsIn(fields: readonly FieldDef[], prefix: string): Array<{ path: string; pattern: string }> {
  const found: Array<{ path: string; pattern: string }> = []

  for (const field of fields) {
    // Pages are transparent to data paths; groups nest; a repeater's template
    // fields are addressed with `[]`. Same walk as everything else.
    const path =
      field.type === 'page'
        ? prefix
        : field.type === 'repeater'
          ? `${prefix}${field.key}[].`
          : field.type === 'group'
            ? `${prefix}${field.key}.`
            : `${prefix}${field.key}`

    if (typeof field.pattern === 'string' && field.pattern !== '') {
      found.push({ path, pattern: field.pattern })
    }
    if (field.fields !== undefined) found.push(...patternsIn(field.fields, path))
  }

  return found
}

/**
 * The patterns in this schema that an attacker could exploit, or an empty array
 * when there are none.
 *
 * A pattern `recheck` cannot decide about is ACCEPTED. Refusing on `unknown`
 * would make publishing depend on an analysis timeout, which is a worse failure
 * than the one being prevented — an author whose legitimate form stops
 * publishing intermittently has no way to act on that.
 */
export async function unsafePatterns(schema: FormSchema): Promise<UnsafePattern[]> {
  const unsafe: UnsafePattern[] = []

  for (const { path, pattern } of patternsIn(schema.model.fields, '')) {
    // Anchored the same way the engine anchors it, so what is analysed is what
    // will run. An unanchored analysis can miss a case the anchors create.
    const diagnostics = await check(`^(?:${pattern})$`, '')
    if (diagnostics.status !== 'vulnerable') continue

    const complexity = diagnostics.complexity
    unsafe.push({
      path,
      pattern,
      complexity:
        complexity === undefined
          ? 'unknown'
          : complexity.type === 'polynomial'
            ? `polynomial degree ${String(complexity.degree)}`
            : complexity.type,
    })
  }

  return unsafe
}
