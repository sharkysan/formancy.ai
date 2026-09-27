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
 * How many of a table's columns a node takes.
 *
 * Only inside a `table`, and `validateSchema` refuses it anywhere else rather than
 * ignoring it: a `span` that validated and did nothing is the documented-but-inert
 * shape this format has shipped once already.
 *
 * **Why it exists at all**, rather than telling an author to put the wide thing outside
 * the grid. A `table` can carry its own `label`, and that label names a real group. A
 * full-width field placed outside the table is outside that group too — so "put it
 * outside" is not a workaround with a cost, it is a layout the format could not express.
 * Reported by somebody looking at the playground, where a rich text editor and a file
 * dropzone sat at 266px against 548px for a field in the flow.
 *
 * `'all'` rather than the column count, for the common case. An author who writes
 * `span: 2` in a two-column table and later makes it three columns has silently lost the
 * full width; `'all'` is the thing they meant and it survives the edit. A number is still
 * there for "two of three", and a number wider than the table is refused — an author who
 * writes 4 in a two-column table believes they configured something.
 *
 * A renderer that ignores this is still correct in the sense 0065 means: every answer is
 * still collected and still placed. It is a measurement of width, and the narrow-screen
 * collapse overrides it anyway, because WCAG 1.4.10 is a media query rather than a
 * property of the document.
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
 * Here rather than in an engine because it is a property of the FORMAT. A renderer
 * writing an answer, a validator bounding one, and a consumer reading a submission
 * years later all have to agree on the shape — and that agreement is the only thing
 * that makes a string comparison a chronological one.
 *
 * **Fixed width, zero-padded, big-endian, no abbreviation.** Not tidiness. Measured:
 * `'9:30' < '10:00'` is **false** while `'09:30' < '10:00'` is true, so an unpadded
 * hour turns every bound into a coin toss. And
 * `'2026-09-19T10:00:00+03:00' < '2026-09-19T08:00:00Z'` is **false** although the
 * first instant is 07:00Z and therefore earlier — which is why `datetime` stores
 * `Z` and never a numeric offset. Widen any of these and a bound stops meaning what
 * it says.
 *
 * **A `time` is a wall clock and not an instant.** It carries no zone, so it cannot
 * be compared with `now()`, and that is what a time of day *is* rather than a gap.
 * A `datetime` is the opposite: an instant, with no wall clock of its own, displayed
 * in whatever zone the reader is in. `bindTimestamp` in `@formancy/expressions`
 * already refuses a zoneless string for the same reason, and says so.
 *
 * **`date` and `datetime` are not comparable**, and the shapes are why: measured,
 * `'2026-09-19' < '2026-09-19T00:00:00Z'` is true, because the shorter string is a
 * prefix — so a date sorts before every instant on its own day, midnight included.
 *
 * Sources rather than compiled patterns so `formancy.schema.json` can carry the
 * identical string and a test can compare the two. Two closed descriptions of one
 * rule is the drift this repository keeps finding.
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
 * ── WHY A WIDGET CARRIES CONFIGURATION ──────────────────────────────────────
 *
 * [0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md) said a
 * widget is a single name. The argument for promoting `datagrid` to a field type
 * once the columns needed configuring was that a name cannot carry an object — and
 * it was wrong: the document schema gates a property on `widget: "datagrid"` as
 * readily as on a type, so the coupling is enforceable either way.
 *
 * What settled it was building the type version first and watching it produce a bug.
 * A second type holding the repeater's row model made `walkFields` wrong — it opened
 * its row scope on `type === 'repeater'` alone, so a grid nested in a repeater passed
 * a rule that exists because the engine cannot count rows two levels deep. One row
 * model, one type ([0066](../../../docs/decisions/0066-a-widget-may-be-configured.md)).
 *
 * The line from 0065 still holds and is worth restating, because this is the edge of
 * it: **none of this changes what is collected.** Columns decide which answers are
 * shown where, never which answers exist. A field left out of the list is still
 * collected and still shown, after the configured ones.
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
 * A developer could already do this: `registry.byType` and `registry.byPath` swap
 * the component for any field, per deployment, at no cost to the format. What that
 * does not do is let the person the builder exists for choose — a non-technical
 * author cannot register a component, and a choice only a developer can make is
 * not an authoring feature. So the intent lives in the document and every renderer
 * decides how to honour it.
 *
 * **The line: a widget may change how a field looks, never what it collects.** The
 * moment a hint alters the stored value, the validation, or what somebody may
 * enter, it is a field type and belongs in `FIELD_TYPES` with all the cost that
 * carries. Each name here sits on a type whose value shape it leaves exactly alone.
 *
 * **Closed, not an open string.** An open one would cost nothing to extend and be
 * worth nothing: two renderers would guess differently at `widget: "togle"`, one
 * falling back silently and the other not, so a form would look right in the build
 * that knew the name and wrong everywhere else with nothing failing anywhere.
 * Closed makes a typo an authoring-time error, and makes each new name a format
 * change — which is the price of the guarantee.
 *
 * `autocomplete` is deliberately NOT the name for the type-ahead. That word is
 * owed to the HTML autofill token, which WCAG 1.3.5 asks for and the spec still
 * does not have; spending it on presentation would leave nothing to call the real
 * thing.
 */
export const FIELD_WIDGETS = ['toggle', 'datagrid', 'typeahead', 'scanner'] as const

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
  /** A camera route to a string somebody could otherwise type. Still a string. */
  text: ['scanner'],
} as const satisfies Partial<Record<FieldType, readonly FieldWidget[]>>

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
