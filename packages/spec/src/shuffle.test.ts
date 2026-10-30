import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * Options shown in a shuffled order, so the first one is not chosen for being first, with the
 * ones that keep their place — "None of these", "Other" — where the author put them (0200).
 */
const formWith = (field: Partial<FieldDef>, specVersion = '5'): FormSchema =>
  ({
    specVersion,
    id: 'survey',
    title: 'Survey',
    model: {
      fields: [
        {
          key: 'channel',
          type: 'radio',
          label: 'How did you hear of us?',
          shuffle: true,
          options: [
            { value: 'friend', label: 'A friend' },
            { value: 'press', label: 'The press' },
            { value: 'other', label: 'Other', keepPlace: true },
          ],
          ...field,
        },
      ],
    },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('a shuffled order', () => {
  test('is offered on a radio group, a list of ticks and a ranking', () => {
    for (const type of ['radio', 'selectboxes', 'ranking'] as const) {
      expect(errorsOf(formWith({ type })), type).toEqual([])
    }
  })

  // A dropdown's order is how a long list is searched by eye — countries, years — and a
  // matrix's columns are a scale, whose order is its meaning.
  test('is refused on a dropdown and a matrix', () => {
    expect(errorsOf(formWith({ type: 'select' }))).not.toEqual([])
    expect(errorsOf(formWith({ type: 'matrix', rows: [{ value: 'r', label: 'R' }] }))).not.toEqual([])
  })

  test('in a version 4 document is refused, naming each property', () => {
    expect(errorsOf(formWith({}, '4'))).toMatchObject([
      { path: '/model/fields/0/shuffle', code: 'version.property' },
      { path: '/model/fields/0/options/2/keepPlace', code: 'version.property' },
    ])
  })
})
