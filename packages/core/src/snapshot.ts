import type { FieldDef, FieldType } from '@formancy/spec'
import type { FieldIds } from './ids.js'
import type { FieldProps } from './props.js'

/**
 * What a renderer is handed about one field.
 *
 * Apart from the engine because it changes for the renderers' reasons — a description to
 * draw, a read-only state, a check in flight, a rule's message to say — and not when the
 * machinery that fills it does. It left `engine.ts` when the messages needed lines that file's
 * ceiling would not give (0198).
 *
 * Snapshots are identity-stable: a field's snapshot object is replaced only when something in
 * it changes, which is what lets `useSyncExternalStore` and `OnPush` work with no memoisation on
 * the consumer's side.
 */
export interface FieldSnapshot {
  value: unknown
  /** The model field type, so component registries can dispatch on it. */
  type: FieldType
  required: boolean
  visible: boolean
  disabled: boolean
  /**
   * A `computed` rule writes this field, so its value is the engine's: a value set on it
   * does not take. A control draws it read-only where it has a read-only state — never
   * disabled, which would take it out of the tab order and grey out a value meant to be
   * read (0181).
   */
  readOnly: boolean
  touched: boolean
  /**
   * A check about this answer is in flight.
   *
   * On the snapshot rather than left for a host to track, because a control that
   * looks finished and is not is one somebody submits — and the renderers say so
   * with `aria-busy`, never by disabling, which would move focus out from under
   * whoever is typing.
   */
  checking: boolean
  /**
   * Error CODES (e.g. "required"), the engine's vocabulary and a report's. What a person reads
   * is `errorSentence`'s: the renderers' catalogue for the engine's own codes, and `messages` for
   * the codes the field's rules give words to (0191, 0198).
   */
  errors: readonly string[]
  /**
   * The label already resolved to a string in the engine's locale.
   *
   * `def.label` may be a reference into the message catalogue, and resolving it
   * in the engine rather than in each renderer is what keeps React and Angular
   * from disagreeing about what a field is called — the same reasoning that put
   * ids and ARIA wiring here.
   *
   * Always present, undefined when the field declares no label at all — a
   * renderer then falls back to something of its own.
   */
  label: string | undefined
  /** The field's help text, resolved as `label` is; undefined when it has none (0194). */
  description: string | undefined
  /**
   * What the field's own `validate` rules say for their codes, resolved as `label` is: what a
   * renderer says for one of `errors` in place of the code, a verdict from the server included,
   * since the message is the document's and not the evaluation's (0198). Empty when they say
   * nothing.
   */
  messages: Readonly<Record<string, string>>
  /** The model definition, verbatim — renderers read options and extras from it. */
  def: FieldDef
  ids: FieldIds
  /** Ready-to-spread ARIA wiring; see props.ts for the rules it encodes. */
  props: FieldProps
}
