import { describe, expect, test } from 'vitest'
import { FIELD_TYPES, LIST_VALUED_FIELD_TYPES } from './types.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `ranking`: options put in order. The first field type version 4 adds — a type rather
 * than a widget, because the answer is one no existing type stores: the order somebody
 * chose ([0138](../../../docs/decisions/0138-a-ranking-stores-the-order-chosen.md)).
 */
const problemsIn = (document: FormSchema): Array<{ path: string; message: string }> => {
  const report = validateSchema(document)
  return report.valid ? [] : report.errors
}

const form = (specVersion: string, fields: unknown[]): FormSchema =>
  ({ specVersion, id: 'rank', title: 'Rank', model: { fields } }) as unknown as FormSchema

const coffee = { value: 'coffee', label: 'Coffee' }
const tea = { value: 'tea', label: 'Tea' }
const water = { value: 'water', label: 'Water' }
const ranking = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: 'drinks',
  type: 'ranking',
  label: 'Put these in order',
  options: [coffee, tea, water],
  ...extra,
})

describe('a ranking', () => {
  test('is a field type, and its answer is a list', () => {
    // A list, so an untouched ranking is `[]` rather than null: `'tea' in drinks` is false
    // against `[]` and an error against null, and a visibility rule that errors shows
    // the field it was meant to hide.
    expect(FIELD_TYPES).toContain('ranking')
    expect(LIST_VALUED_FIELD_TYPES).toContain('ranking')
  })

  test('is accepted in a version 4 document', () => {
    expect(problemsIn(form('4', [ranking()]))).toEqual([])
  })

  test('is refused in a version 3 document, which is told it needs version 4', () => {
    // Not version 3. The version a type arrived in was worked out as "1, else 2, else
    // 3", which answers 3 for every type there will ever be: a version 3 document
    // carrying a ranking would have been told to declare the version it already does.
    const problems = problemsIn(form('3', [ranking()]))

    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toMatch(/ranking/)
    expect(problems[0]?.message).toMatch(/"4"/)
  })

  test('needs at least two options, since one is not an order', () => {
    expect(problemsIn(form('4', [ranking({ options: [coffee] })]))[0]?.path).toMatch(/\/options/)
    expect(
      problemsIn(form('4', [{ key: 'drinks', type: 'ranking', label: 'x' }])).length,
    ).toBeGreaterThan(0)
  })

  test('refuses two options with one value, which an order could not tell apart', () => {
    // A ranking stores values. Two options sharing one would put a value in the answer
    // that names either of them, and a submission could not say which came first.
    const problems = problemsIn(
      form('4', [ranking({ options: [coffee, tea, { ...tea, label: 'Green tea' }] })]),
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]?.path).toBe('/model/fields/0/options/2/value')
  })

  test('may bound how many are ranked, which is how "your top three" is asked', () => {
    expect(problemsIn(form('4', [ranking({ minItems: 1, maxItems: 2 })]))).toEqual([])
  })

  test('but not take its options from a source, whose list could change under an order', () => {
    expect(problemsIn(form('4', [ranking({ optionsSource: 'drinks' })])).length).toBeGreaterThan(0)
  })
})
