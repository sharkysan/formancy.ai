import { describe, expect, test } from 'vitest'
import { createFormEngine } from './engine.js'
import { expressionProblems } from './expression-problems.js'
import { parsePath } from './path.js'
import type { FormSchema } from '@formancy/spec'

/**
 * A ranking's answer: the values of the options in the order chosen, most preferred
 * first ([0138](../../../docs/decisions/0138-a-ranking-stores-the-order-chosen.md)).
 *
 * The engine is the only place that can refuse a payload the control could never have
 * produced — a value twice, a value nobody offered, a string where an order belongs —
 * and it is the same engine on the server, so these hold for a submission posted at the
 * endpoint as much as for one typed into a form.
 */
const CAPABILITIES = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

const schemaWith = (over: Record<string, unknown> = {}, logic?: FormSchema['logic']): FormSchema =>
  ({
    specVersion: '4',
    id: 'drinks',
    title: 'Drinks',
    model: {
      fields: [
        {
          key: 'drinks',
          type: 'ranking',
          label: 'Put these in order',
          options: [
            { value: 'coffee', label: 'Coffee' },
            { value: 'tea', label: 'Tea' },
            { value: 'water', label: 'Water' },
          ],
          ...over,
        },
        { key: 'why', type: 'text', label: 'Why coffee?' },
      ],
    },
    ...(logic === undefined ? {} : { logic }),
  }) as unknown as FormSchema

const engineFor = (over: Record<string, unknown> = {}, mode: 'client' | 'server' = 'client') =>
  createFormEngine({ schema: schemaWith(over), capabilities: CAPABILITIES, mode })

const errorsAfterSubmitting = (engine: ReturnType<typeof engineFor>, answer: unknown): string[] => {
  engine.setValue(parsePath('drinks'), answer)
  return engine.submit().errors['drinks'] ?? []
}

describe('a ranking', () => {
  test('starts as the empty list, not as the options in their written order', () => {
    // An order nobody chose is not an answer. Starting from the options' own order would
    // submit the author's preference as the respondent's the moment anybody pressed send.
    const untouched = (engineFor().value() as Record<string, unknown>)['drinks'] ?? []
    expect(untouched).toEqual([])
  })

  test('stores the order chosen', () => {
    const engine = engineFor()
    engine.setValue(parsePath('drinks'), ['tea', 'coffee'])

    expect(engine.submit()).toEqual({ ok: true, errors: {} })
    expect(engine.value()).toEqual({ drinks: ['tea', 'coffee'] })
  })

  test('required means something ranked, and the empty list is not that', () => {
    expect(errorsAfterSubmitting(engineFor({ required: true }), [])).toContain('required')
    expect(errorsAfterSubmitting(engineFor({ required: true }), ['water'])).toEqual([])
  })

  test('the fewest and most ranked bound how many are put in order', () => {
    expect(errorsAfterSubmitting(engineFor({ minItems: 3 }), ['tea'])).toContain('minItems')
    expect(errorsAfterSubmitting(engineFor({ maxItems: 2 }), ['tea', 'coffee', 'water'])).toContain(
      'maxItems',
    )
    expect(errorsAfterSubmitting(engineFor({ minItems: 3 }), ['tea', 'coffee', 'water'])).toEqual(
      [],
    )
  })

  for (const mode of ['client', 'server'] as const) {
    test(`refuses a value twice, which no order contains (${mode})`, () => {
      // A list with a repeat says one option is both second and fourth.
      expect(errorsAfterSubmitting(engineFor({}, mode), ['tea', 'coffee', 'tea'])).toContain(
        'duplicate',
      )
    })

    test(`refuses a value nobody offered (${mode})`, () => {
      expect(errorsAfterSubmitting(engineFor({}, mode), ['tea', 'beer'])).toContain('option')
    })

    test(`refuses a string where an order belongs (${mode})`, () => {
      expect(errorsAfterSubmitting(engineFor({}, mode), 'tea')).toContain('type')
    })
  }

  test('reads as a list in a rule, so the first choice can decide a question', () => {
    const schema = schemaWith(
      {},
      {
        rules: [
          { target: 'why', kind: 'visible', cel: 'size(drinks) > 0 && drinks[0] == "coffee"' },
        ],
      },
    )
    // Type-checks as a list: an index and `size` are list operations, and declaring the
    // answer `dyn` would let a rule comparing it to a number publish and never be true.
    expect(expressionProblems(schema)).toEqual([])

    const engine = createFormEngine({ schema, capabilities: CAPABILITIES })
    // Untouched, the list is empty, so the guard holds and the rule is false rather than
    // an error that would show the field.
    expect(engine.getFieldSnapshot(parsePath('why')).visible).toBe(false)
    engine.setValue(parsePath('drinks'), ['coffee', 'tea'])
    expect(engine.getFieldSnapshot(parsePath('why')).visible).toBe(true)
  })

  test('and a rule comparing the whole order with one option is reported before publishing', () => {
    // The mistake an author makes when they mean "the first choice is coffee". Declared as
    // a list, the checker refuses it; declared as anything, it publishes and is never true.
    const schema = schemaWith(
      {},
      {
        rules: [{ target: 'why', kind: 'visible', cel: 'drinks == "coffee"' }],
      },
    )

    expect(expressionProblems(schema).length).toBeGreaterThan(0)
  })

  test('is drawn as a group of controls under one legend', () => {
    // Several controls answering one question, as radios and checkboxes are: a fieldset
    // to assistive technology, which says it is required in its description.
    // Seen in the props: `aria-required` is not supported on a group, so a grouped field
    // carries its requiredness in a hint the control is described by instead.
    const { control } = engineFor({ required: true }).getFieldSnapshot(parsePath('drinks')).props
    expect(control['aria-required']).toBeUndefined()
    expect(control['aria-describedby']).toBeDefined()
  })
})
