import type { FieldDef } from '@formancy/spec'
import { describedBy } from './ids.js'
import type { FieldIds } from './ids.js'
import { showsCount } from './counted.js'
import { hasReadOnlyControl } from './read-only-control.js'

/**
 * The prop getters — theming mechanism number one, and the floor under every
 * renderer: plain serialisable objects carrying every id and ARIA attribute a
 * correct field needs. They are computed HERE so React and Angular ship
 * byte-identical wiring; each binding only adapts casing (`for` to `htmlFor`).
 *
 * Absence is the claim of health: `aria-invalid` appears only on a field that
 * is touched AND invalid — a pristine form does not open by shouting — and it
 * is never present as `false`, because assistive tech treats the attribute's
 * presence as meaningful.
 */
export interface ControlProps {
  id: string
  name: string
  'aria-invalid'?: true
  'aria-required'?: true
  'aria-describedby'?: string
  /**
   * A check about this answer is in flight.
   *
   * Busy is said with `aria-busy`, never by disabling: disabling the element
   * somebody just typed into blurs it, and the browser then resets focus to the
   * document body. The scanner and the typeahead's option source both arrived at
   * the same answer, and composing it here is what stops the three from drifting.
   */
  'aria-busy'?: true
  disabled?: true
}

export interface FieldProps {
  control: ControlProps
  label: { id: string; for: string }
  hint: { id: string }
  description: { id: string }
  count: { id: string }
  error: { id: string }
}

/**
 * The field types a renderer draws as a fieldset and a legend.
 *
 * Several controls answering one question, which is a `group` to assistive
 * technology — and `role="group"` does not support `aria-required`, so these
 * say they are required in their description instead. See
 * `FieldPropsInput.grouped`.
 */
export const GROUPED_FIELD_TYPES: ReadonlySet<string> = new Set(['radio', 'selectboxes', 'ranking', 'matrix', 'repeater'])

export interface FieldPropsInput {
  wire: string
  ids: FieldIds
  required: boolean
  /**
   * The field is announced as a GROUP rather than as a single control: a radio
   * group or a set of tick boxes, drawn as a fieldset and a legend.
   *
   * It changes how requiredness is expressed, and it has to. `aria-required`
   * is not a supported property of `role="group"` — assistive technology
   * ignores it, and an auditor reports it as invalid ARIA. So a required group
   * says so in its DESCRIPTION instead, through the `hint` slot, which is
   * announced after the legend and is valid everywhere.
   *
   * Decided here rather than in each renderer, because two renderers that
   * expressed this differently would announce the same form differently while
   * both looked right.
   */
  grouped?: boolean
  /**
   * The field has a description (0194), drawn at `ids.description`: named in
   * `aria-describedby` so it is read out with the control, never as its name. Only when
   * there is one, since an id pointing at nothing is an error an auditor reports.
   */
  described?: boolean
  /**
   * The field shows a character count (0203), drawn at `ids.count`: named after the description,
   * so the limit and what is left are read with the control. `showsCount` — the one test
   * the engine and `countSentence` ask.
   */
  counted?: boolean
  /**
   * The field's definition, from which `grouped`, `described` and `counted` are read where they
   * are not given — what the engine hands, so the three are decided here and nowhere else.
   */
  def?: Pick<FieldDef, 'type' | 'widget' | 'description' | 'maxLength'>
  /**
   * A computed rule writes the field (0181). One whose own control has no read-only state is
   * drawn as its answer in a single read-only box (0216), so it is one control, never a group.
   */
  readOnly?: boolean
  /** A check about this answer is waiting for the deployment to answer. */
  checking?: boolean
  disabled: boolean
  touched: boolean
  errors: readonly string[]
}

export function buildFieldProps(input: FieldPropsInput): FieldProps {
  const showError = input.touched && input.errors.length > 0
  const { def } = input
  // A list of ticks drawn as a tag picker is one combobox, which supports `aria-required`, and
  // draws no hint: decided as a group, its box pointed at a hint nothing carried (D4, 0211). A
  // computed group of controls is drawn as one read-only box, and says so the same way (0216).
  const answerBox = input.readOnly === true && def !== undefined && !hasReadOnlyControl(def)
  const grouped =
    input.grouped ?? (def !== undefined && GROUPED_FIELD_TYPES.has(def.type) && def.widget !== 'tagpicker' && !answerBox)
  const described = input.described ?? def?.description !== undefined
  const counted = input.counted ?? (def !== undefined && showsCount(def))

  const control: ControlProps = { id: input.ids.control, name: input.wire }
  // Not on a group: `aria-required` is not supported on `role="group"`, so on
  // a fieldset it is ignored by assistive technology and reported as invalid
  // ARIA. The hint below carries it instead.
  if (input.required && !grouped) control['aria-required'] = true
  if (input.disabled) control.disabled = true
  if (input.checking) control['aria-busy'] = true
  if (showError) control['aria-invalid'] = true

  // Error text is a describedby target and must NOT also be a live region —
  // that combination is the classic double-announcement bug.
  const describes = describedBy(input.ids, {
    hint: grouped && input.required,
    description: described,
    count: counted,
    error: showError,
  })
  if (describes !== undefined) control['aria-describedby'] = describes

  return Object.freeze({
    control: Object.freeze(control),
    label: Object.freeze({ id: input.ids.label, for: input.ids.control }),
    hint: Object.freeze({ id: input.ids.hint }),
    description: Object.freeze({ id: input.ids.description }),
    count: Object.freeze({ id: input.ids.count }),
    error: Object.freeze({ id: input.ids.error }),
  })
}
