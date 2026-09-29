import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js'
import documentValidatorFn from './generated/document-validator.js'
import { modelDataPaths } from './paths.js'
import { collectFieldPaths, isMessageRef, modelPathsForLayout } from './presentation.js'
import { ROW_ID, SPEC_1_FIELD_TYPES,
  SPEC_2_FIELD_TYPES,
  SPEC_2_WIDGETS,
  SPEC_2_RULE_KINDS,
  LIST_VALUED_FIELD_TYPES, SPEC_1_LAYOUT_KINDS,
  layoutChildren,
} from './types.js'
import type { FieldDef, FormSchema, LayoutNode, Text } from './types.js'

/** One reason a document is not a valid formancy form. */
export interface SchemaError {
  /** JSON Pointer to the offending value, e.g. `/model/fields/1/key`. */
  path: string
  /** What the form author has to change, in their words rather than the validator's. */
  message: string
}

export type ValidationResult =
  | { valid: true; schema: FormSchema }
  | { valid: false; errors: SchemaError[] }

/**
 * Check that an unknown value is a formancy form document.
 *
 * Lives behind its own subpath export because it pulls in ajv: the renderers
 * import this package for types and `canonicalize` only, and must not pay for
 * a validator they never call.
 */
export function validateSchema(document: unknown): ValidationResult {
  const validate = documentValidator()

  if (!validate(document)) {
    return { valid: false, errors: toSchemaErrors(validate.errors ?? [], document) }
  }

  // Only now: every rule below reads one field against another, which is only
  // meaningful once each field is known to have the right shape.
  const errors = semanticErrors(document)
  if (errors.length > 0) return { valid: false, errors }

  return { valid: true, schema: document }
}

