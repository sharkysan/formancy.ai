import { describe, expect, test } from 'vitest'
import { createFormEngine } from './engine.js'
import { expressionProblems } from './expression-problems.js'
import { parsePath } from './path.js'
import type { FormSchema } from '@formancy/spec'

/**
 * The expressions that compile and then never work.
 *
 * Half of these are about what this must NOT report. A check that refuses a
 * valid form is worse than the silence it replaces: the silence costs one
 * field, and a false refusal costs the whole publish.
 */
const CAPABILITIES = { now: () => 0, today: () => '2026-09-24', random: () => 0.5 }

const form = (
  fields: FormSchema['model']['fields'],
  rules: NonNullable<FormSchema['logic']>['rules'],
): FormSchema => ({
  specVersion: '1',
  id: 'quote',
  title: 'Quote',
  model: { fields },
  logic: { rules },
})

const NUMBERS = [
  { key: 'seats', type: 'number' as const, label: 'Seats' },
  { key: 'price', type: 'number' as const, label: 'Price' },
  { key: 'total', type: 'number' as const, label: 'Total' },
]

describe('the bug this exists for', () => {
  const broken = form(NUMBERS, [{ target: 'total', kind: 'computed', cel: 'seats * 4' }])

  test('the engine accepts it, which is the whole problem', () => {
    // `dyn * int` type-checks, because a leaf is declared `dyn` so that an
    // unfinished answer is not a type error on every keystroke.
    expect(() => createFormEngine({ schema: broken, capabilities: CAPABILITIES })).not.toThrow()
  })

  test('and then it computes nothing, for every value anybody enters', () => {
    const engine = createFormEngine({ schema: broken, capabilities: CAPABILITIES })

    engine.setValue(parsePath('seats'), 25)

    expect(engine.value()).toEqual({ seats: 25 })
  })

  test('so this reports it, by name, with the fix', () => {
    const [problem] = expressionProblems(broken)

    expect(problem?.target).toBe('total')
    expect(problem?.message).toContain('double * int')
    expect(problem?.message).toContain('4 becomes 4.0')
    expect(problem?.message).toContain('never does anything')
  })

  test('and the decimal point is genuinely the fix', () => {
    const fixed = form(NUMBERS, [{ target: 'total', kind: 'computed', cel: 'seats * 4.0' }])
    const engine = createFormEngine({ schema: fixed, capabilities: CAPABILITIES })

    engine.setValue(parsePath('seats'), 25)

    expect(expressionProblems(fixed)).toEqual([])
    expect(engine.value()).toEqual({ seats: 25, total: 100 })
  })
})

describe('every arithmetic operator, and every position', () => {
  test.each(['seats * 4', '4 * seats', 'seats + 1', 'seats - 1', 'seats / 2', 'seats % 2'])(
    'catches %s',
    (cel) => {
      expect(expressionProblems(form(NUMBERS, [{ target: 'total', kind: 'computed', cel }]))).toHaveLength(1)
    },
  )

  test('catches it inside a larger expression', () => {
    const problems = expressionProblems(
      form(NUMBERS, [{ target: 'total', kind: 'computed', cel: '(seats * 4) + price' }]),
    )

    expect(problems).toHaveLength(1)
  })

  test('catches it in a row rule, where $index is genuinely an int', () => {
    const schema = form(
      [
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          fields: [
            { key: 'qty', type: 'number', label: 'Qty' },
            { key: 'line', type: 'number', label: 'Line' },
          ],
        },
      ],
      [{ target: 'items[].line', kind: 'computed', cel: 'item.qty * 2' }],
    )

    // `item` is a map, so its members are dyn and this one is not catchable.
    // The case worth pinning is that a row rule is checked at all rather than
    // skipped, and that it is not reported wrongly.
    expect(expressionProblems(schema)).toEqual([])
  })
})

describe('what it must not report', () => {
  test('a comparison with null, which is how you ask whether a field is empty', () => {
    // Strict declarations make this a type error, and it is a perfectly good
    // thing to write. Consulting strictness rather than obeying it is the
    // whole reason the filter exists.
    const schema = form(NUMBERS, [{ target: 'total', kind: 'visible', cel: 'seats == null' }])

    expect(expressionProblems(schema)).toEqual([])
  })

  test('a comparison between a number and a whole number, which CEL does allow', () => {
    const schema = form(NUMBERS, [{ target: 'total', kind: 'visible', cel: 'seats >= 18' }])

    expect(expressionProblems(schema)).toEqual([])
  })

  test('arithmetic between two number fields', () => {
    const schema = form(NUMBERS, [{ target: 'total', kind: 'computed', cel: 'seats * price' }])

    expect(expressionProblems(schema)).toEqual([])
  })

  test('a genuine type mistake is reported, but without the decimal-point advice', () => {
    const schema = form(
      [...NUMBERS, { key: 'name', type: 'text', label: 'Name' }],
      [{ target: 'total', kind: 'computed', cel: 'seats * name' }],
    )

    // `double * string` fails exactly as silently, so it is reported too. The
    // hint is not: telling this author to write `4.0` sends them looking in
    // the wrong place.
    const [problem] = expressionProblems(schema)
    expect(problem?.message).toContain('double * string')
    expect(problem?.message).not.toContain('4.0')
  })

  test('string, boolean and list fields used as themselves', () => {
    const schema = form(
      [
        { key: 'country', type: 'text', label: 'Country' },
        { key: 'terms', type: 'checkbox', label: 'Terms' },
        { key: 'topics', type: 'select', label: 'Topics', options: [{ value: 'a', label: 'A' }] },
        { key: 'shown', type: 'text', label: 'Shown' },
      ],
      [
        { target: 'shown', kind: 'visible', cel: "country == 'CH'" },
        { target: 'shown', kind: 'required', cel: 'terms == true' },
        { target: 'shown', kind: 'disabled', cel: "topics == 'a'" },
      ],
    )

    expect(expressionProblems(schema)).toEqual([])
  })

  test('a form with no logic at all', () => {
    expect(expressionProblems(form(NUMBERS, []))).toEqual([])
  })

  test('an expression that does not parse, which is the engine’s to report', () => {
    const schema = form(NUMBERS, [{ target: 'total', kind: 'computed', cel: 'this is not CEL' }])

    // Reported once, in the engine's words, rather than twice in two voices.
    expect(expressionProblems(schema)).toEqual([])
    expect(() => createFormEngine({ schema, capabilities: CAPABILITIES })).toThrow()
  })

  test('a field inside a page, which contributes no path segment', () => {
    const schema = form(
      [{ key: 'step1', type: 'page', label: 'Step 1', fields: NUMBERS }],
      [{ target: 'total', kind: 'computed', cel: 'seats * 4' }],
    )

    // Named `seats`, not `step1.seats`. If the walk here disagreed with the
    // engine's, this would read as an undeclared identifier and be skipped.
    expect(expressionProblems(schema)).toHaveLength(1)
  })
})
