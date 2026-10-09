import { describe, expect, test } from 'vitest'
import { createFormEngine } from './engine.js'
import { expressionProblems } from './expression-problems.js'
import { parsePath } from './path.js'
import type { FormSchema } from '@formancy/spec'

/**
 * A matrix's answer: the column chosen for each row answered, under the row's value
 * ([0139](../../../docs/decisions/0139-a-matrix-answers-one-question-per-row.md)).
 *
 * The engine is the one place that can refuse an answer the control could never produce —
 * a row the matrix does not have, a column it does not offer, a list where a map belongs —
 * and it is the same engine on the server.
 */
const CAPABILITIES = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

const schemaWith = (over: Record<string, unknown> = {}, logic?: FormSchema['logic']): FormSchema =>
  ({
    specVersion: '4',
    id: 'meal',
    title: 'Meal',
    model: {
      fields: [
        {
          key: 'rating',
          type: 'matrix',
          label: 'How was it?',
          rows: [
            { value: 'taste', label: 'Taste' },
            { value: 'delivery', label: 'Delivery' },
          ],
          options: [
            { value: 'poor', label: 'Poor' },
            { value: 'fine', label: 'Fine' },
            { value: 'great', label: 'Great' },
          ],
          ...over,
        },
        { key: 'why', type: 'text', label: 'What went wrong?' },
      ],
    },
    ...(logic === undefined ? {} : { logic }),
  }) as unknown as FormSchema

const engineFor = (over: Record<string, unknown> = {}, mode: 'client' | 'server' = 'client') =>
  createFormEngine({ schema: schemaWith(over), capabilities: CAPABILITIES, mode })

const errorsAfterSubmitting = (engine: ReturnType<typeof engineFor>, answer: unknown): string[] => {
  engine.setValue(parsePath('rating'), answer)
  return engine.submit().errors['rating'] ?? []
}

describe('a matrix', () => {
  test('starts with no row answered', () => {
    const untouched = (engineFor().value() as Record<string, unknown>)['rating'] ?? {}
    expect(untouched).toEqual({})
  })

  test('stores the column chosen under each row answered', () => {
    const engine = engineFor()
    engine.setValue(parsePath('rating'), { taste: 'great', delivery: 'fine' })

    expect(engine.submit()).toEqual({ ok: true, errors: {} })
    expect(engine.value()).toEqual({ rating: { taste: 'great', delivery: 'fine' } })
  })

  test('required means every row answered: one question per row, and half is not an answer', () => {
    expect(errorsAfterSubmitting(engineFor({ required: true }), {})).toContain('required')
    expect(errorsAfterSubmitting(engineFor({ required: true }), { taste: 'fine' })).toContain(
      'required',
    )
    expect(
      errorsAfterSubmitting(engineFor({ required: true }), { taste: 'fine', delivery: 'poor' }),
    ).toEqual([])
  })

  test('an optional one may be answered in part', () => {
    expect(errorsAfterSubmitting(engineFor(), { taste: 'fine' })).toEqual([])
  })

  for (const mode of ['client', 'server'] as const) {
    test(`refuses a row it does not have (${mode})`, () => {
      expect(
        errorsAfterSubmitting(engineFor({}, mode), { taste: 'fine', price: 'poor' }),
      ).toContain('row')
    })

    test(`refuses a column it does not offer (${mode})`, () => {
      expect(errorsAfterSubmitting(engineFor({}, mode), { taste: 'superb' })).toContain('option')
    })

    test(`refuses anything but a map of strings (${mode})`, () => {
      expect(errorsAfterSubmitting(engineFor({}, mode), ['fine'])).toContain('type')
      expect(errorsAfterSubmitting(engineFor({}, mode), 'fine')).toContain('type')
      expect(errorsAfterSubmitting(engineFor({}, mode), { taste: 3 })).toContain('type')
    })
  }

  test('is the empty map to a rule before anybody answers, so its size is nought', () => {
    // `size(rating) > 0` is what the condition editor writes for "is answered". Against a
    // null it fails to evaluate, and a visible rule that fails shows the field — so an
    // untouched matrix would have read as answered.
    const schema = schemaWith(
      {},
      {
        rules: [{ target: 'why', kind: 'visible', cel: 'size(rating) > 0' }],
      },
    )
    const engine = createFormEngine({ schema, capabilities: CAPABILITIES })

    expect(engine.getFieldSnapshot(parsePath('why')).visible).toBe(false)
    engine.setValue(parsePath('rating'), { taste: 'fine' })
    expect(engine.getFieldSnapshot(parsePath('why')).visible).toBe(true)
  })

  test('reads as a map in a rule, so one row can decide a question', () => {
    const schema = schemaWith(
      {},
      {
        rules: [
          { target: 'why', kind: 'visible', cel: 'has(rating.taste) && rating.taste == "poor"' },
        ],
      },
    )
    expect(expressionProblems(schema)).toEqual([])

    const engine = createFormEngine({ schema, capabilities: CAPABILITIES })
    // Untouched, the map is empty rather than null, so `has()` answers false instead of
    // erroring — and a visible rule that errors shows the field it was meant to hide.
    expect(engine.getFieldSnapshot(parsePath('why')).visible).toBe(false)
    engine.setValue(parsePath('rating'), { taste: 'poor' })
    expect(engine.getFieldSnapshot(parsePath('why')).visible).toBe(true)
  })

  test('and a rule comparing the whole answer with one column is reported before publishing', () => {
    const schema = schemaWith(
      {},
      {
        rules: [{ target: 'why', kind: 'visible', cel: 'rating == "poor"' }],
      },
    )

    expect(expressionProblems(schema).length).toBeGreaterThan(0)
  })

  test('is drawn as a group of controls under one legend', () => {
    const { control } = engineFor({ required: true }).getFieldSnapshot(parsePath('rating')).props
    expect(control['aria-required']).toBeUndefined()
    expect(control['aria-describedby']).toBeDefined()
  })
})
