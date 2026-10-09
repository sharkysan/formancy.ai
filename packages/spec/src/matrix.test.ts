import { describe, expect, test } from 'vitest'
import { FIELD_TYPES, LIST_VALUED_FIELD_TYPES } from './types.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `matrix`: one question asked of several rows, with the same answers for each. The second
 * field type version 4 adds — a type, because the answer is one no existing type stores: a
 * map from row to column ([0139](../../../docs/decisions/0139-a-matrix-answers-one-question-per-row.md)).
 */
const problemsIn = (document: FormSchema): Array<{ path: string; message: string }> => {
  const report = validateSchema(document)
  return report.valid ? [] : report.errors
}

const form = (specVersion: string, fields: unknown[]): FormSchema =>
  ({ specVersion, id: 'meal', title: 'Meal', model: { fields } }) as unknown as FormSchema

const taste = { value: 'taste', label: 'Taste' }
const delivery = { value: 'delivery', label: 'Delivery' }
const poor = { value: 'poor', label: 'Poor' }
const fine = { value: 'fine', label: 'Fine' }
const great = { value: 'great', label: 'Great' }
const matrix = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: 'rating',
  type: 'matrix',
  label: 'How was it?',
  rows: [taste, delivery],
  options: [poor, fine, great],
  ...extra,
})

describe('a matrix', () => {
  test('is a field type, and its answer is not a list', () => {
    // A map from row to column: `{}` untouched, never `[]`.
    expect(FIELD_TYPES).toContain('matrix')
    expect(LIST_VALUED_FIELD_TYPES).not.toContain('matrix')
  })

  test('is accepted in a version 4 document', () => {
    expect(problemsIn(form('4', [matrix()]))).toEqual([])
  })

  test('is refused in a version 3 document, which is told it needs version 4', () => {
    const problems = problemsIn(form('3', [matrix()]))

    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toMatch(/matrix/)
    expect(problems[0]?.message).toMatch(/"4"/)
  })

  test('needs a row and two columns', () => {
    expect(problemsIn(form('4', [matrix({ rows: [] })])).length).toBeGreaterThan(0)
    expect(problemsIn(form('4', [matrix({ options: [poor] })])).length).toBeGreaterThan(0)
    const { rows: _rows, ...rowless } = matrix()
    expect(problemsIn(form('4', [rowless])).length).toBeGreaterThan(0)
  })

  test('refuses two rows with one value, which one answer could not tell apart', () => {
    const problems = problemsIn(
      form('4', [matrix({ rows: [taste, { ...taste, label: 'Flavour' }] })]),
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]?.path).toBe('/model/fields/0/rows/1/value')
  })

  test('and two columns with one value, for the same reason', () => {
    const problems = problemsIn(form('4', [matrix({ options: [poor, { ...poor, label: 'Bad' }] })]))

    expect(problems).toHaveLength(1)
    expect(problems[0]?.path).toBe('/model/fields/0/options/1/value')
  })

  test('has no bounds and no options source: its rows are its shape', () => {
    expect(problemsIn(form('4', [matrix({ maxItems: 1 })])).length).toBeGreaterThan(0)
    expect(problemsIn(form('4', [matrix({ optionsSource: 'scores' })])).length).toBeGreaterThan(0)
  })

  test('is the only type with rows', () => {
    const select = { key: 'pick', type: 'select', label: 'Pick', options: [poor], rows: [taste] }
    expect(problemsIn(form('4', [select])).length).toBeGreaterThan(0)
  })
})

describe('a picture on an option', () => {
  /*
   * Shown on radio buttons and checkboxes. A ranking and a matrix draw their options as
   * buttons and as columns of radios with no room for one, and the ranking shipped in a
   * document that accepted pictures it never drew — the documented-but-inert failure.
   */
  const picture = { src: 'https://example.org/a.png', alt: 'A picture' }

  test('is refused on a ranking, which does not draw one', () => {
    const ranking = {
      key: 'drinks',
      type: 'ranking',
      label: 'Order these',
      options: [{ ...poor, image: picture }, fine],
    }
    expect(problemsIn(form('4', [ranking]))[0]?.path).toBe('/model/fields/0/options/0/image')
  })

  test('and on a matrix column', () => {
    const columns = [poor, { ...fine, image: picture }, great]
    expect(problemsIn(form('4', [matrix({ options: columns })]))[0]?.path).toBe(
      '/model/fields/0/options/1/image',
    )
  })

  test('and a row cannot carry one at all', () => {
    expect(
      problemsIn(form('4', [matrix({ rows: [{ ...taste, image: picture }, delivery] })])).length,
    ).toBeGreaterThan(0)
  })
})
