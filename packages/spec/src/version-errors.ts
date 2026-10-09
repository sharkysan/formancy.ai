/**
 * Constructs a document uses that its declared version does not define.
 *
 * Its own module because the version ledger is its own subject: `validate.ts`
 * answers "is this document well formed", and this answers "may a reader of the
 * version it declares understand it". The split was forced by the size budget
 * and turned out to be the seam — that file was 888 lines against a ceiling of
 * 870 when spec 4 added fourteen of them, and the budget had found a real
 * boundary rather than an inconvenience.
 *
 * `SchemaError` stays in `validate.ts`, which is where the public surface is.
 */
import { SPEC_2_WIDGETS, SPEC_3_WIDGETS } from './types.js'
import type { FieldDef, FormSchema } from './types.js'
import { layoutChildren } from './layout.js'
import type { LayoutNode } from './layout.js'
import { schemaError } from './schema-errors.js'
import type { SchemaError } from './schema-errors.js'
import {
  DOCUMENT_PROPERTY_SINCE,
  FIELD_PROPERTY_SINCE,
  LAYOUT_KIND_SINCE,
  LAYOUT_NODE_PROPERTY_SINCE,
  MATRIX_ROW_PROPERTY_SINCE,
  OPTION_PROPERTY_SINCE,
  RULE_KIND_SINCE,
  RULE_PROPERTY_SINCE,
  fieldPropertySince,
  fieldTypeSince,
} from './version-ledger.js'

type Versions = { version: string; declared: string }

/**
 * A property newer than the thing that carries it.
 *
 * Under the code a builder already translates, for the properties that were gated one by
 * one before the ledger and had a sentence of their own; under `version.property` for
 * every other. This list does not grow: a property arriving in a later version is named
 * by the general sentence.
 */
function propertyError(path: string, property: string, versions: Versions): SchemaError {
  switch (property) {
    case 'earliest':
    case 'latest':
      return schemaError(path, 'version.bound', { bound: property, ...versions })
    case 'step':
      return schemaError(path, 'version.step', versions)
    case 'mask':
      return schemaError(path, 'version.mask', versions)
    case 'optionsSource':
      return schemaError(path, 'version.optionsSource', versions)
    case 'image':
      return schemaError(path, 'version.optionImage', versions)
    default:
      return schemaError(path, 'version.property', { property, ...versions })
  }
}

/**
 * Constructs a document uses that its declared version does not define.
 *
 * Structural validation cannot do this on its own without threading the
 * version through every branch of the JSON Schema, and the message it would
 * produce — "must match exactly one schema in oneOf" — is no use to
 * anybody. So the schema accepts the union and this says, by name, which
 * construct needs which version.
 *
 * The direction that matters: a document must not use a construct from a version
 * later than the one it declares. The reverse is fine, because every version here
 * is a superset of the one before it. That is the whole compatibility story.
 *
 * **Every construct's version is read from the ledger** (`version-ledger.ts`), whose
 * tables the compiler and `version-ledger.test.ts` hold to the document format. It was
 * written construct by construct, each gate a line somebody remembered: the widget and
 * field type gates each once answered "the newest version" for anything they did not
 * list, a rule kind outside version 2's list was taken to be version 3's and a layout
 * kind outside version 1's to be version 2's, and a property was gated only if a line
 * named it — so `columns` on a repeater and `span` on a layout node, both version 2,
 * were never named: a version 1 document carrying one was refused only through the
 * widget or the table that carries it.
 *
 * A property is reported only when it is newer than what carries it: a version 3
 * `box` on a `signature` field adds nothing to the field type's own error.
 */
