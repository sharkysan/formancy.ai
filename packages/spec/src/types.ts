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
  specVersion: '1'
  id: string
  title: string
  model: FormModel
  logic?: FormLogic
  /** Message catalogues. Optional: a form may carry plain strings instead. */
  i18n?: FormI18n
  /** Named arrangements of the same model. Optional: model order is the default. */
  layouts?: FormLayout[]
}

/** A reference into the message catalogue, in place of a literal string. */
export interface MessageRef {
  $t: string
}

/** Anything a person reads: a literal, or a reference to a translation. */
export type Text = string | MessageRef

export interface FormI18n {
  /** The locale every reference must resolve in, and the fallback for the rest. */
  defaultLocale: string
  /** locale -> message id -> text. Non-default locales may be partial. */
  messages: Record<string, Record<string, string>>
}

/**
 * One arrangement of a model. A form may have several — `web`, `print`,
 * `mobile` — over the same data, which is the point of keeping layout out of
 * the model in the first place.
 */
export interface FormLayout {
  name: string
  nodes: LayoutNode[]
}

export type LayoutNode =
  | { kind: 'field'; path: string }
  | { kind: 'section' | 'row' | 'column'; label?: Text; children: LayoutNode[] }

export interface FormModel {
  fields: FieldDef[]
}

/**
 * The key under which a repeater row carries its identity.
 *
 * Rows need an identity that is not their position, because position is not
 * stable: removing a row renumbers every row after it. It lives IN the row
 * rather than beside it so that a stored submission is self-describing — an
 * export or an audit read years later can still say which row an answer
 * belonged to, without the engine that wrote it.
 *
 * The cost of that choice is this: `_id` is reserved, and no field may use it
 * as a key. `validateSchema` refuses one that tries.
 */
export const ROW_ID = '_id'

/** Minted ids are this prefix followed by a per-repeater counter. */
export const ROW_ID_PREFIX = 'r'

/**
 * The v0.1 field types. Deferred types keep their names reserved so adding
 * them later is a compatible change: file, datetime, time, multiselect,
 * combobox, richtext, signature, address, rating, slider.
 *
 * A list rather than a bare union because formancy.schema.json has to offer
 * the same twelve values, and a test can only compare two lists.
 */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'checkbox',
  'select',
  'radio',
  'date',
  'hidden',
  'static',
  'group',
  'page',
  'repeater',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

/**
 * The field types that hold other fields. Every other type collects one answer
 * and has no children.
 */
export const CONTAINER_FIELD_TYPES = ['group', 'page', 'repeater'] as const satisfies readonly FieldType[]

export type ContainerFieldType = (typeof CONTAINER_FIELD_TYPES)[number]

export interface FieldDef {
  /**
   * The field's identity, forever. Renaming a key is a data migration, not an
   * edit: declare `renamedFrom` so a diff can map old submissions across.
   */
  key: string
  type: FieldType
  required?: boolean
  renamedFrom?: string
  /**
   * The fields held inside a group, a page or a repeater. Absent on every
   * other type: they collect an answer rather than holding children.
   */
  fields?: FieldDef[]
  /**
   * What happens to the answer when a rule hides this field. Default true:
   * the value is pruned, so a hidden branch cannot carry data into the
   * submission. Lives in the model rather than in logic because it decides
   * the data shape.
   */
  clearOnHide?: boolean
  /**
   * Version 0 presentation-lite, superseded by the i18n and layout sections at
   * spec v1: one language of display text, options for choice fields, and
   * repeater chrome. They live here because a form without labels is unusable
   * and inventing a side-channel would be worse than carrying them openly.
   */
  label?: Text
  options?: FieldOption[]
  minItems?: number
  maxItems?: number
  addLabel?: string
  removeLabel?: string
  /** number fields: the valid range. */
  min?: number
  max?: number
  /** text fields: bounds, a whole-match pattern, and a named format. */
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: FieldFormat
}

/** A closed list on purpose: each entry is one well-tested check, not a
 *  per-form regular expression. */
export type FieldFormat = 'email' | 'url' | 'uuid'

export interface FieldOption {
  /** Stored in the submission; stable like a field key. */
  value: string
  label: Text
}

/** The form's behaviour, apart from its data model. */
export interface FormLogic {
  rules: LogicRule[]
}

export type RuleKind = 'visible' | 'disabled' | 'required' | 'computed' | 'validate'

/** Where a validation rule runs. */
export type RunsOn = 'both' | 'client' | 'server'

export interface LogicRule {
  /** Data path of the field the rule applies to, e.g. `address.city` or `items[].qty`. */
  target: string
  kind: RuleKind
  /** The rule, in CEL. The single source of truth for evaluation. */
  cel: string
  /** validate only: the error code the field carries while the check fails. */
  code?: string
  /**
   * validate only: where this check runs. Defaults to `both`.
   *
   * Some checks cannot run in both places — a uniqueness check needs the
   * database, a debounced hint needs the keyboard — and without a way to say
   * so, an author writes the check twice and the two copies drift.
   *
   * Metadata rules deliberately cannot carry this. If visibility or
   * requiredness could differ between client and server, the server's replay
   * would stop being a check and become a second opinion.
   */
  runsOn?: RunsOn
  /** Regenerated visual-editor metadata. Never evaluated. */
  editor?: unknown
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
