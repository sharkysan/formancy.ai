import type { FieldType } from '@formancy/spec'
import { CheckboxField, RadioGroupField, SelectField } from './fields/choice-fields.js'
import { FileField } from './fields/file-field.js'
import type { FieldComponent } from './fields/internals.js'
import { RichTextField } from './fields/rich-text-field.js'
import { SelectBoxesSwitch } from './fields/selectboxes-field.js'
import { RankingField } from './fields/ranking-field.js'
import { MatrixField } from './fields/matrix-field.js'
import { NumberSwitch } from './fields/scale-fields.js'
import { SignatureField } from './fields/signature-field.js'
import { StaticField } from './fields/static-field.js'
import { DateField, DateTimeField, TimeField } from './fields/temporal-fields.js'
import { TextField, TextareaField } from './fields/text-fields.js'

/**
 * Which component renders which field type, as the Angular binding's `fields.ts` says it.
 *
 * Apart from `form.tsx`, which walks the form and draws its containers, because a table of
 * controls changes when a control is added and the walk does not. It left when the walk had no
 * line to give a repeater's maximum.
 *
 * `null` means the type renders nothing here: a hidden field is carried in the submission and
 * never shown, and the container types are laid out by the form's own walk rather than by a leaf
 * slot.
 */
export const DEFAULT_COMPONENTS: Record<FieldType, FieldComponent | null> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberSwitch,
  checkbox: CheckboxField,
  date: DateField,
  time: TimeField,
  datetime: DateTimeField,
  select: SelectField,
  radio: RadioGroupField,
  selectboxes: SelectBoxesSwitch,
  ranking: RankingField,
  matrix: MatrixField,
  file: FileField,
  richtext: RichTextField,
  signature: SignatureField,
  hidden: null,
  static: StaticField,
  group: null,
  page: null,
  repeater: null,
}
