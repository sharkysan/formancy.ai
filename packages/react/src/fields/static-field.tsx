import type { FieldComponentProps } from './internals.js'


/**
 * Text the reader sees that collects nothing.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
/**
 * Text the reader sees that collects nothing — a heading, an explanation, a
 * notice.
 *
 * Not a `<label>`, because there is no control for one to label, and a label
 * pointing at nothing is a label a screen reader announces as an orphan. Not a
 * heading element either: the spec does not say what level it would be, and
 * guessing produces a document outline that skips levels.
 */
export function StaticField({ label }: FieldComponentProps) {
  return <p data-formancy-part="static">{label}</p>
}
