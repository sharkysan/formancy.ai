import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js'
import documentValidatorFn from './generated/document-validator.js'
import { modelDataPaths } from './paths.js'
import { collectFieldPaths, isMessageRef, modelPathsForLayout } from './presentation.js'
import { ROW_ID, SPEC_1_FIELD_TYPES, SPEC_2_FIELD_TYPES, SPEC_2_WIDGETS, SPEC_3_WIDGETS, SPEC_2_RULE_KINDS, LIST_VALUED_FIELD_TYPES } from './types.js'
import { SPEC_1_LAYOUT_KINDS, layoutChildren } from './layout.js'
import type { FieldDef, FormSchema, Text } from './types.js'
import type { LayoutNode } from './layout.js'
import { versionErrors } from './version-errors.js'
import { schemaError } from './schema-errors.js'
import type { SchemaError } from './schema-errors.js'

/** One reason a document is not a valid formancy form. */
export type { SchemaError }

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
      // Named no version since the spec reached 2: which version forbids it is not
      // what the author needs, and a number in a message goes stale silently.
      errors.push(schemaError(`${path}/type`, 'repeater.nested'))
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
        errors.push(
          schemaError(`${path}/fields/${String(index)}`, 'grid.rowNotFlat', { key: child.key }),
        )
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
          errors.push(schemaError(at, 'grid.columnUnknown', { field: column.field }))
          continue
        }
        if (seen.has(column.field)) {
          errors.push(schemaError(at, 'grid.columnTwice', { field: column.field }))
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
      errors.push(
        schemaError(`${path}/earliest`, 'bounds.crossed', {
          earliest: field.earliest,
          latest: field.latest,
        }),
      )
    }

    if (claimed.has(field.key)) {
      errors.push(schemaError(`${path}/key`, 'key.taken', { key: field.key }))
    }
    claimed.add(field.key)

    const previousKey = field.renamedFrom
    if (previousKey === field.key) {
      errors.push(schemaError(`${path}/renamedFrom`, 'rename.self'))
    } else if (previousKey !== undefined && liveKeys.has(previousKey)) {
      errors.push(schemaError(`${path}/renamedFrom`, 'rename.keyInUse', { key: previousKey }))
    } else if (previousKey !== undefined && claimedRenames.has(previousKey)) {
      // A migration driven off two claims would copy one column's answers
      // into two fields — silently, and reported as compatible.
      errors.push(schemaError(`${path}/renamedFrom`, 'rename.claimed', { key: previousKey }))
    }
    if (previousKey !== undefined) claimedRenames.add(previousKey)

    // A broken pattern must fail the AUTHOR, not the person filling the form
    // in — new RegExp at answer time would throw mid-keystroke.
    if (field.pattern !== undefined) {
      try {
        new RegExp(field.pattern, 'u')
      } catch (cause) {
        errors.push(
          schemaError(`${path}/pattern`, 'pattern.invalid', {
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
        )
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
        const at = `/logic/rules/${String(index)}/target`
        errors.push(
          pageKeys.size === 0
            ? schemaError(at, 'rule.skipNoPages')
            : schemaError(at, 'rule.skipNotAPage', {
                target: rule.target,
                pages: [...pageKeys].map((key) => `"${key}"`).join(', '),
              }),
        )
      }
    } else if (!knownPaths.has(rule.target)) {
      errors.push(
        schemaError(`/logic/rules/${String(index)}/target`, 'rule.unknownTarget', {
          target: rule.target,
        }),
      )
    }

    // A VALIDATION rule may choose where it runs, and there are two kinds of
    // those now. The restriction is about metadata: visibility or requiredness
    // differing between browser and server would stop the server's replay being
    // a check and make it a second opinion.
    if (rule.kind !== 'validate' && rule.kind !== 'check') {
      if (rule.runsOn !== undefined) {
        errors.push(
          schemaError(`/logic/rules/${String(index)}/runsOn`, 'rule.runsOn', { kind: rule.kind }),
        )
      }

      const claim = `${rule.kind}:${rule.target}`
      if (claimedKinds.has(claim)) {
        errors.push(
          schemaError(`/logic/rules/${String(index)}`, 'rule.duplicate', {
            target: rule.target,
            kind: rule.kind,
          }),
        )
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
    errors.push(
      schemaError('/i18n/defaultLocale', 'i18n.noDefaultCatalogue', { locale: i18n.defaultLocale }),
    )
  }

  const known = new Set(Object.keys(i18n?.messages[i18n.defaultLocale] ?? {}))
  const checkText = (text: Text | undefined, path: string): void => {
    if (!isMessageRef(text)) return
    if (i18n === undefined) {
      errors.push(schemaError(path, 'i18n.noSection', { id: text.$t }))
      return
    }
    if (!known.has(text.$t)) {
      errors.push(
        schemaError(path, 'i18n.unknownMessage', { id: text.$t, locale: i18n.defaultLocale }),
      )
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
      errors.push(schemaError(`${at}/name`, 'layout.nameTaken', { name: layout.name }))
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
            errors.push(schemaError(`${nodePath}/span`, 'layout.spanOutsideTable'))
          } else if (typeof node.span === 'number' && node.span > parent.columns) {
            // Refused rather than clamped: an author who writes 4 in a two-column table
            // believes they configured something, and silently narrowing it is the
            // failure this rule exists to make loud.
            errors.push(
              schemaError(`${nodePath}/span`, 'layout.spanTooWide', {
                span: node.span,
                columns: parent.columns,
              }),
            )
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
            errors.push(
              schemaError(`${nodePath}/path`, 'layout.codeUnknownPath', { path: node.path }),
            )
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
            errors.push(schemaError(`${nodePath}/label`, 'layout.codeNeedsLabel'))
          }
        } else if (node.kind === 'field') {
          if (!placeable.has(node.path)) {
            errors.push(schemaError(`${nodePath}/path`, 'layout.unknownPath', { path: node.path }))
          } else if (placed.has(node.path)) {
            duplicates.add(node.path)
            errors.push(
              schemaError(`${nodePath}/path`, 'layout.placedTwice', {
                path: node.path,
                layout: layout.name,
              }),
            )
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
                errors.push(schemaError(childPath, 'layout.tabNotSection', { kind: child.kind }))
              } else if (child.label === undefined) {
                errors.push(schemaError(`${childPath}/label`, 'layout.tabUnnamed'))
              }
            }
            if (node.children.length === 0) {
              errors.push(schemaError(`${nodePath}/children`, 'layout.tabsEmpty'))
            }
          }

          if (node.kind === 'table' && !Number.isInteger(node.columns)) {
            errors.push(schemaError(`${nodePath}/columns`, 'layout.columnsWhole'))
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
        errors.push(schemaError(`${path}/key`, 'key.reserved', { key: ROW_ID }))
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
      errors.push(schemaError(`${childPath}/type`, 'page.nested', { key: field.key }))
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
    const found = errorFor(error, errors, document)
    const fingerprint = `${found.path}\u0000${found.message}`
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    schemaErrors.push(found)
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

function errorFor(error: ErrorObject, allErrors: ErrorObject[], document: unknown): SchemaError {
  const path = pathOf(error)
  switch (error.keyword) {
    case 'false schema':
      // ajv says "Boolean schema is false", which tells an author nothing. The one
      // forbidden property in this schema is `options` on a field that also names an
      // `optionsSource`: two answers to "what may be chosen", with no rule for which
      // wins. Expressed that way rather than as a `not` around the pair, because a
      // `not` inside the branch that DECLARES `optionsSource` makes the branch fail as
      // a whole -- and `unevaluatedProperties` then reports the property as unknown,
      // telling the author to check the spelling of a word they spelled correctly.
      return schemaError(
        path,
        error.instancePath.endsWith('/options') ? 'options.twoSources' : 'shape.notAllowed',
      )

    case 'type': {
      // One sentence per JSON type, so a translation is a sentence and not "Must be"
      // with an English phrase set into it.
      const type = stringParam(error, 'type') ?? 'something else'
      return type in TYPE_CODES
        ? schemaError(path, TYPE_CODES[type as keyof typeof TYPE_CODES])
        : schemaError(path, 'shape.type', { type })
    }

    case 'required':
      return schemaError(path, 'shape.required', {
        property: stringParam(error, 'missingProperty') ?? '',
      })

    case 'additionalProperties':
    case 'unevaluatedProperties': {
      const property =
        stringParam(error, 'additionalProperty') ?? stringParam(error, 'unevaluatedProperty') ?? ''
      // `fields` is the one property the spec allows on some field types and not
      // others, so the generic "unknown property" wording would misdirect.
      if (property === 'fields') return schemaError(path, 'shape.childFields')
      return schemaError(path, 'shape.unknownProperty', { property })
    }

    case 'const':
      return schemaError(path, 'shape.const', {
        value: JSON.stringify(error.params['allowedValue']),
      })

    case 'enum':
      return notOneOf(path, document, error.instancePath, listParam(error, 'allowedValues'))

    case 'oneOf':
      return notOneOf(path, document, error.instancePath, allowedConstants(error, allErrors))

    case 'pattern':
      return patternError(path, error, document)

    case 'maxLength':
      return schemaError(path, 'shape.maxLength', { limit: String(error.params['limit']) })

    case 'minLength':
      return error.params['limit'] === 1
        ? schemaError(path, 'shape.empty')
        : schemaError(path, 'shape.minLength', { limit: String(error.params['limit']) })

    default:
      return schemaError(path, 'shape.other', { detail: asSentence(error.message ?? 'Invalid.') })
  }
}

function notOneOf(
  path: string,
  document: unknown,
  instancePath: string,
  allowed: readonly unknown[],
): SchemaError {
  return schemaError(path, 'shape.notOneOf', {
    found: JSON.stringify(resolvePointer(document, instancePath)),
    allowed: allowed.map((value) => String(value)).join(', '),
  })
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

function patternError(path: string, error: ErrorObject, document: unknown): SchemaError {
  const found = JSON.stringify(resolvePointer(document, error.instancePath))

  // Keyed on which definition rejected it rather than on the instance path, so
  // renaming a property in the schema cannot silently degrade the wording.
  if (error.schemaPath.includes('/fieldKey/')) return schemaError(path, 'shape.fieldKey', { found })
  if (error.schemaPath.includes('/formId/')) return schemaError(path, 'shape.formId', { found })
  // A check names a validator the deployment answers, and the mistake somebody
  // makes is writing the address of one. The generic wording would tell them the
  // pattern and leave them guessing what shape is wanted.
  if (error.instancePath.endsWith('/check')) return schemaError(path, 'shape.checkName', { found })
  return schemaError(path, 'shape.pattern', { found, pattern: String(error.params['pattern']) })
}

/** The JSON types with a sentence of their own. */
const TYPE_CODES = {
  object: 'shape.object',
  array: 'shape.array',
  string: 'shape.string',
  number: 'shape.number',
  integer: 'shape.integer',
  boolean: 'shape.boolean',
  null: 'shape.null',
} as const

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
