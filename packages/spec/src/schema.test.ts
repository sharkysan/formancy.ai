import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import schemaDocument from '../formancy.schema.json' with { type: 'json' }
import { CONTAINER_FIELD_TYPES, FIELD_TYPES } from './types.js'

describe('formancy.schema.json', () => {
  test('is itself a valid JSON Schema 2020-12 document', () => {
    const ajv = new Ajv2020({ strict: true })
    const metaSchema = ajv.getSchema('https://json-schema.org/draft/2020-12/schema')

    expect(metaSchema).toBeDefined()
    expect(metaSchema!(schemaDocument)).toBe(true)
  })

  test('has the stable $id the published spec reference is served from', () => {
    expect(schemaDocument.$id).toBe('https://formancy.dev/schema/0/formancy.schema.json')
  })

  test('lets exactly the container types the types module declares hold child fields', () => {
    const fromSchema = schemaDocument.$defs.field.allOf[0]?.if.properties.type.enum

    expect(fromSchema).toEqual([...CONTAINER_FIELD_TYPES])
  })

  test('offers exactly the field types the types module declares', () => {
    const fromSchema = schemaDocument.$defs.fieldType.oneOf.map((branch) => branch.const)

    expect(fromSchema).toEqual([...FIELD_TYPES])
  })

  // Documentation is not decoration here: the builder's property panel, Monaco's
  // hovers and the published reference are all generated from these annotations,
  // so an undocumented property ships as a blank row in the UI.
  test('documents every property with a title and a description', () => {
    const documented = documentedSubschemas(schemaDocument)
    // A walker that silently returns nothing would turn this test green-but-empty.
    expect(documented.length).toBeGreaterThan(10)
    for (const [name, definition] of documented) {
      expect(definition, `${name} has no title`).toHaveProperty('title')
      expect(definition, `${name} has no description`).toHaveProperty('description')
    }
  })
})

describe('the field key pattern', () => {
  const pattern = new RegExp(schemaDocument.$defs.fieldKey.pattern)

  // Pinned, not merely exercised: keys become export column headers and CEL
  // identifiers in logic expressions, so widening this pattern later would let
  // authors write keys that the expression parser cannot name.
  test('is the identifier grammar, pinned', () => {
    expect(schemaDocument.$defs.fieldKey.pattern).toBe('^[A-Za-z_][A-Za-z0-9_]*$')
  })

  test.each(['email', 'invoice_total', 'passengerCount', '_internal', 'a1'])('accepts %s', (key) => {
    expect(pattern.test(key)).toBe(true)
  })

  test.each([
    ['', 'empty'],
    ['1st_choice', 'leading digit'],
    ['invoice-total', 'a dash, which CEL would read as subtraction'],
    ['invoice total', 'a space'],
    ['contact.email', 'a dot, which CEL would read as field selection'],
    ['émail', 'a combining accent, which two editors would normalise differently'],
  ])('rejects %j (%s)', (key) => {
    expect(pattern.test(key)).toBe(false)
  })
})

/** Every subschema that tooling renders as a labelled row, paired with its path. */
function documentedSubschemas(document: unknown): Array<[string, unknown]> {
  const found: Array<[string, unknown]> = []

  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return
    const record = node as Record<string, unknown>

    for (const container of ['properties', '$defs'] as const) {
      const members = record[container]
      if (members === undefined) continue
      for (const [name, member] of Object.entries(members as Record<string, unknown>)) {
        // A subschema that is nothing but a $ref borrows its target's title and
        // description, which is how tooling renders it too.
        if (!isBareRef(member)) found.push([`${path}.${container}.${name}`, member])
        walk(member, `${path}.${container}.${name}`)
      }
    }
  }

  walk(document, '#')
  return found
}

function isBareRef(node: unknown): boolean {
  return (
    node !== null &&
    typeof node === 'object' &&
    Object.keys(node).length === 1 &&
    Object.hasOwn(node, '$ref')
  )
}

describe('per-type documentation', () => {
  // The oneOf branches ARE the reason fieldType is written as oneOf of const
  // rather than a flat enum: each carries the title and description the
  // builder's palette and Monaco hovers render. An undocumented branch is a
  // blank tooltip in the product.
  //
  // Counted against FIELD_TYPES rather than against a literal, which is what
  // the previous version did — so adding a type meant editing a number here
  // with no idea why it was 12.
  test('every fieldType branch carries a non-empty title and description', () => {
    const defs = (schemaDocument as { $defs: Record<string, unknown> }).$defs
    const fieldType = defs['fieldType'] as { oneOf: Array<Record<string, unknown>> }

    expect(fieldType.oneOf.length).toBe(FIELD_TYPES.length)
    for (const branch of fieldType.oneOf) {
      expect(typeof branch['title']).toBe('string')
      expect((branch['title'] as string).length).toBeGreaterThan(0)
      expect(typeof branch['description']).toBe('string')
      expect((branch['description'] as string).length).toBeGreaterThan(10)
    }
  })
})
