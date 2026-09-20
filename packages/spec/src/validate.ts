import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js'
import documentValidatorFn from './generated/document-validator.js'
import { modelDataPaths } from './paths.js'
import { collectFieldPaths, isMessageRef, modelPathsForLayout } from './presentation.js'
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
function semanticErrors(schema: FormSchema): SchemaError[] {
  const fields = [...walkFields(schema.model.fields, '/model/fields')]
  const liveKeys = new Set(fields.map(({ field }) => field.key))
  const errors: SchemaError[] = []
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
        message: `A repeater cannot sit inside another repeater in version 0 of the spec. Move it out of the outer repeater, or make it a group.`,
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
  const claimedKinds = new Set<string>()
  const errors: SchemaError[] = []

  for (const [index, rule] of rules.entries()) {
    if (!knownPaths.has(rule.target)) {
      errors.push({
        path: `/logic/rules/${String(index)}/target`,
        message: `No field has the data path "${rule.target}". A rule can only apply to a field the model defines.`,
      })
    }

    if (rule.kind !== 'validate') {
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
    const walkNodes = (nodes: readonly LayoutNode[], nodeBase: string): void => {
      for (const [nodeIndex, node] of nodes.entries()) {
        const nodePath = `${nodeBase}/${String(nodeIndex)}`
        if (node.kind === 'field') {
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
          checkText(node.label, `${nodePath}/label`)
          walkNodes(node.children, `${nodePath}/children`)
        }
      }
    }
    walkNodes(layout.nodes, `${at}/nodes`)
    void duplicates
    void collectFieldPaths
  }

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
