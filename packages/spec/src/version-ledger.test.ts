import { describe, expect, test } from 'vitest'
import schema from '../formancy.schema.json' with { type: 'json' }
import type { FieldDef, FormSchema } from './types.js'
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
} from './version-ledger.js'
import { versionErrors } from './version-errors.js'

/**
 * The freeze, for everything a document can say that is not a field type or a widget.
 *
 * Every version is frozen, so a construct the schema gains belongs to a version that does
 * not exist yet — and a frozen reader refuses a document carrying it, because the format is
 * closed. Field types and widgets were held to that by name (0140); properties, rule kinds
 * and layout kinds were gated one by one, each by a line somebody remembered to write. These
 * cases take what a document may say from the document schema itself, require each thing to
 * have a version, and require the version check to refuse it one version earlier.
 */

type Node = Record<string, unknown>
const defs = (schema as unknown as { $defs: Record<string, Node> }).$defs

/** The property names an object schema declares, here and in every branch it composes. */
function declared(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return []
  const at = node as Node
  const own = Object.keys((at['properties'] as Node | undefined) ?? {})
  const branches = ['allOf', 'oneOf', 'anyOf']
    .flatMap((key) => (at[key] as unknown[] | undefined) ?? [])
    .flatMap((branch) => {
      const then = (branch as Node)['then'] ?? branch
      const ref = (then as Node)['$ref']
      return declared(typeof ref === 'string' ? defs[ref.replace('#/$defs/', '')] : then)
    })
  return [...new Set([...own, ...branches])].sort()
}

/** The constants a schema allows: a `const`, an `enum`, or a `oneOf` of either. */
function constants(node: unknown): string[] {
  const at = node as Node
  if (typeof at['const'] === 'string') return [at['const']]
  if (Array.isArray(at['enum'])) return at['enum'] as string[]
  return ((at['oneOf'] as unknown[] | undefined) ?? []).flatMap(constants)
}

const keys = (table: object): string[] => Object.keys(table).sort()

describe('everything a document can say belongs to a version', () => {
  // A property the schema gains with no entry would be accepted under every frozen version
  // by a check that never heard of it, and refused by every reader already shipped.
  test('the document’s own keys', () => {
    expect(keys(DOCUMENT_PROPERTY_SINCE)).toEqual(declared(schema))
  })

  test('a field’s properties, on every type the schema allows them', () => {
    expect(keys(FIELD_PROPERTY_SINCE)).toEqual(
      [...new Set([...declared(defs['field']), ...declared(defs['containerField'])])].sort(),
    )
  })

  test('an option’s, a matrix row’s, a rule’s and a layout node’s', () => {
    expect(keys(OPTION_PROPERTY_SINCE)).toEqual(declared(defs['fieldOption']))
    expect(keys(MATRIX_ROW_PROPERTY_SINCE)).toEqual(declared(defs['matrixRow']))
    expect(keys(RULE_PROPERTY_SINCE)).toEqual(declared(defs['logicRule']))
    expect(keys(LAYOUT_NODE_PROPERTY_SINCE)).toEqual(declared(defs['layoutNode']))
  })

  test('every rule kind and every layout kind', () => {
    // The two that were attributed by fallback: any rule kind outside version 2's list was
    // taken to be version 3's, and any layout kind outside version 1's to be version 2's.
    const ruleKinds = constants((defs['logicRule']?.['properties'] as Node)['kind'])
    const layoutKinds = ((defs['layoutNode']?.['oneOf'] as Node[] | undefined) ?? []).flatMap(
      (branch) => constants((branch['properties'] as Node)['kind']),
    )
    expect(keys(RULE_KIND_SINCE)).toEqual([...ruleKinds].sort())
    expect(keys(LAYOUT_KIND_SINCE)).toEqual([...layoutKinds].sort())
  })
})

/** The types the schema lets carry a property, read from the branch that declares it. */
function typesCarrying(property: string): string[] {
  const field = defs['field'] as Node
  if ((field['properties'] as Node)[property] !== undefined) {
    return constants(defs['fieldType'])
  }
  return ((field['allOf'] as Node[] | undefined) ?? []).flatMap((branch) => {
    const then = (branch['then'] ?? branch) as Node
    if ((then['properties'] as Node | undefined)?.[property] === undefined) return []
    const when = ((branch['if'] as Node | undefined)?.['properties'] ?? {}) as Node
    if (when['type'] !== undefined) return constants(when['type'])
    // `columns` is declared under `widget: "datagrid"`, which only a repeater may carry.
    return constants(when['widget']).length > 0 ? ['repeater'] : []
  })
}

/**
 * A value for a property, which the version check reads only for presence — except the
 * lists it walks, which have to be lists. `widget`, `type` and `fields` are not here:
 * the first is gated by its value, the second is the field, and the third is the fields
 * inside it, each checked as a field of its own.
 */
const SAMPLE: Record<string, unknown> = {
  options: [{ value: 'a', label: 'A' }],
  rows: [{ value: 'r', label: 'R' }],
  children: [],
  path: 'f',
  columns: 1,
}
const sample = (property: string): unknown => SAMPLE[property] ?? true

