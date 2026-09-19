/**
 * The formancy form schema, spec version 0.
 *
 * UNSTABLE. Freezes to "1" once the Angular renderer has proved the model is
 * not React-shaped.
 *
 * The four sections are separated deliberately: `model` is the data contract,
 * `logic` is behaviour, `layout` is presentation, `i18n` is text. form.io mixes
 * all four into one component tree, which is why a form there cannot have two
 * presentations of the same data.
 */
export interface FormSchema {
  /** Spec version, independent of package versions. */
  specVersion: '0'
  id: string
  title: string
  model: FormModel
}

export interface FormModel {
  fields: FieldDef[]
}

/**
 * The v0.1 field types. Deferred types keep their names reserved so adding
 * them later is a compatible change: file, datetime, time, multiselect,
 * combobox, richtext, signature, address, rating, slider.
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'radio'
  | 'date'
  | 'hidden'
  | 'static'
  | 'group'
  | 'page'
  | 'repeater'

export interface FieldDef {
  /**
   * The field's identity, forever. Renaming a key is a data migration, not an
   * edit: declare `renamedFrom` so a diff can map old submissions across.
   */
  key: string
  type: FieldType
  required?: boolean
  renamedFrom?: string
}

/**
 * How a change affects data already collected under the previous version.
 *
 * - `compatible` — existing drafts and submissions rebind silently.
 * - `lossy`      — they rebind, but some data no longer has a home.
 * - `breaking`   — they cannot rebind at all.
 */
export type ChangeSeverity = 'compatible' | 'lossy' | 'breaking'

export interface Change {
  severity: ChangeSeverity
  /** Stable machine-readable discriminator, e.g. `field.added`. */
  kind: string
  /** Path into the schema the change applies to, e.g. `model.fields.email`. */
  path: string
  detail: string
}
