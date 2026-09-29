import type { FieldDef, FormSchema } from '@formancy/spec'

/**
 * Checking that a sourced answer is one the deployment's own source offers.
 *
 * The engine already refuses a value no *document* option offers
 * ([0076](../../../docs/decisions/0076-an-answer-is-one-of-the-options.md)), and
 * it runs on both sides. A `optionsSource` field has no document options, so that
 * check has nothing to compare against — deliberately, because a list living
 * outside the document cannot be checked against the document.
 *
 * So the server asks the deployment instead, and the deployment answers with a
 * database query rather than with a request to an address a form author typed.
 * That is why the port takes a function and this package ships no HTTP client:
 * `@formancy/server-core` imports no `URL` and no `fetch`, and adding an outbound
 * request here would add confused-deputy surface to a regulatory set that claims
 * none.
 */

/** One named source, as the deployment configured it. */
export interface ServerOptionsSource {
  /**
   * Which of these values this source does NOT offer.
   *
   * Phrased as the rejects rather than the members so an adapter can answer from a
   * SQL `IN` clause without materialising a list — a source with two million rows
   * is exactly the case `optionsSource` exists for.
   *
   * Absent means: *this source exists, and I cannot check membership.* That is a
   * legitimate configuration and it weakens the guarantee, which is why the
   * guarantee is written down rather than implied.
   */
  members?(values: readonly string[]): Promise<readonly string[]>
}

export type ServerOptionsSources = Readonly<Record<string, ServerOptionsSource>>

/**
 * Every sourced answer in a submission, as `path → { source, value }`.
 *
 * Walked from the SCHEMA over the value, never from the value's own shape — the
 * same way `referencedFileIds` does it. A walk driven by what arrived would let a
 * client dodge the check by omitting a property, and hidden branches have already
 * been stripped by the engine before this runs.
 */
export function sourcedAnswers(
  schema: FormSchema,
  value: unknown,
): ReadonlyArray<{ path: string; source: string; value: string }> {
  const found: Array<{ path: string; source: string; value: string }> = []

  const walk = (fields: readonly FieldDef[], data: unknown, prefix: string): void => {
    if (typeof data !== 'object' || data === null) return
    const record = data as Record<string, unknown>

    for (const field of fields) {
      const at = prefix === '' ? field.key : `${prefix}.${field.key}`
      const held = record[field.key]

      if (field.fields !== undefined) {
        // A repeater's rows are a list; a group's children are one object.
        if (Array.isArray(held)) {
          for (const [index, row] of held.entries()) {
            walk(field.fields, row, `${at}[${String(index)}]`)
          }
        } else {
          walk(field.fields, held, at)
        }
        continue
      }

      if (field.optionsSource === undefined) continue

      // A list answer is several answers to one question. This asked
      // `typeof held !== 'string'` and an array is not a string, so every value
      // in a sourced `selectboxes` was stored with nothing having looked at it —
      // hazard A7 wearing a different shape of answer.
      //
      // One entry per VALUE and the field's own path on each: the field is wrong
      // when any of its answers is, and naming an index would describe a payload
      // rather than the question.
      const answers = Array.isArray(held) ? held : [held]
      for (const answer of answers) {
        // An empty answer is `required`'s business, not this one's, and a
        // non-string is `modelViolations`' — a source asked about `{"$gt": ""}`
        // is a source handed a query it did not expect.
        if (typeof answer !== 'string' || answer === '') continue
        found.push({ path: at, source: field.optionsSource, value: answer })
      }
    }
  }

  walk(schema.model.fields, value, '')
  return found
}

/** What asking the deployment produced. */
export type MembershipOutcome =
  | { ok: true }
  /** Values the deployment's own source does not offer, by field path. */
  | { ok: false; kind: 'invalid'; errors: Record<string, string[]> }
  /**
   * A source could not answer.
   *
   * Failed CLOSED, always. An accepted bogus value is undetectable afterwards; a
   * refusal is retryable and the draft still holds the answers. It is the same rule
   * the engine applies to a validation rule it cannot evaluate.
   */
  | { ok: false; kind: 'source_unavailable'; source: string }

/**
 * Ask each source about the values submitted for it.
 *
 * One call per source rather than per answer, so a deployment sees `IN (…)` and not
 * a query per row.
 */
export async function checkMembership(
  schema: FormSchema,
  value: unknown,
  sources: ServerOptionsSources | undefined,
): Promise<MembershipOutcome> {
  const answers = sourcedAnswers(schema, value)
  if (answers.length === 0 || sources === undefined) return { ok: true }

  const bySource = new Map<string, Array<{ path: string; value: string }>>()
  for (const answer of answers) {
    const group = bySource.get(answer.source) ?? []
    group.push({ path: answer.path, value: answer.value })
    bySource.set(answer.source, group)
  }

  const errors: Record<string, string[]> = {}

  for (const [name, group] of bySource) {
    const source = sources[name]
    // A source the deployment has not configured cannot vouch for anything. Treated
    // as unavailable rather than as absent: the document says these answers come
    // from somewhere, and accepting them unchecked would be the silent version of
    // the same failure.
    if (source === undefined) return { ok: false, kind: 'source_unavailable', source: name }
    if (source.members === undefined) continue

    let rejected: readonly string[]
    try {
      rejected = await source.members(group.map((entry) => entry.value))
    } catch {
      return { ok: false, kind: 'source_unavailable', source: name }
    }

    const refused = new Set(rejected)
    for (const entry of group) {
      if (!refused.has(entry.value)) continue
      // The same code word a document option produces, so a message catalogue
      // learns one word rather than two for one idea.
      errors[entry.path] = [...(errors[entry.path] ?? []), 'option']
    }
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, kind: 'invalid', errors }
}

/**
 * The source names a document uses, for the publish-time vocabulary check.
 *
 * Walked over the schema rather than over any data, because publishing has none.
 */
export function sourceNamesIn(schema: FormSchema): readonly string[] {
  const names = new Set<string>()
  const walk = (fields: readonly FieldDef[]): void => {
    for (const field of fields) {
      if (field.optionsSource !== undefined) names.add(field.optionsSource)
      if (field.fields !== undefined) walk(field.fields)
    }
  }
  walk(schema.model.fields)
  return [...names]
}
