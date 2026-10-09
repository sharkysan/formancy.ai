import type { Provider, Type } from '@angular/core'
import { DEFAULT_FIELD_COMPONENTS, provideFormancyRegistry } from '@formancy/angular'
import type { FormancyRegistry } from '@formancy/angular'
import {
  FormancyMaterialCheckboxField,
  FormancyMaterialRadioGroupField,
  FormancyMaterialSelectBoxesField,
  FormancyMaterialSelectField,
} from './choice-fields.js'
import {
  FormancyMaterialDateField,
  FormancyMaterialNumberField,
  FormancyMaterialTextareaField,
  FormancyMaterialTextField,
  FormancyMaterialTimeField,
} from './input-fields.js'

/**
 * formancy's fields drawn with Angular Material — the registry the Angular renderer
 * already reads, filled with Material controls
 * ([0132](../../../../docs/decisions/0132-material-draws-what-it-has-an-equivalent-for.md)).
 *
 * Only the types Material has an equivalent for; every other type keeps its default
 * control, and so does every variant of these that Material cannot draw — a mask, a
 * typeahead, a rating, a picture on an option.
 */
export const FORMANCY_MATERIAL_CONTROLS = {
  text: FormancyMaterialTextField,
  textarea: FormancyMaterialTextareaField,
  number: FormancyMaterialNumberField,
  date: FormancyMaterialDateField,
  time: FormancyMaterialTimeField,
  select: FormancyMaterialSelectField,
  checkbox: FormancyMaterialCheckboxField,
  radio: FormancyMaterialRadioGroupField,
  selectboxes: FormancyMaterialSelectBoxesField,
} satisfies Partial<Record<keyof typeof DEFAULT_FIELD_COMPONENTS, Type<unknown>>>

/**
 * The registry, provided. A form wanting some of its own controls as well spreads
 * `FORMANCY_MATERIAL_CONTROLS` into its own `byType` instead.
 */
export function provideFormancyMaterial(extra: Omit<FormancyRegistry, 'byType'> = {}): Provider[] {
  return provideFormancyRegistry({ ...extra, byType: FORMANCY_MATERIAL_CONTROLS })
}

export {
  FormancyMaterialCheckboxField,
  FormancyMaterialDateField,
  FormancyMaterialNumberField,
  FormancyMaterialRadioGroupField,
  FormancyMaterialSelectBoxesField,
  FormancyMaterialSelectField,
  FormancyMaterialTextareaField,
  FormancyMaterialTextField,
  FormancyMaterialTimeField,
}
