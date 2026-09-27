/**
 * What a deployment's own source is allowed to hand a control.
 *
 * A form document is validated before it is published; a list that arrives at
 * runtime is not validated by anything, and it comes from a system nobody in
 * this repository has seen. So it is checked here, in the one place both
 * renderers read, rather than trusted twice.
 *
 * It sits in `@formancy/spec` beside `narrowOptionsByLabel` for the reason that
 * one does: a rule that accepted a row in React and refused it in Angular would
 * be two forms from one document, and each renderer's tests would be green
 * against its own rule.
 */

/** One row from a source: a value to store and a label to show. */
export interface RemoteOption {
  value: string
  /**
   * A plain string, never a `{$t}` reference.
   *
   * `presentationErrors` checks every `{$t}` in a document's option labels against
   * the default catalogue by walking the document, and can never see a row that
   * arrives at runtime. An unchecked reference resolves to `undefined` and both
   * renderers fall back to the raw value, so a missing translation would silently
   * show an opaque identifier. The request carries the locale instead, and the
   * source answers in it.
   */
  label: string
}

/**
 * The longest value the format lets an option carry.
 *
 * Written here and CHECKED against the schema by `options-source.test.ts`, rather than
 * read from it at runtime. The first version imported `formancy.schema.json` for this
 * one integer, and the bundler inlined all 40.6 kB of it: measured, `@formancy/spec`
 * went from 8.7 kB brotli to 16.4 kB — the package nearly doubled so that one number
 * could be derived.
 *
 * The derivation is not lost, it moved to where it is free. The test reads the schema
 * and fails if these disagree, which is the shape this repository prefers for a fact
 * that cannot be derived at build time without a cost.
 */
const VALUE_MAX_LENGTH = 200

/**
 * The rows, if every one of them is usable — and `undefined` if any is not.
 *
 * **Refused whole, never filtered.** A partial list silently lacks the row somebody
 * came for, and they cannot tell the difference between "your source does not have
 * it" and "we dropped it". The scanner treats a non-string from a plain-JavaScript
 * host the same way, for the same reason.
 *
 * A duplicate value is refused for a second reason on top of that: two rows sharing a
 * value are two DOM elements wanting one id, and in Angular a duplicate `track` key is
 * a runtime error rather than a cosmetic one.
 */
export function acceptRemoteOptions(rows: unknown): readonly RemoteOption[] | undefined {
  if (!Array.isArray(rows)) return undefined

  const seen = new Set<string>()
  const accepted: RemoteOption[] = []

  for (const row of rows as unknown[]) {
    if (typeof row !== 'object' || row === null) return undefined
    const { value, label } = row as { value?: unknown; label?: unknown }

    // A value is a string the format could have carried itself: the same bounds a
    // document option is held to, derived from the schema.
    if (typeof value !== 'string' || value.length === 0 || value.length > VALUE_MAX_LENGTH) {
      return undefined
    }
    // A label is text to show. A `{$t}` reference here resolves against a catalogue
    // that cannot have been checked, so it is refused rather than displayed raw.
    if (typeof label !== 'string' || label.length === 0) return undefined
    if (seen.has(value)) return undefined

    seen.add(value)
    accepted.push({ value, label })
  }

  return accepted
}

/**
 * The first `limit` rows, and whether there were more.
 *
 * Only ever applied to a list from a source, and that is the one place this control
 * behaves differently by provenance: a document's list is finite and was reviewed by
 * whoever wrote it, a source's list is neither. Capping an authored list would change
 * a control that has shipped, for a need nobody has reported.
 *
 * The caller says how many it can show; saying "there are more" is what keeps the
 * narrowing honest, because a list silently cut at fifty looks like a source that does
 * not have the fifty-first row.
 */
export function capRemoteOptions(
  rows: readonly RemoteOption[],
  limit: number,
): { shown: readonly RemoteOption[]; total: number; capped: boolean } {
  if (!Number.isFinite(limit) || limit < 1) return { shown: rows, total: rows.length, capped: false }
  return {
    shown: rows.slice(0, limit),
    total: rows.length,
    capped: rows.length > limit,
  }
}
