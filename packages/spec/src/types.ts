/**
 * The formancy form schema.
 *
 * Four separate sections: `model` is the data contract, `logic` is behaviour, `layout`
 * is presentation, `i18n` is text. Keeping them apart is what lets one model have two
 * presentations.
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
export const SPEC_VERSIONS = ['1', '2', '3'] as const

export type SpecVersion = (typeof SPEC_VERSIONS)[number]

/** What a document gets when nothing says otherwise: the newest this package speaks. */
export const CURRENT_SPEC_VERSION: SpecVersion = '3'

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
 * How many of a table's columns a node takes.
 *
 * **Only inside a `table`**, and `validateSchema` refuses it anywhere else rather than
 * ignoring it.
 *
 * `'all'` rather than the column count, for the common case: `span: 2` in a table later
 * made three columns wide has silently lost the full width, and `'all'` survives the
 * edit. A number is still there for "two of three", and one wider than the table is
 * refused ([0074](../../../docs/decisions/0074-a-table-child-may-span.md)).
 *
 * A renderer that ignores this is still correct: every answer is collected and placed.
 * The narrow-screen collapse overrides it anyway, because WCAG 1.4.10 is a media query
 * rather than a property of the document.
 */
export interface LayoutPlacement {
  span?: number | 'all'
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
  | ({ kind: 'field'; path: string } & LayoutPlacement)
  | ({ kind: 'section' | 'row' | 'column'; label?: Text; children: LayoutNode[] } & LayoutPlacement)
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
  | ({ kind: 'tabs'; label?: Text; children: LayoutNode[] } & LayoutPlacement)
  /**
   * A grid whose columns line up across rows, which is the one thing stacked
   * `row` nodes cannot do — each row sizes itself independently.
   *
   * `columns` is the count at full width. Narrower than that and it collapses,
   * like every other container here, because WCAG 1.4.10 is a media query and
   * not a measurement.
   */
  | ({ kind: 'table'; columns: number; label?: Text; children: LayoutNode[] } & LayoutPlacement)
  /**
   * A machine-readable code drawn from a value the form already holds.
   *
   * **Collects nothing**, which is why it is here and not a field type. A field type
   * would put a non-answering entry in the model: a key that is an identity forever, a
   * path in the data, a row in every diff, a column in an exported CSV nobody filled
   * in, and a target a computed rule could aim at.
   *
   * It is not a widget either. A widget sits on a field that collects, and
   * `widget: "qrcode"` on a text field would replace the input with a picture — which
   * changes what somebody may enter, and is over the line
   * [0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md) draws.
   * The scanning half of the request IS a widget, for the opposite reason: reading a
   * code writes an answer.
   *
   * `path` names the field whose answer is encoded. `label` is what a reader is told
   * the code is — a picture says nothing to a screen reader, so the label and the
   * value behind it are the accessible content.
   */
  | ({ kind: 'qrcode'; path: string; label?: Text } & LayoutPlacement)

/**
 * The layout kinds that hold no children.
 *
 * `LayoutNode` had exactly two shapes — `field`, with a path and no children, and
 * everything else, with children — and fourteen places in this repository encoded that
 * as `node.kind === 'field' ? … : node.children`. `qrcode` is the first childless node
 * that is not a field, so every one of those was about to be wrong: most as a compile
 * error, which is the good case, and some as a silent walk into `undefined`.
 *
 * So the assumption lives here, once. The next childless node is a one-line change.
 */
export const LAYOUT_LEAF_KINDS = new Set<LayoutNode['kind']>(['field', 'qrcode'])

/**
 * A layout node's children, or none if it has none.
 *
 * The safe replacement for `node.kind === 'field' ? [] : node.children`. Use it rather
 * than testing the kind: a walker written against the kind is a walker that has to be
 * found again next time a leaf is added.
 */
export function layoutChildren(node: LayoutNode): readonly LayoutNode[] {
  return LAYOUT_LEAF_KINDS.has(node.kind) ? [] : (node as { children: LayoutNode[] }).children
}

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
 * Still reserved, unimplemented: multiselect, combobox, signature, address,
 * rating, slider.
 *
 * Four things that arrived as requests for types are NOT here and will not be:
 * toggle, datagrid, autocomplete and the scanning half of qrcode. None of them
 * changes what a field collects, so each is a `widget` on an existing type
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
 *
 * A list rather than a bare union because formancy.schema.json has to offer
 * the same values, and a test can only compare two lists.
 */
/**
 * Field types version 2 defines: version 1's, plus the five it added.
 *
 * Named rather than derived by subtraction, because the question each of these
 * lists answers is "may a document declaring version N use this", and an answer
 * computed from two other lists is one nobody can read off the page.
 */
export const SPEC_2_FIELD_TYPES = [
  ...SPEC_1_FIELD_TYPES,
  'selectboxes',
  'time',
  'datetime',
  'file',
  'richtext',
] as const

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'checkbox',
  'select',
  'radio',
  'selectboxes',
  'date',
  'time',
  'datetime',
  'file',
  'richtext',
  'signature',
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

/**
 * The exact shape each temporal answer takes, as a regular-expression source.
 *
 * A property of the FORMAT, not of an engine: a renderer writing an answer, a validator
 * bounding one and a consumer reading a submission years later all have to agree on the
 * shape, and that agreement is what makes a string comparison a chronological one.
 *
 * **Fixed width, zero-padded, big-endian, no abbreviation.** `'9:30' < '10:00'` is false
 * while `'09:30' < '10:00'` is true, and
 * `'2026-09-19T10:00:00+03:00' < '2026-09-19T08:00:00Z'` is false although the first
 * instant is earlier — which is why `datetime` stores `Z` and never a numeric offset.
 *
 * **A `time` is a wall clock and not an instant**: no zone, so it cannot be compared
 * with `now()`. A `datetime` is the opposite. **`date` and `datetime` are not
 * comparable** either: `'2026-09-19' < '2026-09-19T00:00:00Z'` is true, because the
 * shorter string is a prefix ([0067](../../../docs/decisions/0067-a-temporal-answer-is-one-fixed-width-string.md)).
 *
 * Sources rather than compiled patterns, so `formancy.schema.json` can carry the
 * identical string and a test can compare the two.
 */
export const TEMPORAL_SHAPES = {
  /** `YYYY-MM-DD`, ten characters. Unchanged — version 1 fixed it. */
  date: '^\\d{4}-\\d{2}-\\d{2}$',
  /** `HH:MM`, five characters, 24-hour. No seconds, no zone, no `24:00`. */
  time: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
  /** `YYYY-MM-DDTHH:MM:SSZ`, twenty characters. Seconds and `Z` mandatory. */
  datetime: '^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\dZ$',
} as const satisfies Partial<Record<FieldType, string>>

/** The field types whose answer is one of the shapes above. */
export const TEMPORAL_FIELD_TYPES = ['date', 'time', 'datetime'] as const satisfies readonly FieldType[]

export type TemporalFieldType = (typeof TEMPORAL_FIELD_TYPES)[number]


/**
 * One column of a repeater arranged as a grid.
 *
 * Configuration on a widget rather than a second field type, so there stays **one row
 * model and one type** ([0066](../../../docs/decisions/0066-a-widget-may-be-configured.md)).
 *
 * **None of this changes what is collected.** Columns decide which answers are shown
 * where, never which answers exist: a field left out of the list is still collected and
 * still shown, after the configured ones. A grid's rows are also flat — a column may not
 * name a group ([0078](../../../docs/decisions/0078-a-grid-row-is-flat.md)).
 */
export interface DataGridColumn {
  /** The key of one of this grid's own child fields. */
  field: string
  /**
   * How much of the available width this column takes, relative to the others. A
   * ratio, not a measurement, and greater than zero.
   *
   * **Not a CSS length, deliberately.** `width: "12rem"` in a document is the format
   * deciding the consumer's design system for them, which is the thing this project
   * exists to avoid — and a fixed length is one no renderer can honour on a narrow
   * screen. A unitless weight is a ratio a renderer spends however it likes, or
   * ignores entirely when it stacks the rows instead.
   *
   * Zero is refused rather than treated as hidden: a column nobody can see holds a
   * field that is still collected and still required-checked, which is the same harm
   * as a field left out of the only layout a form uses.
   */
  width?: number
  /** Which edge the values line up against. Numbers usually want `end`. */
  align?: 'start' | 'center' | 'end'
  /**
   * A shorter heading for the column when the field's own label is too long to sit
   * above it.
   *
   * The field's label is still what a screen reader announces for the control in the
   * cell, so this shortens the heading without renaming the question — which is the
   * distinction that keeps a visible column heading from becoming the accessible
   * name of every answer beneath it.
   */
  header?: Text
}

/**
 * How a field should LOOK, chosen by the author, never changing what it collects.
 *
 * **The line: a widget may change how a field looks, never what it collects.** The
 * moment a hint alters the stored value, the validation, or what somebody may enter, it
 * is a field type and belongs in `FIELD_TYPES`. Each name here sits on a type whose
 * value shape it leaves exactly alone
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
 *
 * **Closed, not an open string**, so `widget: "togle"` is an authoring-time error rather
 * than a form that looks right in the build that knew the name. Each new name is a
 * format change, which is the price of that.
 *
 * `autocomplete` is deliberately NOT the name for the type-ahead: that word is owed to
 * the HTML autofill token WCAG 1.3.5 asks for.
 */
/**
 * Widgets version 2 defines.
 *
 * Named separately for the same reason the field types are, and for one the field
 * types did not have: `widget` itself arrived in version 2, so a gate asking
 * whether a field HAS a widget answers yes for every one of them and says nothing
 * about which. A version 2 reader given a version 3 widget would render the
 * default control, collect the same answers and look entirely correct — which is
 * the silent failure the version line exists to prevent.
 */
export const SPEC_2_WIDGETS = ['toggle', 'datagrid', 'typeahead', 'scanner'] as const

export const FIELD_WIDGETS = [...SPEC_2_WIDGETS, 'tagpicker'] as const

export type FieldWidget = (typeof FIELD_WIDGETS)[number]

/**
 * Which widgets each field type accepts.
 *
 * A map rather than a flat list because `widget: "datagrid"` on a text field is an
 * author who believes they configured a grid, and a document that validates is a
 * document nobody tells them about. The JSON Schema gates the same way, through
 * the `if`/`then` branches it already uses for per-type properties, so the two
 * cannot drift — a test compares them.
 */
export const WIDGETS_BY_FIELD_TYPE = {
  /** A switch instead of a tick-box. Still `true | false | null`. */
  checkbox: ['toggle'],
  /** Rows as a table instead of stacked blocks. Still rows carrying `_id`. */
  repeater: ['datagrid'],
  /** Type to narrow a long option list. Still one offered option value. */
  select: ['typeahead'],
  /** Several answers, narrowed by typing and shown as chips. Still an array of
   *  offered option values, in the options' own order. */
  selectboxes: ['tagpicker'],
  /** A camera route to a string somebody could otherwise type. Still a string. */
  text: ['scanner'],
} as const satisfies Partial<Record<FieldType, readonly FieldWidget[]>>

/**
 * What a `signature` field collects: a mark, or a name.
 *
 * **Points, never a picture.** Points scale, survive a re-render, diff against
 * the previous answer and mean something to a reader that is not a browser. A
 * PNG does none of that, and a data URI in a submission is a megabyte of base64
 * nobody can read.
 *
 * **Integers, in the field's own box.** Floats drift, and the canonical hash a
 * submission is bound to must not depend on how a browser rounded a pointer
 * event.
 *
 * **Either drawn or typed, never both.** Typing your name is not a lesser
 * fallback for somebody who cannot draw with a pointer — it is how most people
 * sign most things, and it is the only route available from a keyboard. A field
 * that offered drawing alone would be a WCAG failure with a legal signature
 * attached to it.
 *
 * **No timing.** Stroke velocity is what makes a signature biometric, and
 * biometric data is a category (GDPR Article 9) nothing in this product is
 * equipped to hold. A signature here is a mark somebody made, not evidence
 * about their body.
 */
export type SignatureAnswer =
  | { drawn: Array<Array<[number, number]>>; typed?: never }
  | { typed: string; drawn?: never }

export interface FieldDef {
  /**
   * The field's identity, forever. Renaming a key is a data migration, not an
   * edit: declare `renamedFrom` so a diff can map old submissions across.
   */
  key: string
  type: FieldType
  /**
   * Presentation only, and only the widgets `WIDGETS_BY_FIELD_TYPE` allows for
   * this type. Absent means the renderer's default control.
   */
  widget?: FieldWidget
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
  /**
   * The NAME of a list the deployment resolves, for a `select` with too many answers
   * to write down or answers that change too often.
   *
   * **A name and never an address.** A URL here would be a deployment detail in a
   * portable format, frozen forever in a published version, and an SSRF surface on an
   * instance inside a private network. The document says *which* list, the deployment
   * says *where*, and nothing in `@formancy/spec` or `@formancy/core` fetches anything
   * ([0077](../../../docs/decisions/0077-options-may-come-from-a-named-source.md)).
   *
   * **Mutually exclusive with `options`.** A field offers a list or names a source;
   * both would be two answers to "what may be chosen" with no rule for which wins.
   *
   * **It weakens a guarantee.** A sourced answer's legal set is not in the frozen
   * document, so `schemaHash` no longer determines what a valid answer was and a stored
   * submission cannot be re-judged later. Naming it in the document is what makes that
   * trade enumerable per published version.
   */
  optionsSource?: string
  minItems?: number
  maxItems?: number
  addLabel?: string
  removeLabel?: string
  /**
   * `widget: "datagrid"` only: which child fields become columns, in which order.
   *
   * Optional — leaving it out arranges every child field in model order, which is
   * what the repeater already does. Refused without the widget, because columns
   * nothing will apply are an author who believes they configured an arrangement.
   */
  columns?: DataGridColumn[]
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
  /**
   * `signature` fields: the space the mark is drawn in, and how much ink it may
   * hold.
   *
   * `box` is `[width, height]` in the coordinate space the points are recorded
   * in — not pixels on anybody's screen. It travels with the FIELD rather than
   * with each answer, so two signatures on one form are comparable and a stored
   * answer can be redrawn at any size: a point at `x: 300` means nothing without
   * the width it was drawn in, and a picture that scales is exactly what storing
   * points buys.
   *
   * `maxPoints` caps one answer's total across all strokes. An unbounded point
   * list is a payload amplifier, like every other unbounded thing here.
   */
  box?: [number, number]
  maxPoints?: number
  /**
   * `date`, `time` and `datetime`: the earliest and latest answer allowed,
   * inclusive, written in exactly the form that type's answer takes.
   *
   * A LITERAL, never an expression and never the clock. `now()` inside a bound
   * would let the same submission pass in the browser and fail on the server by the
   * width of the trip — so "must be in the future" stays a `validate` rule, where
   * the race belongs to the author and is visible to them.
   *
   * Not `min`/`max`: those are `number` and gated to number fields, and widening
   * them would let TypeScript accept `min: "5"` on a field the schema refuses. One
   * pair per meaning is the habit here — `minLength`/`maxLength`,
   * `minItems`/`maxItems`.
   */
  earliest?: string
  latest?: string
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

/**
 * The rule kinds version 2 has, all of them one CEL expression.
 *
 * Named so a later kind can be gated by version. A reader on version 2 given a
 * kind it has never heard of has no safe answer: ignoring the rule renders a form
 * that behaves differently from the one the author built, and guessing is worse.
 */
export const SPEC_2_RULE_KINDS = [
  'visible',
  'disabled',
  'required',
  'computed',
  'validate',
] as const

/**
 * Every rule kind, including `check` — a validator the deployment answers.
 *
 * `check` is a KIND rather than a flag on `validate`, which
 * [0042](../../../docs/decisions/0042-freeze-the-spec.md) settled before it was
 * built: a CEL expression is pure and synchronous by construction, which is what
 * makes the dependency graph derivable and the evaluation bounded, so an
 * asynchronous validator cannot be an expression with a property on it.
 */
export const RULE_KINDS = [...SPEC_2_RULE_KINDS, 'check'] as const

export type RuleKind = (typeof RULE_KINDS)[number]

/** Where a validation rule runs. */
export type RunsOn = 'both' | 'client' | 'server'

export interface LogicRule {
  /** Data path of the field the rule applies to, e.g. `address.city` or `items[].qty`. */
  target: string
  kind: RuleKind
  /**
   * The rule, in CEL. The single source of truth for evaluation.
   *
   * Absent on a `check`, which has no expression: it names a validator the
   * deployment answers, and a rule carrying both would be two rules in one object
   * with no answer to which verdict wins.
   */
  cel?: string
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
  /**
   * check only: the NAME of a validator the deployment answers.
   *
   * **A name and never an address**, for the three reasons `optionsSource` gives:
   * a URL here would be a deployment detail in a portable format, frozen forever
   * in a published version, and an SSRF surface on an instance inside a private
   * network. The document says *which* check; the deployment says how to answer
   * it, and nothing in `@formancy/spec` or `@formancy/core` fetches anything
   * ([0086](../../../docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).
   */
  check?: string
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
