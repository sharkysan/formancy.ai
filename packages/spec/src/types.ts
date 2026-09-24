/**
 * The formancy form schema.
 *
 * The four sections are separated deliberately: `model` is the data contract,
 * `logic` is behaviour, `layout` is presentation, `i18n` is text. form.io mixes
 * all four into one component tree, which is why a form there cannot have two
 * presentations of the same data.
 */
export interface FormSchema {
  /**
   * Which version of the document format this form is written against.
   * Independent of package versions, and the thing a reader checks before
   * deciding whether it understands the document at all.
   */
  specVersion: SpecVersion
  id: string
  title: string
  model: FormModel
  logic?: FormLogic
  /** Message catalogues. Optional: a form may carry plain strings instead. */
  i18n?: FormI18n
  /** Named arrangements of the same model. Optional: model order is the default. */
  layouts?: FormLayout[]
}

/**
 * The document format versions a reader of this package understands.
 *
 * Version 1 is frozen and stays readable forever. Version 2 is a superset: it
 * adds field types and layout kinds and removes nothing, so every spec 1
 * document is also a valid spec 2 document and `upgradeSpecVersion` is a
 * one-line change.
 *
 * The line is drawn by what a READER must understand, not by what a document
 * happens to contain. A `selectboxes` field is meaningless to an
 * implementation that has never heard of it — it would silently drop the
 * answer — so a document using one is not a spec 1 document, however
 * compatible the rest of it looks
 * ([0051](../../../docs/decisions/0051-spec-2-adds-types.md)).
 */
export const SPEC_VERSIONS = ['1', '2'] as const

export type SpecVersion = (typeof SPEC_VERSIONS)[number]

/** What a document gets when nothing says otherwise: the newest this package speaks. */
export const CURRENT_SPEC_VERSION: SpecVersion = '2'

/** Field types version 1 defines. Everything else needs `specVersion: "2"`. */
export const SPEC_1_FIELD_TYPES = [
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
] as const satisfies readonly FieldType[]

/** Layout node kinds version 1 defines. */
export const SPEC_1_LAYOUT_KINDS = ['field', 'section', 'row', 'column'] as const

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
  /**
   * One panel shown at a time, each child section supplying a tab and its
   * label supplying the tab's name.
   *
   * Reusing `section` rather than inventing a panel node keeps the union small
   * and makes the rule obvious: a tab needs a name, and a section is the node
   * that has one.
   *
   * Tabs are **presentation**, unlike `page`. Every field in every tab is
   * validated and submitted whether its tab is open or not, because hiding a
   * field behind a tab is not the same as saying it does not apply
   * ([0012](../../../docs/decisions/0012-pages-scope-nothing.md) draws the
   * same line for pages). A renderer therefore has to be able to open the tab
   * an error is in.
   *
   * A `label` here names the tab strip itself, not a tab. Two tab strips in
   * one form are otherwise both announced as "tab list" and a screen-reader
   * user cannot tell which is which.
   */
  | { kind: 'tabs'; label?: Text; children: LayoutNode[] }
  /**
   * A grid whose columns line up across rows, which is the one thing stacked
   * `row` nodes cannot do — each row sizes itself independently.
   *
   * `columns` is the count at full width. Narrower than that and it collapses,
   * like every other container here, because WCAG 1.4.10 is a media query and
   * not a measurement.
   */
  | { kind: 'table'; columns: number; label?: Text; children: LayoutNode[] }

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
 * Every field type this package understands, across both spec versions.
 *
 * `SPEC_1_FIELD_TYPES` says which of them version 1 allows; the rest need
 * `specVersion: "2"`, and `validateSchema` refuses one in a version 1 document
 * by name rather than by a schema error nobody can read.
 *
 * Still reserved, unimplemented: datetime, time, multiselect, combobox,
 * signature, address, rating, slider.
 *
 * A list rather than a bare union because formancy.schema.json has to offer
 * the same values, and a test can only compare two lists.
 */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'checkbox',
  'select',
  'radio',
  'selectboxes',
  'date',
  'file',
  'richtext',
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

/**
 * The field types whose answer is a list.
 *
 * Empty for these is `[]`, never null: a selectboxes field with nothing ticked
 * has an answer, and it is the empty list. The distinction is not pedantry
 * — `'a' in topics` is false against `[]` and an ERROR against null, so a
 * reader that gets this wrong makes every rule reading an untouched list field
 * fail, and a visibility rule that fails shows the field it was meant to hide.
 *
 * Here rather than in an implementation because it is a property of the
 * format: anything reading a formancy document has to agree about it, or two
 * readers disagree about whether a form is showing a field.
 */
export const LIST_VALUED_FIELD_TYPES = [
  'selectboxes',
  'file',
  'repeater',
] as const satisfies readonly FieldType[]

export type ListValuedFieldType = (typeof LIST_VALUED_FIELD_TYPES)[number]

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
  /**
   * `file` fields: which files may be attached, and how many.
   *
   * `accept` holds media types or extensions in the same grammar the HTML
   * `accept` attribute uses, so the picker filters and the server checks the
   * same list — a client-side filter alone is a suggestion, not a rule.
   * `maxFileSize` is in bytes. `minItems`/`maxItems` bound the count, the same
   * two properties a repeater uses.
   */
  accept?: string[]
  maxFileSize?: number
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
