import type { ErrorObject } from 'ajv/dist/2020.js'
import { schemaError } from './schema-errors.js'
import type { SchemaError } from './schema-errors.js'

/**
 * What the spec's JSON Schema refuses, in the author's words rather than ajv's.
 *
 * The structural half of `validateSchema`: ajv reports against the schema's shape —
 * "must NOT have additional properties", a `oneOf` failure once per branch — and this
 * folds those into one error per thing to fix, pointed at the property the author has
 * to edit, each with its code and values
 * ([0122](../../../docs/decisions/0122-a-validator-error-has-a-code.md)).
 *
 * Its own file because it changes for its own reason: when ajv's reports or the
 * schema's shape change, not when a rule about how fields relate does. It sat at the
 * bottom of `validate.ts` until that file reached its size ceiling with a rule still
 * to add ([0125](../../../docs/decisions/0125-a-mask-stores-what-was-typed.md)).
 */
export function toSchemaErrors(errors: ErrorObject[], document: unknown): SchemaError[] {
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
    errors
      .filter((error) => !NAMES_A_PROPERTY.has(error.keyword))
      .map((error) => error.instancePath),
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