export function versionErrors(
  schema: FormSchema,
  fields: ReadonlyArray<{ field: FieldDef; path: string }>,
): SchemaError[] {
  const declared = Number(schema.specVersion)
  if (!Number.isFinite(declared)) return []

  const errors: SchemaError[] = []
  const spec2Widgets = new Set<string>(SPEC_2_WIDGETS)
  const spec3Widgets = new Set<string>(SPEC_3_WIDGETS)

  /** The version a thing needs and the version this document says, for every sentence. */
  const versions = (version: number): Versions => ({
    version: String(version),
    declared: schema.specVersion,
  })

  /** Every key of `object` that arrived after both its holder and the declared version. */
  const later = (
    object: object,
    since: Readonly<Record<string, number>>,
    holder: number,
    at: string,
  ): void => {
    for (const key of Object.keys(object)) {
      const version = since[key]
      if (version === undefined || version <= holder || version <= declared) continue
      errors.push(propertyError(`${at}/${key}`, key, versions(version)))
    }
  }

  later(schema, DOCUMENT_PROPERTY_SINCE, 1, '')

  for (const { field, path } of fields) {
    // WHICH widget, not whether there is one. `widget` arrived in version 2, so the
    // presence test answers yes for every widget there will ever be — and a version 2
    // reader given a version 3 widget renders the default control, collects the same
    // answers and looks entirely correct, which is exactly the silent failure the
    // version line exists to prevent. Per version: this read `spec2Widgets.has(widget)
    // ? 2 : 3` once and told a version 3 document carrying a version 4 widget that it
    // needed version 3, which it already declared.
    if (field.widget !== undefined) {
      const arrived = spec2Widgets.has(field.widget) ? 2 : spec3Widgets.has(field.widget) ? 3 : 4
      if (arrived > declared) {
        errors.push(
          schemaError(`${path}/widget`, 'version.widget', {
            widget: field.widget,
            ...versions(arrived),
          }),
        )
      }
    }

    // Every other property, by the type it sits on: `optionsSource` arrived on a `select`
    // in version 2 and on `selectboxes` — a version 2 type — only in version 3, because
    // widening a property to a type is a version just as adding it was.
    const type = fieldTypeSince(field.type)
    for (const key of Object.keys(field)) {
      if (key === 'widget' || !(key in FIELD_PROPERTY_SINCE)) continue
      const version = fieldPropertySince(key as keyof FieldDef, field.type)
      if (version <= type || version <= declared) continue
      errors.push(propertyError(`${path}/${key}`, key, versions(version)))
    }
    field.options?.forEach((option, index) =>
      later(option, OPTION_PROPERTY_SINCE, type, `${path}/options/${String(index)}`),
    )
    field.rows?.forEach((row, index) =>
      later(row, MATRIX_ROW_PROPERTY_SINCE, type, `${path}/rows/${String(index)}`),
    )

    if (type > declared) {
      errors.push(
        schemaError(`${path}/type`, 'version.fieldType', { type: field.type, ...versions(type) }),
      )
    }
  }

  // A rule KIND has a version too, and for the sharpest reason of the three: a
  // reader given a kind it has never heard of has no safe answer at all. Ignoring
  // the rule renders a form that behaves differently from the one the author
  // built — a field that should have been checked, unchecked — and guessing is
  // worse than ignoring.
  for (const [index, rule] of (schema.logic?.rules ?? []).entries()) {
    const at = `/logic/rules/${String(index)}`
    const kind: number | undefined = RULE_KIND_SINCE[rule.kind]
    // Not a kind at all, which the document schema refuses on its own.
    if (kind === undefined) continue
    if (kind > declared) {
      errors.push(schemaError(`${at}/kind`, 'version.ruleKind', { kind: rule.kind, ...versions(kind) }))
    }
    later(rule, RULE_PROPERTY_SINCE, kind, at)
  }

  for (const [layoutIndex, layout] of (schema.layouts ?? []).entries()) {
    const walk = (nodes: readonly LayoutNode[], base: string): void => {
      for (const [index, node] of nodes.entries()) {
        const at = `${base}/${String(index)}`
        const kind: number | undefined = LAYOUT_KIND_SINCE[node.kind]
        if (kind !== undefined && kind > declared) {
          errors.push(schemaError(`${at}/kind`, 'version.layoutKind', { kind: node.kind, ...versions(kind) }))
        }
        later(node, LAYOUT_NODE_PROPERTY_SINCE, kind ?? 1, at)
        // `layoutChildren` rather than a kind test: `qrcode` is childless and is not a
        // field, so `kind !== 'field'` walked straight into `undefined`.
        walk(layoutChildren(node), `${at}/children`)
      }
    }
    walk(layout.nodes, `/layouts/${String(layoutIndex)}/nodes`)
  }

  return errors
}
