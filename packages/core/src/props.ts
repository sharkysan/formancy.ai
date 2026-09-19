import { describedBy } from './ids.js'
import type { FieldIds } from './ids.js'

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
  disabled?: true
}

export interface FieldProps {
  control: ControlProps
  label: { id: string; for: string }
  hint: { id: string }
  description: { id: string }
  error: { id: string }
}

export interface FieldPropsInput {
  wire: string
  ids: FieldIds
  required: boolean
  disabled: boolean
  touched: boolean
  errors: readonly string[]
}

export function buildFieldProps(input: FieldPropsInput): FieldProps {
  const showError = input.touched && input.errors.length > 0

  const control: ControlProps = { id: input.ids.control, name: input.wire }
  if (input.required) control['aria-required'] = true
  if (input.disabled) control.disabled = true
  if (showError) control['aria-invalid'] = true

  // Error text is a describedby target and must NOT also be a live region —
  // that combination is the classic double-announcement bug.
  const describes = describedBy(input.ids, { error: showError })
  if (describes !== undefined) control['aria-describedby'] = describes

  return Object.freeze({
    control: Object.freeze(control),
    label: Object.freeze({ id: input.ids.label, for: input.ids.control }),
    hint: Object.freeze({ id: input.ids.hint }),
    description: Object.freeze({ id: input.ids.description }),
    error: Object.freeze({ id: input.ids.error }),
  })
}