/** A layout node of a kind, with what that kind must have to be walked. */
const nodeOf = (kind: string): Node =>
  kind === 'field' || kind === 'qrcode'
    ? { kind, path: 'f' }
    : kind === 'table'
      ? { kind, columns: 1, children: [] }
      : { kind, children: [] }

describe('and is refused by name one version earlier', () => {
  const at = (specVersion: number): FormSchema =>
    ({ specVersion: String(specVersion), id: 'v', title: 'V', model: { fields: [] } }) as unknown as FormSchema

  const fieldCases = keys(FIELD_PROPERTY_SINCE)
    .filter((property) => !['widget', 'type', 'fields'].includes(property))
    .flatMap((property) =>
      [...new Set(typesCarrying(property))].map((type) => ({ property, type })),
    )

  test.each(fieldCases)('$property on a $type field', ({ property, type }) => {
    const field = { key: 'f', type, [property]: sample(property) } as unknown as FieldDef
    const since = fieldPropertySince(property as keyof FieldDef, type)
    const path = '/model/fields/0'
    const errors = (version: number) =>
      versionErrors(at(version), [{ field, path }]).map((error) => error.path)

    if (since > 1) expect(errors(since - 1).some((where) => where.startsWith(path))).toBe(true)
    expect(errors(since).filter((where) => where.startsWith(`${path}/${property}`))).toEqual([])
  })

  test.each(keys(OPTION_PROPERTY_SINCE))('%s on an option', (property) => {
    const field = {
      key: 'f',
      type: 'radio',
      options: [{ value: 'a', label: 'A', [property]: true }],
    } as unknown as FieldDef
    const since = OPTION_PROPERTY_SINCE[property as keyof typeof OPTION_PROPERTY_SINCE]
    const path = '/model/fields/0'
    const errors = (version: number) =>
      versionErrors(at(version), [{ field, path }]).map((error) => error.path)

    if (since > 1) expect(errors(since - 1)).toContain(`${path}/options/0/${property}`)
    expect(errors(since)).toEqual([])
  })

  test.each(keys(RULE_PROPERTY_SINCE))('%s on a rule', (property) => {
    // On the kind that carries it: `check` belongs to a check rule.
    const kind = property === 'check' ? 'check' : 'validate'
    const rule = { target: 'f', kind, [property]: property === 'kind' ? kind : true }
    const since = Math.max(
      RULE_PROPERTY_SINCE[property as keyof typeof RULE_PROPERTY_SINCE],
      RULE_KIND_SINCE[kind],
    )
    const errors = (version: number) =>
      versionErrors({ ...at(version), logic: { rules: [rule] } } as FormSchema, []).map(
        (error) => error.path,
      )

    if (since > 1) expect(errors(since - 1).some((where) => where.startsWith('/logic/rules/0'))).toBe(true)
    expect(errors(since)).toEqual([])
  })

  test.each(keys(RULE_KIND_SINCE))('a %s rule', (kind) => {
    const since = RULE_KIND_SINCE[kind as keyof typeof RULE_KIND_SINCE]
    const errors = (version: number) =>
      versionErrors({ ...at(version), logic: { rules: [{ target: 'f', kind }] } } as FormSchema, []).map(
        (error) => error.path,
      )

    if (since > 1) expect(errors(since - 1)).toEqual(['/logic/rules/0/kind'])
    expect(errors(since)).toEqual([])
  })

  test.each(keys(LAYOUT_NODE_PROPERTY_SINCE))('%s on a layout node', (property) => {
    // On a node of the oldest kind that may carry it, so the property's version shows.
    const kind = property === 'columns' ? 'table' : property === 'path' ? 'field' : 'section'
    const node = { ...nodeOf(kind), [property]: property === 'kind' ? kind : sample(property) }
    const since = Math.max(
      LAYOUT_NODE_PROPERTY_SINCE[property as keyof typeof LAYOUT_NODE_PROPERTY_SINCE],
      LAYOUT_KIND_SINCE[kind],
    )
    const errors = (version: number) =>
      versionErrors(
        { ...at(version), layouts: [{ name: 'default', nodes: [node] }] } as unknown as FormSchema,
        [],
      ).map((error) => error.path)

    if (since > 1) expect(errors(since - 1).some((where) => where.startsWith('/layouts/0/nodes/0'))).toBe(true)
    expect(errors(since)).toEqual([])
  })

  test.each(keys(LAYOUT_KIND_SINCE))('a %s layout node', (kind) => {
    const since = LAYOUT_KIND_SINCE[kind as keyof typeof LAYOUT_KIND_SINCE]
    const errors = (version: number) =>
      versionErrors(
        { ...at(version), layouts: [{ name: 'default', nodes: [nodeOf(kind)] }] } as unknown as FormSchema,
        [],
      ).map((error) => error.path)

    if (since > 1) expect(errors(since - 1)).toEqual(['/layouts/0/nodes/0/kind'])
    expect(errors(since)).toEqual([])
  })
})
