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
import { LIST_VALUED_FIELD_TYPES, SPEC_1_FIELD_TYPES, SPEC_2_FIELD_TYPES, SPEC_2_RULE_KINDS, SPEC_2_WIDGETS, SPEC_3_WIDGETS } from './types.js'
import { layoutChildren, SPEC_1_LAYOUT_KINDS } from './layout.js'
import type { FieldDef, FormSchema } from './types.js'
import type { LayoutNode } from './layout.js'
import { schemaError } from './schema-errors.js'
import type { SchemaError } from './schema-errors.js'

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
 * Written per construct rather than per version. It used to open with
 * `if (specVersion !== '1') return []`, which was right while there were two
 * versions and silently wrong the moment there was a third: a `richtext` in a
 * version 1 document would have been waved through by a function that had stopped
 * looking. Each construct now names the version that introduced it, and the
 * comparison is against the document's own.
 */
export function versionErrors(
  schema: FormSchema,
  fields: ReadonlyArray<{ field: FieldDef; path: string }>,
): SchemaError[] {
  const declared = Number(schema.specVersion)
  if (!Number.isFinite(declared)) return []

  const errors: SchemaError[] = []
  const spec1Types = new Set<string>(SPEC_1_FIELD_TYPES)
  const spec2Types = new Set<string>(SPEC_2_FIELD_TYPES)
  const spec2Widgets = new Set<string>(SPEC_2_WIDGETS)
  const spec3Widgets = new Set<string>(SPEC_3_WIDGETS)
  const spec2RuleKinds = new Set<string>(SPEC_2_RULE_KINDS)
  const spec1Kinds = new Set<string>(SPEC_1_LAYOUT_KINDS)

  /** The version a field type first appeared in. */
  const introducedIn = (type: string): number =>
    spec1Types.has(type) ? 1 : spec2Types.has(type) ? 2 : 3

  /** The version a thing needs and the version this document says, for every sentence. */
  const versions = (version: number): { version: string; declared: string } => ({
    version: String(version),
    declared: schema.specVersion,
  })

  for (const { field, path } of fields) {
    // A PROPERTY, not only a type. This function gated field types and layout
    // kinds and nothing else, which was enough while every version 2 construct
    // was one of those two. `widget` is neither, and it cannot be waved through:
    // the document schema is closed, so a version 1 reader answers `Unknown
    // property "widget"` and refuses the whole document rather than ignoring the
    // hint and rendering the default control. A version 1 document carrying one
    // is therefore not a version 1 document, and saying so here is the only place
    // the author finds out — they cannot see the reader that would refuse it.
    if (field.widget !== undefined) {
      // WHICH widget, not whether there is one. `widget` arrived in version 2, so
      // the presence test answers yes for every widget there will ever be — and a
      // version 2 reader given a version 3 widget renders the default control,
      // collects the same answers and looks entirely correct, which is exactly the
      // silent failure the version line exists to prevent.
      /*
       * Per version, which this line now has to be. It read
       * `spec2Widgets.has(widget) ? 2 : 3` and answered **3** for every widget
       * there would ever be — exactly the shape the comment above warns about,
       * one version later. A version 3 document carrying a version 4 widget
       * would have been told it needs version 3, which it already declares: an
       * error that contradicts itself and sends the author nowhere.
       */
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

    // `earliest`/`latest` land on `date` too, which IS a version 1 type -- and that
    // is not a contradiction. The freeze promises a version 1 DOCUMENT keeps
    // validating, and an optional property only a version 2 document may carry takes
    // nothing from any version 1 document. It is not additive *within* version 1,
    // because the schema is closed: a version 1 reader answers `Unknown property
    // "earliest"` and refuses everything.
    for (const bound of ['earliest', 'latest'] as const) {
      if (field[bound] !== undefined && declared < 2) {
        errors.push(schemaError(`${path}/${bound}`, 'version.bound', { bound, ...versions(2) }))
      }
    }

    // A property, like `widget` and the temporal bounds. `step` landed on
    // `number`, which is a version 1 type -- and the freeze is unharmed for the
    // reason the bounds give above: an optional property only a version 4
    // document may carry takes nothing from any older document.
    if (field.step !== undefined && declared < 4) {
      errors.push(schemaError(`${path}/step`, 'version.step', versions(4)))
    }
    // The same, for the same reason: a property only a version 4 document may carry.
    if (field.mask !== undefined && declared < 4) {
      errors.push(schemaError(`${path}/mask`, 'version.mask', versions(4)))
    }

    // Same reasoning as `widget` above: a property, not a type, and the schema is
    // closed, so a version 1 reader answers `Unknown property "optionsSource"` and
    // refuses the whole document rather than rendering a select with no options --
    // which would be the same field quietly collecting nothing.
    if (field.optionsSource !== undefined) {
      // On a `select` since version 2; on a list-valued field since version 3,
      // which is the tag picker's case. Widening a property to a new TYPE is a
      // version in the same way adding the property was: a version 2 reader
      // refuses the combination, so a document using it is not a version 2
      // document however version 2 the property looks on its own.
      const arrived = LIST_VALUED_FIELD_TYPES.includes(field.type as never) ? 3 : 2
      if (arrived > declared) {
        errors.push(
          schemaError(`${path}/optionsSource`, 'version.optionsSource', versions(arrived)),
        )
      }
    }

    const arrived = introducedIn(field.type)
    if (arrived <= declared) continue
    errors.push(
      schemaError(`${path}/type`, 'version.fieldType', { type: field.type, ...versions(arrived) }),
    )
  }

  // A rule KIND has a version too, and for the sharpest reason of the three: a
  // reader given a kind it has never heard of has no safe answer at all. Ignoring
  // the rule renders a form that behaves differently from the one the author
  // built — a field that should have been checked, unchecked — and guessing is
  // worse than ignoring.
  for (const [index, rule] of (schema.logic?.rules ?? []).entries()) {
    if (!spec2RuleKinds.has(rule.kind) && declared < 3) {
      errors.push(
        schemaError(`/logic/rules/${String(index)}/kind`, 'version.ruleKind', {
          kind: rule.kind,
          ...versions(3),
        }),
      )
    }
  }

  for (const [layoutIndex, layout] of (schema.layouts ?? []).entries()) {
    const walk = (nodes: readonly LayoutNode[], base: string): void => {
      for (const [index, node] of nodes.entries()) {
        const at = `${base}/${String(index)}`
        if (!spec1Kinds.has(node.kind) && declared < 2) {
          errors.push(
            schemaError(`${at}/kind`, 'version.layoutKind', { kind: node.kind, ...versions(2) }),
          )
        }
        // `layoutChildren` rather than a kind test: `qrcode` is childless and is not a
        // field, so `kind !== 'field'` walked straight into `undefined`.
        walk(layoutChildren(node), `${at}/children`)
      }
    }
    walk(layout.nodes, `/layouts/${String(layoutIndex)}/nodes`)
  }

  return errors
}
