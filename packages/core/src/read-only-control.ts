import type { FieldDef } from '@formancy/spec'

/** The types whose default control is a box a person types into, which can be drawn `readonly`. */
const BOXES: ReadonlySet<string> = new Set(['text', 'textarea', 'number', 'date', 'time', 'datetime'])

/*
 * Whether a field's own control can show a computed value read-only (0181): a box a person types
 * into, drawn as its type's default. A widget draws something else that takes an answer — a
 * scanner's button, a rating's stars, a slider's thumb — and a choice, a tick, a list, a file,
 * rich text or a signature has no read-only state at all, so a field a computed rule writes with
 * one of those is drawn as its answer in words instead, decided here once for both renderers
 * (0216). Block comment, with one JSDoc line below for the declaration a host reads.
 */
/** Whether this field's own control has a read-only state to show a computed value in. */
export function hasReadOnlyControl(def: Pick<FieldDef, 'type' | 'widget'>): boolean {
  return BOXES.has(def.type) && def.widget === undefined
}
