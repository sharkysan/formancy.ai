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
 *
 * Its `total` is true only of rows that are every row there is. A page that goes on has
 * no total, so a page goes through `capRemoteAnswer`, which says what this cannot.
 */
export function capRemoteOptions(rows: readonly RemoteOption[], limit: number): { shown: readonly RemoteOption[]; total: number; capped: boolean } {
  if (!Number.isFinite(limit) || limit < 1) return { shown: rows, total: rows.length, capped: false }
  return {
    shown: rows.slice(0, limit),
    total: rows.length,
    capped: rows.length > limit,
  }
}

/**
 * One page of a source's rows, and what the source knows about the rest without counting.
 *
 * A source backed by a database pages: it reads `limit + 1` rows to know whether there
 * are more, and does not count them, because a count reads every matching row on every
 * keystroke — the scan paging exists to avoid. Handed only rows, such a source either
 * looks complete or claims a total of `limit + 1`. So a source may say what it does know
 * ([0177](../../../docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).
 */
export interface RemoteOptionsPage {
  readonly options: readonly RemoteOption[]
  /**
   * Rows match beyond these, and how many is not known. Required: a page that does not
   * say whether it goes on is a guess, and the guess that shows nothing is "complete".
   */
  readonly more: boolean
  /**
   * Among the rows this answer covers, how many matched and are not in `options` because
   * the source cannot hand them over — a value a select could not store, say. A source
   * never filters silently: it withholds and counts. When `more` is true this is a lower
   * bound, and nothing says it.
   */
  readonly withheld?: number
}

/** What a source may answer: every matching row, as a list, or one page of them. */
export type RemoteOptionsAnswer = readonly RemoteOption[] | RemoteOptionsPage

/**
 * What a control can say about the rows it shows.
 *
 * A flat `kind`, as the request has, so a renderer reads it with one `switch`. `more`
 * carries no total because nobody counted one; `capped` carries one because the rows it
 * was cut from were every row there is.
 */
export type RemoteCompleteness =
  | { readonly kind: 'complete' }
  | { readonly kind: 'more'; readonly shown: number }
  | { readonly kind: 'capped'; readonly shown: number; readonly total: number }
  | { readonly kind: 'withheld'; readonly withheld: number }

/**
 * One value for "nothing left out", so a renderer storing one answer's after another's
 * stores the same thing: React's state and Angular's signals compare by identity, and a
 * search that settles complete again then renders nothing.
 */
const COMPLETE: RemoteCompleteness = { kind: 'complete' }

const PAGE_KEYS: ReadonlySet<string> = new Set(['options', 'more', 'withheld'])

/**
 * A source's answer, in either shape, if every part of it is usable — and `undefined` if
 * any is not.
 *
 * A list is every matching row, exactly as before a page could be answered, so it reads
 * as nothing more and nothing withheld and keeps its true total.
 *
 * A page is **refused whole** for anything ambiguous, as a list is for one bad row
 * ([0077](../../../docs/decisions/0077-options-may-come-from-a-named-source.md)): a `more`
 * that is not a boolean, a `withheld` that is not a whole count, and any key this does not
 * know. A misspelt `moer: true`, or a `total` read as nothing, would otherwise show a cut
 * list as complete — the failure the envelope exists to prevent. A refused answer is a
 * source that failed, which the field says, and never a list that looks whole.
 *
 * Beside `acceptRemoteOptions` rather than instead of it: that one is published, and
 * widening what it returns would hand a JavaScript caller an object where it had an array.
 */
export function acceptRemoteAnswer(answer: unknown): Required<RemoteOptionsPage> | undefined {
  if (Array.isArray(answer)) {
    const options = acceptRemoteOptions(answer)
    return options === undefined ? undefined : { options, more: false, withheld: 0 }
  }
  if (typeof answer !== 'object' || answer === null) return undefined
  if (Object.keys(answer).some((key) => !PAGE_KEYS.has(key))) return undefined

  const page = answer as { options?: unknown; more?: unknown; withheld?: unknown }
  const options = acceptRemoteOptions(page.options)
  if (options === undefined || typeof page.more !== 'boolean') return undefined
  // Absent or `undefined` is none withheld; `null` is not a count, and not read as one.
  const withheld = page.withheld === undefined ? 0 : page.withheld
  // A safe integer, so the count said is the count sent.
  if (typeof withheld !== 'number' || !Number.isSafeInteger(withheld) || withheld < 0) return undefined

  return { options, more: page.more, withheld }
}

/**
 * The rows a control shows of an accepted answer, and what it can truthfully say about
 * the rest — one thing, in this order:
 *
 * - **`more`** when the source said its list goes on, with how many are shown and never a
 *   total, even when it also withheld rows: while more rows match, a withheld count covers
 *   only this page and is a lower bound, which is a number nobody should be told.
 * - **`capped`** when the control cut rows the source handed over, with their number as
 *   the total, which is true because the source did not say there were more.
 * - **`withheld`** when nothing else was left out and the source withheld rows.
 * - **`complete`** only when nothing was cut, nothing more matches and nothing was
 *   withheld. A list is never silently partial.
 */
export function capRemoteAnswer(answer: Required<RemoteOptionsPage>, limit: number): { shown: readonly RemoteOption[]; completeness: RemoteCompleteness } {
  const { shown, total, capped } = capRemoteOptions(answer.options, limit)
  if (answer.more) return { shown, completeness: { kind: 'more', shown: shown.length } }
  if (capped) return { shown, completeness: { kind: 'capped', shown: shown.length, total } }
  if (answer.withheld > 0) return { shown, completeness: { kind: 'withheld', withheld: answer.withheld } }
  return { shown, completeness: COMPLETE }
}
