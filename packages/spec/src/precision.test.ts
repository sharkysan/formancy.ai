import { describe, expect, test } from 'vitest'
import { diffSchemas } from './diff.js'
import { CURRENT_SPEC_VERSION, SPEC_VERSIONS } from './types.js'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A time or a date and time that says how many digits follow its seconds: `precision`,
 * the first construct of spec version 6.
 *
 * It is a database's own word (`timestamp(p)`), so a form can say what a column keeps.
 */
const formWith = (field: Partial<FieldDef>, specVersion = '6'): FormSchema =>
  ({
    specVersion,
    id: 'reading',
    title: 'Reading',
    model: { fields: [{ key: 'at', type: 'time', label: 'At', ...field }] },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('what version 6 is', () => {
  // A version the package does not speak could not carry the property at all; one that is
  // not the default would leave every new document writing a version that cannot hold it.
  test('a version this package speaks, and the one it writes by default', () => {
    expect([...SPEC_VERSIONS]).toContain('6')
    expect(CURRENT_SPEC_VERSION).toBe('6')
  })
})

describe('precision', () => {
  // The two types it is for. Refusing either would leave a form unable to say what its
  // storage keeps for that type.
  test.each(['time', 'datetime'] as const)('is accepted on %s in a version 6 document', (type) => {
    expect(errorsOf(formWith({ type, precision: 3 }))).toEqual([])
  })

  // The ends of the range are the ones an off-by-one gets wrong.
  test.each([0, 9])('accepts %i, the ends of the range', (precision) => {
    expect(errorsOf(formWith({ precision }))).toEqual([])
  })

  // A version 5 reader has never heard of it, and ignoring it would store a shape the
  // author did not mean; so a version 5 document carrying one is refused, by name.
  test('in a version 5 document is refused, naming the property', () => {
    expect(errorsOf(formWith({ precision: 3 }, '5'))).toMatchObject([{ path: '/model/fields/0/precision', code: 'version.property' }])
  })

  // A date has no seconds and the others have no clock: the schema refuses an unknown
  // property, so a precision there is not silently ignored.
  test.each([{ type: 'date' as const }, { type: 'text' as const }, { type: 'number' as const }])(
    'is refused on $type, as the schema refuses an unknown property',
    (field) => {
      expect(errorsOf(formWith({ ...field, precision: 3 })).length).toBeGreaterThan(0)
    },
  )

  // Below 0 and above 9 there is no shape, and a fraction of a digit is no count of digits.
  test.each([-1, 10, 1.5])('is refused at %s', (precision) => {
    expect(errorsOf(formWith({ precision })).length).toBeGreaterThan(0)
  })
})

describe('a change to precision, in the diff', () => {
  const kindsOf = (before: FormSchema, after: FormSchema) => diffSchemas(before, after).filter((change) => change.kind !== 'specVersion.changed')

  // Removing precision changes every answer's width, so it must not be read as a
  // relaxation of a bound: each way is a field change that rebinds data, lossy.
  test.each([
    ['adding', undefined, 3],
    ['changing', 3, 6],
    ['removing', 3, undefined],
  ])('%s it is field.changed and lossy, never a relaxation', (_what, from, to) => {
    const changes = kindsOf(formWith({ ...(from === undefined ? {} : { precision: from }) }), formWith({ ...(to === undefined ? {} : { precision: to }) }))
    expect(changes).toMatchObject([{ kind: 'field.changed', severity: 'lossy' }])
  })
})
