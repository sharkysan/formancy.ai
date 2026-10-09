/**
 * The version each construct a document can say arrived in.
 *
 * One table per thing a document is made of — its own keys, a field's, an option's, a
 * rule's, a layout node's — each keyed by the TypeScript type that lists them. So a
 * property added to `FieldDef` with no version here is a **compile error**, not a
 * document a frozen reader refuses. The version check reads these tables rather than
 * naming constructs one by one, and `version-ledger.test.ts` holds each table to the
 * document schema, so a property the schema gains without an entry fails too.
 *
 * Field types and widgets keep their per-version lists in `types.ts`, which say the
 * same thing as a list rather than a table and are held by `spec-version.test.ts`.
 */
import { SPEC_1_FIELD_TYPES, SPEC_2_FIELD_TYPES, SPEC_3_FIELD_TYPES } from './types.js'
import type { FieldDef, FieldOption, FieldType, FormSchema, MatrixRow } from './types.js'
import type { LayoutNode } from './layout.js'
import type { LogicRule, RuleKind } from './rules.js'

/** A spec version, as the number the ledger compares. */
export type SpecVersionNumber = 1 | 2 | 3 | 4

/**
 * A field property's version: one number, or one per field type where the property
 * widened to a type that is older than the widening. `optionsSource` is the case: on a
 * `select` since version 2, on `selectboxes` — itself a version 2 type — only since 3.
 */
export type PropertySince = SpecVersionNumber | Partial<Record<FieldType, SpecVersionNumber>>

/** Every key any member of a union has, which `keyof` of the union does not give. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

export const DOCUMENT_PROPERTY_SINCE = {
  specVersion: 1,
  id: 1,
  title: 1,
  model: 1,
  logic: 1,
  i18n: 1,
  layouts: 1,
} as const satisfies Record<keyof FormSchema, SpecVersionNumber>

/**
 * A property that arrived with the only types that may carry it is written as that
 * version: `box` is 3 because `signature` is. The check reports a property only when it
 * is newer than its field's type, since otherwise the type's own error already says so.
 *
 * `widget` is gated by its value, not here: which widget, not whether there is one,
 * decides the version (`spec-version.test.ts`).
 */
export const FIELD_PROPERTY_SINCE = {
  key: 1,
  type: 1,
  widget: 2,
  required: 1,
  renamedFrom: 1,
  fields: 1,
  clearOnHide: 1,
  label: 1,
  options: 1,
  rows: 4,
  optionsSource: { select: 2, selectboxes: 3 },
  minItems: 1,
  maxItems: 1,
  addLabel: 1,
  removeLabel: 1,
  columns: 2,
  accept: 2,
  maxFileSize: 2,
  box: 3,
  maxPoints: 3,
  earliest: 2,
  latest: 2,
  min: 1,
  max: 1,
  step: 4,
  minLength: 1,
  maxLength: 1,
  pattern: 1,
  format: 1,
  mask: 4,
} as const satisfies Record<keyof FieldDef, PropertySince>

export const OPTION_PROPERTY_SINCE = {
  value: 1,
  label: 1,
  image: 4,
} as const satisfies Record<keyof FieldOption, SpecVersionNumber>

/** A row exists only on a `matrix`, so nothing here is newer than the type that holds it. */
export const MATRIX_ROW_PROPERTY_SINCE = {
  value: 4,
  label: 4,
} as const satisfies Record<keyof MatrixRow, SpecVersionNumber>

export const RULE_KIND_SINCE = {
  visible: 1,
  disabled: 1,
  required: 1,
  computed: 1,
  validate: 1,
  check: 3,
  skip: 3,
} as const satisfies Record<RuleKind, SpecVersionNumber>

export const RULE_PROPERTY_SINCE = {
  target: 1,
  kind: 1,
  cel: 1,
  code: 1,
  runsOn: 1,
  editor: 1,
  check: 3,
} as const satisfies Record<keyof LogicRule, SpecVersionNumber>

export const LAYOUT_KIND_SINCE = {
  field: 1,
  section: 1,
  row: 1,
  column: 1,
  tabs: 2,
  table: 2,
  qrcode: 2,
} as const satisfies Record<LayoutNode['kind'], SpecVersionNumber>

export const LAYOUT_NODE_PROPERTY_SINCE = {
  kind: 1,
  path: 1,
  label: 1,
  children: 1,
  span: 2,
  columns: 2,
} as const satisfies Record<KeysOfUnion<LayoutNode>, SpecVersionNumber>

/**
 * The version a field type first appeared in, asked of each version's list in turn. It
 * once read "1, else 2, else 3" and answered 3 for every type there would ever be, so a
 * version 3 document carrying a version 4 `ranking` was told it needed version 3.
 */
export function fieldTypeSince(type: string): SpecVersionNumber {
  if ((SPEC_1_FIELD_TYPES as readonly string[]).includes(type)) return 1
  if ((SPEC_2_FIELD_TYPES as readonly string[]).includes(type)) return 2
  if ((SPEC_3_FIELD_TYPES as readonly string[]).includes(type)) return 3
  // Version 4's — `spec-version.test.ts` holds every type to one of the four lists — or
  // no field type at all, which the document schema refuses before this is asked.
  return 4
}

/** The version a property needs on a field of this type: the later of the two. */
export function fieldPropertySince(property: keyof FieldDef, type: string): SpecVersionNumber {
  const since: PropertySince = FIELD_PROPERTY_SINCE[property]
  const own = typeof since === 'number' ? since : (since[type as FieldType] ?? fieldTypeSince(type))
  return Math.max(own, fieldTypeSince(type)) as SpecVersionNumber
}
