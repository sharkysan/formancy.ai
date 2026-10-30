import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * An exclusive option — "None of these" — on a list of ticks: chosen alone or not at all (0199).
 */
const formWith = (field: Partial<FieldDef>, specVersion = '5'): FormSchema =>
  ({
    specVersion,
    id: 'health',
    title: 'Health',
    model: {
      fields: [
        {
          key: 'allergies',
          type: 'selectboxes',
          label: 'Allergies',
          options: [
            { value: 'nuts', label: 'Nuts' },
            { value: 'none', label: 'None of these', exclusive: true },
          ],
          ...field,
        } as FieldDef,
      ],
    },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('an exclusive option', () => {
  test('is an option of a list of ticks', () => {
    expect(errorsOf(formWith({}))).toEqual([])
  })

  // On a radio group or a dropdown every option is exclusive already, and a ranking and a
  // matrix order or rate every option: the flag would say nothing, and an author who set it
  // believed it did something.
  test('is refused on any other kind of choice, naming the option', () => {
    for (const type of ['radio', 'select', 'ranking'] as const) {
      expect(errorsOf(formWith({ type })), type).toMatchObject([{ path: '/model/fields/0/options/1/exclusive', code: 'option.exclusiveNotAList' }])
    }
  })

  test('in a version 4 document is refused, naming the property', () => {
    expect(errorsOf(formWith({}, '4'))).toMatchObject([{ path: '/model/fields/0/options/1/exclusive', code: 'version.property' }])
  })
})
