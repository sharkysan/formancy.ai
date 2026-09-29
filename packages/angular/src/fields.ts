import type { Type } from '@angular/core'
import type { FieldType } from '@formancy/spec'
import {
  FormancyCheckboxField,
  FormancyRadioGroupField,
  FormancySelectField,
} from './fields/choice-fields.js'
import { FormancyFileField } from './fields/file-field.js'
import { FormancyRichTextField } from './fields/rich-text-field.js'
import { FormancySelectBoxesField } from './fields/selectboxes-field.js'
import { FormancySignatureField } from './fields/signature-field.js'
import { FormancyStaticField } from './fields/static-field.js'
import {
  FormancyDateField,
  FormancyDateTimeField,
  FormancyTimeField,
} from './fields/temporal-fields.js'
import {
  FormancyNumberField,
  FormancyTextField,
  FormancyTextareaField,
} from './fields/text-fields.js'

/**
 * Which component renders which field type.
 *
 * The one thing that genuinely knows about all of them, which is why it is what
 * remains here after the controls moved into `fields/`. The rest of this file
 * was seventeen components sharing an address — 1,909 lines, the second largest
 * in the repository and the place things went. A control changes for its own
 * reasons, so a control is a file.
 *
 * `null` is not an omission. `hidden` renders nothing by design, and `group`,
 * `page` and `repeater` are containers the form itself walks rather than
 * controls — a map naming a component for them would describe a different
 * engine.
 */
export const DEFAULT_FIELD_COMPONENTS: Record<FieldType, Type<unknown> | null> = {
  text: FormancyTextField,
  textarea: FormancyTextareaField,
  number: FormancyNumberField,
  checkbox: FormancyCheckboxField,
  date: FormancyDateField,
  time: FormancyTimeField,
  datetime: FormancyDateTimeField,
  select: FormancySelectField,
  radio: FormancyRadioGroupField,
  selectboxes: FormancySelectBoxesField,
  file: FormancyFileField,
  richtext: FormancyRichTextField,
  signature: FormancySignatureField,
  hidden: null,
  static: FormancyStaticField,
  group: null,
  page: null,
  repeater: null,
}

export { FieldComponentBase, FormancyFieldShell } from './fields/field-shell.js'
export {
  FormancyCheckboxField,
  FormancyRadioGroupField,
  FormancySelectField,
} from './fields/choice-fields.js'
export { FormancyFileField } from './fields/file-field.js'
export { FormancyRichTextField } from './fields/rich-text-field.js'
export { FormancySelectBoxesField, FormancyTagPickerField } from './fields/selectboxes-field.js'
export { FormancySignatureField } from './fields/signature-field.js'
export { FormancyStaticField } from './fields/static-field.js'
export { FormancyTypeaheadSelect } from './fields/typeahead-field.js'
export {
  FormancyDateField,
  FormancyDateTimeField,
  FormancyTimeField,
} from './fields/temporal-fields.js'
export {
  FormancyNumberField,
  FormancyTextField,
  FormancyTextareaField,
} from './fields/text-fields.js'