/** The rules JSON Schema cannot state, because they are about the relationship
 *  between fields rather than the shape of any one of them. */
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
function versionErrors(
  schema: FormSchema,
  fields: ReadonlyArray<{ field: FieldDef; path: string }>,
): SchemaError[] {
  const declared = Number(schema.specVersion)
  if (!Number.isFinite(declared)) return []

  const errors: SchemaError[] = []
  const spec1Types = new Set<string>(SPEC_1_FIELD_TYPES)
  const spec2Types = new Set<string>(SPEC_2_FIELD_TYPES)
  const spec2Widgets = new Set<string>(SPEC_2_WIDGETS)
  const spec2RuleKinds = new Set<string>(SPEC_2_RULE_KINDS)
  const spec1Kinds = new Set<string>(SPEC_1_LAYOUT_KINDS)

  /** The version a field type first appeared in. */
  const introducedIn = (type: string): number =>
    spec1Types.has(type) ? 1 : spec2Types.has(type) ? 2 : 3

  /** One sentence, so every one of these reads the same way. */
  const needs = (what: string, version: number): string =>
    `${what} needs specVersion "${String(version)}". This document says "${schema.specVersion}". ` +
    `Change it to "${String(version)}" — everything already in the document keeps working, ` +
    `because a later version only adds.`

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
      const arrived = spec2Widgets.has(field.widget) ? 2 : 3
      if (arrived > declared) {
        errors.push({
          path: `${path}/widget`,
          message: needs(`A "${field.widget}" widget`, arrived),
        })
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
        errors.push({ path: `${path}/${bound}`, message: needs(`A "${bound}" bound`, 2) })
      }
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
        errors.push({ path: `${path}/optionsSource`, message: needs('An "optionsSource"', arrived) })
      }
    }

    const arrived = introducedIn(field.type)
    if (arrived <= declared) continue
    errors.push({ path: `${path}/type`, message: needs(`A "${field.type}" field`, arrived) })
  }

  // A rule KIND has a version too, and for the sharpest reason of the three: a
  // reader given a kind it has never heard of has no safe answer at all. Ignoring
  // the rule renders a form that behaves differently from the one the author
  // built — a field that should have been checked, unchecked — and guessing is
  // worse than ignoring.
  for (const [index, rule] of (schema.logic?.rules ?? []).entries()) {
    if (!spec2RuleKinds.has(rule.kind) && declared < 3) {
      errors.push({
        path: `/logic/rules/${String(index)}/kind`,
        message: needs(`A "${rule.kind}" rule`, 3),
      })
    }
  }

  for (const [layoutIndex, layout] of (schema.layouts ?? []).entries()) {
    const walk = (nodes: readonly LayoutNode[], base: string): void => {
      for (const [index, node] of nodes.entries()) {
        const at = `${base}/${String(index)}`
        if (!spec1Kinds.has(node.kind) && declared < 2) {
          errors.push({ path: `${at}/kind`, message: needs(`A "${node.kind}" layout node`, 2) })
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

function semanticErrors(schema: FormSchema): SchemaError[] {
  const fields = [...walkFields(schema.model.fields, '/model/fields')]
  const liveKeys = new Set(fields.map(({ field }) => field.key))
  const errors: SchemaError[] = [...versionErrors(schema, fields)]
  const claimed = new Set<string>()
  const claimedRenames = new Set<string>()

  // A page is a wizard step, which only exists at the top level of a form.
  // Nested inside a group or a repeater it would be a step inside a data
  // container — the engine would count it as a page while its fields are
  // scoped by the container, which is a shape nothing can render coherently.
  for (const topLevel of schema.model.fields) {
    forbidNestedPages(topLevel, `/model/fields/${String(schema.model.fields.indexOf(topLevel))}`, errors)
  }

  for (const { field, path, insideRepeater } of fields) {
    // v0.1 rejects this rather than half-supporting it: the engine has no
    // answer for what a row index means two repeaters deep, and accepting the
    // document now would mean migrating whatever people built with it later.
    if (field.type === 'repeater' && insideRepeater) {
      errors.push({
        path: `${path}/type`,
        // Named no version since the spec reached 2: which version forbids it is not
        // what the author needs, and a number in a message goes stale silently.
        message: `A repeater cannot sit inside another repeater. Move it out of the outer repeater, or make it a group.`,
      })
    }

    /*
     * A grid's row is FLAT, and this is where that is enforced.
     *
     * Measured in both renderers: a cell is built from the LEAVES under a row, so a
     * child holding fields of its own is flattened. The group's own name never reaches
     * the page, and its controls land in one cell under one heading that names the
     * group and none of them -- with no labels of their own, because a theme clips a
     * cell's label on the grounds that the heading says it. Rendering the group
     * properly instead puts a `fieldset` in the cell whose `legend` the heading then
     * repeats.
     *
     * Neither is worth publishing, and what an author wants is a column per answer,
     * which the format already has. Refused while version 2 is unreleased, where
     * refusing costs nobody anything -- 0078.
     *
     * Conditioned on what the child HOLDS rather than on the type it is: `group` is the
     * only type this has to catch today, because a repeater child is already refused as
     * a nested repeater and a page child as a page inside a repeater. A future type
     * holding fields would arrive caught by none of the three.
     */
    if (field.widget === 'datagrid') {
      for (const [index, child] of (field.fields ?? []).entries()) {
        if (child.fields === undefined) continue
        errors.push({
          path: `${path}/fields/${String(index)}`,
          message: `A grid's rows are flat, and "${child.key}" holds fields of its own. Give each of those fields a column of its own, or take the grid off this repeater and its rows will be stacked.`,
        })
      }
    }

    // A column pointing at a field the grid does not have shows an empty column,
    // which reads as a field that collects nothing rather than as a configuration
    // mistake -- and the likeliest way to get there is renaming or deleting a child
    // field and leaving the arrangement behind. Two columns over one field is worse:
    // whatever is typed in one appears in the other.
    //
    // Here rather than in the schema because neither rule is expressible there: both
    // compare a column against its siblings.
    if (field.columns !== undefined) {
      const childKeys = new Set((field.fields ?? []).map((child) => child.key))
      const seen = new Set<string>()
      for (const [index, column] of field.columns.entries()) {
        const at = `${path}/columns/${String(index)}/field`
        if (!childKeys.has(column.field)) {
          errors.push({
            path: at,
            message: `No field of this grid has the key "${column.field}", so the column would show nothing. Name one of its own fields.`,
          })
          continue
        }
        if (seen.has(column.field)) {
          errors.push({
            path: at,
            message: `Two columns both show "${column.field}". One answer cannot fill two columns.`,
          })
        }
        seen.add(column.field)
      }
    }

    // A range no answer can satisfy is a published field nobody can fill in. Safe as
    // a plain string comparison precisely because the shapes are fixed-width and
    // zero-padded: that is the property TEMPORAL_SHAPES exists to guarantee, and it
    // is why this rule can be three lines rather than a date parser.
    if (
      field.earliest !== undefined &&
      field.latest !== undefined &&
      field.earliest > field.latest
    ) {
      errors.push({
        path: `${path}/earliest`,
        message: `The earliest allowed value "${field.earliest}" is after the latest allowed "${field.latest}", so no answer could be accepted. Swap them, or remove one.`,
      })
    }

    if (claimed.has(field.key)) {
      errors.push({
        path: `${path}/key`,
        message: `Another field already uses the key "${field.key}". A key identifies one answer, so two fields cannot share one.`,
      })
    }
    claimed.add(field.key)

    const previousKey = field.renamedFrom
    if (previousKey === field.key) {
      errors.push({
        path: `${path}/renamedFrom`,
        message: `This field says it was renamed from itself. Drop "renamedFrom", or set it to the key this field used to have.`,
      })
    } else if (previousKey !== undefined && liveKeys.has(previousKey)) {
      errors.push({
        path: `${path}/renamedFrom`,
        message: `The key "${previousKey}" is still in use by a field in this form, so this is a copy rather than a rename. Two fields cannot claim the same answers.`,
      })
    } else if (previousKey !== undefined && claimedRenames.has(previousKey)) {
      // A migration driven off two claims would copy one column's answers
      // into two fields — silently, and reported as compatible.
      errors.push({
        path: `${path}/renamedFrom`,
        message: `Another field already says it was renamed from "${previousKey}". Old answers can only move to one place.`,
      })
    }
    if (previousKey !== undefined) claimedRenames.add(previousKey)

    // A broken pattern must fail the AUTHOR, not the person filling the form
    // in — new RegExp at answer time would throw mid-keystroke.
    if (field.pattern !== undefined) {
      try {
        new RegExp(field.pattern, 'u')
      } catch (cause) {
        errors.push({
          path: `${path}/pattern`,
          message: `This is not a valid regular expression: ${cause instanceof Error ? cause.message : String(cause)}.`,
        })
      }
    }
  }

  errors.push(...logicErrors(schema))
  errors.push(...presentationErrors(schema))
  errors.push(...reservedKeyErrors(schema))

  return errors
}

/** Rules about the logic section: each rule must aim at a real field, and a
 *  field can carry at most one rule per kind (validate excepted: each validate
 *  rule is its own independent check). Two visibility rules on one field would
 *  have no defined winner, and silently picking one is worse than refusing. */
function logicErrors(schema: FormSchema): SchemaError[] {
  const rules = schema.logic?.rules
  if (rules === undefined) return []

  const knownPaths = new Set(modelDataPaths(schema.model))
  // The keys of the pages, which are the only legal target of a `skip`. A page is
  // transparent for data and has no data path at all — measured before this
  // existed, a rule aimed at one was refused with "No field has the data path".
  const pageKeys = new Set(
    schema.model.fields.filter((field) => field.type === 'page').map((field) => field.key),
  )
  const claimedKinds = new Set<string>()
  const errors: SchemaError[] = []

  for (const [index, rule] of rules.entries()) {
    if (rule.kind === 'skip') {
      // A page, by key. Saying which it is not matters: a skip rule aimed at a
      // text field is an author who believes they wrote a conditional page and
      // wrote a rule that can never do anything.
      if (!pageKeys.has(rule.target)) {
        errors.push({
          path: `/logic/rules/${String(index)}/target`,
          message: pageKeys.size === 0
            ? `A skip rule walks past a page, and this form has no pages. Give it a "page" field first, or remove the rule.`
            : `"${rule.target}" is not a page. A skip rule names the key of a page — ${[...pageKeys].map((key) => `"${key}"`).join(', ')} — rather than a data path, because a page carries no answer of its own.`,
        })
      }
    } else if (!knownPaths.has(rule.target)) {
      errors.push({
        path: `/logic/rules/${String(index)}/target`,
        message: `No field has the data path "${rule.target}". A rule can only apply to a field the model defines.`,
      })
    }

    // A VALIDATION rule may choose where it runs, and there are two kinds of
    // those now. The restriction is about metadata: visibility or requiredness
    // differing between browser and server would stop the server's replay being
    // a check and make it a second opinion.
    if (rule.kind !== 'validate' && rule.kind !== 'check') {
      if (rule.runsOn !== undefined) {
        errors.push({
          path: `/logic/rules/${String(index)}/runsOn`,
          message: `Only a validate or check rule can choose where it runs. A ${rule.kind} rule that behaved differently in the browser and on the server would leave the server unable to check what the browser did.`,
        })
      }

      const claim = `${rule.kind}:${rule.target}`
      if (claimedKinds.has(claim)) {
        errors.push({
          path: `/logic/rules/${String(index)}`,
          message: `"${rule.target}" already has a ${rule.kind} rule. A field can carry one rule per kind, because two would have no defined winner.`,
        })
      }
      claimedKinds.add(claim)
    }
  }

  return errors
}



/**
 * The presentation sections: every message reference must resolve, and every
 * layout must place real fields, once each.
 *
 * A reference that resolves nowhere would put a message id in front of a
 * person, which is the failure these sections exist to prevent — so it is an
 * error when the form is saved rather than a surprise when it is filled in.
 */
function presentationErrors(schema: FormSchema): SchemaError[] {
  const errors: SchemaError[] = []
  const i18n = schema.i18n

  if (i18n !== undefined && i18n.messages[i18n.defaultLocale] === undefined) {
    errors.push({
      path: '/i18n/defaultLocale',
      message: `There is no "${i18n.defaultLocale}" catalogue, so the language everything falls back to has no words in it.`,
    })
  }

  const known = new Set(Object.keys(i18n?.messages[i18n.defaultLocale] ?? {}))
  const checkText = (text: Text | undefined, path: string): void => {
    if (!isMessageRef(text)) return
    if (i18n === undefined) {
      errors.push({
        path,
        message: `"${text.$t}" refers to a translation, but this form has no i18n section.`,
      })
      return
    }
    if (!known.has(text.$t)) {
      errors.push({
        path,
        message: `No message called "${text.$t}" in the "${i18n.defaultLocale}" catalogue.`,
      })
    }
  }

  const walkFieldText = (fields: readonly FieldDef[], base: string): void => {
    for (const [index, field] of fields.entries()) {
      const path = `${base}/${String(index)}`
      checkText(field.label, `${path}/label`)
      for (const [optionIndex, option] of (field.options ?? []).entries()) {
        checkText(option.label, `${path}/options/${String(optionIndex)}/label`)
      }
      walkFieldText(field.fields ?? [], `${path}/fields`)
    }
  }
  walkFieldText(schema.model.fields, '/model/fields')

  const layouts = schema.layouts
  if (layouts === undefined) return errors

  const placeable = new Set(modelPathsForLayout(schema.model.fields, ''))
  const namesSeen = new Set<string>()

  for (const [index, layout] of layouts.entries()) {
    const at = `/layouts/${String(index)}`
    if (namesSeen.has(layout.name)) {
      errors.push({
        path: `${at}/name`,
        message: `Another layout is already called "${layout.name}". A layout is asked for by name, so two cannot share one.`,
      })
    }
    namesSeen.add(layout.name)

    // A field has one place in a given arrangement; twice would render it
    // twice, bound to the same answer, which no form means.
    const placed = new Set<string>()
    const duplicates = new Set<string>()
    const walkNodes = (
      nodes: readonly LayoutNode[],
      nodeBase: string,
      parent?: LayoutNode,
    ): void => {
      for (const [nodeIndex, node] of nodes.entries()) {
        const nodePath = `${nodeBase}/${String(nodeIndex)}`

        // `span` is about a node's PLACE and not about its kind, so it is checked here
        // rather than inside any of the branches below -- a table nested in a table may
        // span, and so may a field, a section or a code.
        //
        // Refused outside a table rather than ignored. A property that validated and did
        // nothing is what this format has shipped once already, and the author who wrote
        // it believes the arrangement they described is the one they will get.
        if (node.span !== undefined) {
          if (parent?.kind !== 'table') {
            errors.push({
              path: `${nodePath}/span`,
              message: `"span" says how many of a table's columns to take, and this node is not in a table. Put it in a table node, or remove the span.`,
            })
          } else if (typeof node.span === 'number' && node.span > parent.columns) {
            // Refused rather than clamped: an author who writes 4 in a two-column table
            // believes they configured something, and silently narrowing it is the
            // failure this rule exists to make loud.
            errors.push({
              path: `${nodePath}/span`,
              message: `This spans ${String(node.span)} columns in a table that has ${String(parent.columns)}. Use "all" for the full width, so it stays right if the column count changes.`,
            })
          }
        }
        if (node.kind === 'qrcode') {
          // A code needs its path to exist, exactly as a placement does: a node
          // encoding nothing draws an empty box, which reads as a broken form rather
          // than a typo in the arrangement.
          //
          // It does NOT take part in the duplicate rule, and that is the difference
          // between the two. A field has one place in an arrangement because it is one
          // control; a code is a second VIEW of an answer that is placed elsewhere, so
          // a form showing a booking reference as a field and again as a code is doing
          // what it meant to.
          if (!placeable.has(node.path)) {
            errors.push({
              path: `${nodePath}/path`,
              message: `No field has the data path "${node.path}", so this code would encode nothing.`,
            })
          }
          // A code says what it IS, or it says nothing anybody can use. The picture is
          // decoration a screen reader cannot read, and the value beneath it sits in an
          // `<output>` -- a live region, announced whenever the answer changes. Without
          // a label that announcement is a bare booking reference from nowhere.
          //
          // Here rather than as `required` in the schema: the layout node union reports
          // a failed branch as "is not one of the allowed values", which tells an author
          // nothing about which property is missing. The same reason the column rules
          // live here, and the same cost -- a third-party validator reading the raw
          // JSON Schema will not catch it.
          if (node.label === undefined) {
            errors.push({
              path: `${nodePath}/label`,
              message: `This code needs a label saying what it is. The picture cannot be read aloud and the value under it is a bare string, so the label is the only thing a screen reader has to go on.`,
            })
          }
        } else if (node.kind === 'field') {
          if (!placeable.has(node.path)) {
            errors.push({
              path: `${nodePath}/path`,
              message: `No field has the data path "${node.path}", so this layout places nothing here.`,
            })
          } else if (placed.has(node.path)) {
            duplicates.add(node.path)
            errors.push({
              path: `${nodePath}/path`,
              message: `"${node.path}" is already placed in the "${layout.name}" layout. A field has one place in an arrangement.`,
            })
          }
          placed.add(node.path)
        } else {
          if (node.kind !== 'tabs') checkText(node.label, `${nodePath}/label`)

          if (node.kind === 'tabs') {
            // Every child is one tab, and a tab with no name is a tab nobody
            // can choose — not a styling problem but an unusable control.
            // A section is the node that has a name, so a tabs node holds
            // sections and nothing else.
            for (const [childIndex, child] of node.children.entries()) {
              const childPath = `${nodePath}/children/${String(childIndex)}`
              if (child.kind !== 'section') {
                errors.push({
                  path: childPath,
                  message: `A tabs node holds sections, one per tab, and this one holds a "${child.kind}". Wrap it in a section and give the section a label — that label is the tab's name.`,
                })
              } else if (child.label === undefined) {
                errors.push({
                  path: `${childPath}/label`,
                  message: `This tab has no name, so nobody can tell what is behind it. Give the section a label.`,
                })
              }
            }
            if (node.children.length === 0) {
              errors.push({
                path: `${nodePath}/children`,
                message: `A tabs node with no tabs shows nothing at all.`,
              })
            }
          }

          if (node.kind === 'table' && !Number.isInteger(node.columns)) {
            errors.push({
              path: `${nodePath}/columns`,
              message: `A table's column count has to be a whole number.`,
            })
          }

          walkNodes(layoutChildren(node), `${nodePath}/children`, node)
        }
      }
    }
    walkNodes(layout.nodes, `${at}/nodes`)
    void duplicates
    void collectFieldPaths
  }

  return errors
}

/**
 * `_id` belongs to the engine: it is how a repeater row keeps an identity that
 * its position cannot give it. A field claiming the same key would collide with
 * it inside every row, so the collision is refused here rather than discovered
 * when two things disagree about what `items[0]._id` means.
 */
function reservedKeyErrors(schema: FormSchema): SchemaError[] {
  const errors: SchemaError[] = []

  const walk = (fields: readonly FieldDef[], base: string): void => {
    for (const [index, field] of fields.entries()) {
      const path = `${base}/${String(index)}`
      if (field.key === ROW_ID) {
        errors.push({
          path: `${path}/key`,
          message: `"${ROW_ID}" is reserved: it is how a repeater row carries its identity, so no field can be called that.`,
        })
      }
      walk(field.fields ?? [], `${path}/fields`)
    }
  }
  walk(schema.model.fields, '/model/fields')

  return errors
}

/** Every page below the top level is an error, wherever it hides. */
function forbidNestedPages(field: FieldDef, path: string, errors: SchemaError[]): void {
  const children = field.fields
  if (children === undefined) return
  for (const [index, child] of children.entries()) {
    const childPath = `${path}/fields/${String(index)}`
    if (child.type === 'page') {
      errors.push({
        path: `${childPath}/type`,
        message: `A page can only sit at the top level of a form. Move it out of "${field.key}", or make it a group.`,
      })
    }
    forbidNestedPages(child, childPath, errors)
  }
}

/** Every field in the document, container children included, with the JSON
 *  Pointer that names it. */
function* walkFields(
  fields: readonly FieldDef[],
  base: string,
  insideRepeater = false,
): Generator<{ field: FieldDef; path: string; insideRepeater: boolean }> {
  for (const [index, field] of fields.entries()) {
    const path = `${base}/${String(index)}`
    yield { field, path, insideRepeater }
    if (field.fields !== undefined) {
      yield* walkFields(field.fields, `${path}/fields`, insideRepeater || field.type === 'repeater')
    }
  }
}

/** Precompiled at authoring time by scripts/generate-validator.mjs (with
 *  allErrors, because a form author fixing one problem at a time through a
 *  builder that only ever shows them the first is a miserable afternoon).
 *  Precompiled rather than ajv.compile() here, because runtime compilation
 *  reaches runtime code generation — which throws under the strict no-unsafe-eval CSP
 *  the product documents, in the browser-embedded builder. */
function documentValidator(): ValidateFunction<FormSchema> {
  return documentValidatorFn
}

function toSchemaErrors(errors: ErrorObject[], document: unknown): SchemaError[] {
  /** `oneOf` reports its own failure plus one failure per branch. The branches
   *  are noise — "must be equal to constant" twelve times over — so they are
   *  folded back into the single `oneOf` error that lists what was allowed. */
  const branchPrefixes = errors
    .filter((error) => error.keyword === 'oneOf')
    .map((error) => `${error.schemaPath}/`)

  /** Instance paths some other keyword already has an opinion about. A property
   *  that failed on its own terms is not also an unexpected property: a group
   *  whose `fields` is a string has one problem, not two. */
  const judged = new Set(
    errors.filter((error) => !NAMES_A_PROPERTY.has(error.keyword)).map((error) => error.instancePath),
  )

  const reported = errors.filter((error) => {
    // `must match "then" schema` only restates whichever branch error follows it.
    if (error.keyword === 'if') return false
    if (NAMES_A_PROPERTY.has(error.keyword) && judged.has(pathOf(error))) return false
    return !branchPrefixes.some((prefix) => error.schemaPath.startsWith(prefix))
  })

  const seen = new Set<string>()
  const schemaErrors: SchemaError[] = []

  for (const error of reported) {
    const schemaError = {
      path: pathOf(error),
      message: messageFor(error, errors, document),
    }
    const fingerprint = `${schemaError.path}\u0000${schemaError.message}`
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    schemaErrors.push(schemaError)
  }

  return schemaErrors
}

/** Keywords that report against the parent object but are really about one
 *  named property of it. */
const NAMES_A_PROPERTY = new Set(['additionalProperties', 'unevaluatedProperties'])

/** Point at the value the author has to edit, not at the object holding it:
 *  a missing or unexpected property belongs to the property, not its parent. */
function pathOf(error: ErrorObject): string {
  const named =
    stringParam(error, 'missingProperty') ??
    stringParam(error, 'additionalProperty') ??
    stringParam(error, 'unevaluatedProperty')

  return named === undefined ? error.instancePath : `${error.instancePath}/${escapeToken(named)}`
}

function messageFor(error: ErrorObject, allErrors: ErrorObject[], document: unknown): string {
  switch (error.keyword) {
    case 'false schema':
      // ajv says "Boolean schema is false", which tells an author nothing. The one
      // forbidden property in this schema is `options` on a field that also names an
      // `optionsSource`: two answers to "what may be chosen", with no rule for which
      // wins. Expressed that way rather than as a `not` around the pair, because a
      // `not` inside the branch that DECLARES `optionsSource` makes the branch fail as
      // a whole -- and `unevaluatedProperties` then reports the property as unknown,
      // telling the author to check the spelling of a word they spelled correctly.
      return error.instancePath.endsWith('/options')
        ? 'This field both lists its options and names a source for them, and there is no rule for which wins. Keep the list, or keep the source and remove the list.'
        : 'This is not allowed here.'

    case 'type': {
      const type = stringParam(error, 'type') ?? 'something else'
      return `Must be ${READABLE_TYPES[type] ?? type}.`
    }

    case 'required':
      return `Missing required property "${stringParam(error, 'missingProperty') ?? ''}".`

    case 'additionalProperties':
    case 'unevaluatedProperties': {
      const property =
        stringParam(error, 'additionalProperty') ?? stringParam(error, 'unevaluatedProperty') ?? ''
      // `fields` is the one property the spec allows on some field types and not
      // others, so the generic "unknown property" wording would misdirect.
      if (property === 'fields') {
        return 'Only group, page and repeater fields can hold child fields.'
      }
      return `Unknown property "${property}". Check the spelling, or remove it.`
    }

    case 'const':
      return `Must be ${JSON.stringify(error.params['allowedValue'])}.`

    case 'enum':
      return notOneOf(document, error.instancePath, listParam(error, 'allowedValues'))

    case 'oneOf':
      return notOneOf(document, error.instancePath, allowedConstants(error, allErrors))

    case 'pattern':
      return patternMessage(error, document)

    case 'maxLength':
      return `Must be ${String(error.params['limit'])} characters or fewer.`

    case 'minLength':
      return error.params['limit'] === 1
        ? 'Must not be empty.'
        : `Must be at least ${String(error.params['limit'])} characters.`

    default:
      return asSentence(error.message ?? 'Invalid.')
  }
}

function notOneOf(document: unknown, instancePath: string, allowed: readonly unknown[]): string {
  const found = JSON.stringify(resolvePointer(document, instancePath))
  const values = allowed.map((value) => String(value)).join(', ')
  return `${found} is not one of the allowed values: ${values}.`
}

/** The `const` of each `oneOf` branch, which is how the field type enum is
 *  written so that Monaco can show a description per value. */
function allowedConstants(error: ErrorObject, allErrors: ErrorObject[]): unknown[] {
  const prefix = `${error.schemaPath}/`
  // schemaPath alone is identical for every offending field in the document,
  // so filter by instancePath too — otherwise each message lists the allowed
  // values once per broken field.
  const values = allErrors
    .filter(
      (candidate) =>
        candidate.keyword === 'const' &&
        candidate.schemaPath.startsWith(prefix) &&
        candidate.instancePath === error.instancePath,
    )
    .map((candidate) => candidate.params['allowedValue'])
  return [...new Set(values)]
}

function patternMessage(error: ErrorObject, document: unknown): string {
  const found = JSON.stringify(resolvePointer(document, error.instancePath))

  // Keyed on which definition rejected it rather than on the instance path, so
  // renaming a property in the schema cannot silently degrade the wording.
  if (error.schemaPath.includes('/fieldKey/')) {
    return `${found} is not a usable field key. Start with a letter or an underscore, then use only letters, digits and underscores.`
  }
  if (error.schemaPath.includes('/formId/')) {
    return `${found} is not a usable form ID. Start with a letter or a digit, then use only letters, digits, dots, dashes and underscores.`
  }
  // A check names a validator the deployment answers, and the mistake somebody
  // makes is writing the address of one. The generic wording would tell them the
  // pattern and leave them guessing what shape is wanted.
  if (error.instancePath.endsWith('/check')) {
    return `${found} is not a usable check name. Name the check and let the deployment say where to ask — an address here would be a deployment detail frozen into a published form, and a way to make a server inside a private network fetch something.`
  }
  return `${found} does not match the required pattern ${String(error.params['pattern'])}.`
}

const READABLE_TYPES: Record<string, string> = {
  object: 'an object',
  array: 'a list',
  string: 'text',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'true or false',
  null: 'null',
}

function stringParam(error: ErrorObject, name: string): string | undefined {
  const value = error.params[name]
  return typeof value === 'string' ? value : undefined
}

function listParam(error: ErrorObject, name: string): unknown[] {
  const value = error.params[name]
  return Array.isArray(value) ? value : []
}

/** ajv's own wording, for the keywords with no hand-written message: it is
 *  terse but accurate, and reads better as a sentence. */
function asSentence(text: string): string {
  if (text.length === 0) return 'Invalid.'
  const capitalized = `${text[0]!.toUpperCase()}${text.slice(1)}`
  return capitalized.endsWith('.') ? capitalized : `${capitalized}.`
}

/** RFC 6901: `~` and `/` are the only characters a pointer token must escape. */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

/** Look up the value a JSON Pointer names, so an error can quote what it found. */
function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document

  let current = document
  for (const token of pointer.slice(1).split('/')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[unescapeToken(token)]
  }
  return current
}
