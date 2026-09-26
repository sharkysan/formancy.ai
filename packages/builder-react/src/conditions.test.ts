import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { celLiteral, compileCondition, compileGroup } from './conditions.js'
import type { Condition } from './conditions.js'

describe('celLiteral', () => {
  test('quotes and escapes a string, so a quote in an answer cannot end the string', () => {
    expect(celLiteral("O'Brien")).toBe('"O\'Brien"')
    expect(celLiteral('say "hi"')).toBe('"say \\"hi\\""')
  })

  test('escapes a backslash, which would otherwise escape the closing quote', () => {
    // `"C:\"` — the backslash eats the quote and the expression runs on into
    // whatever follows it. This is the case that makes hand-rolled quoting a
    // bad idea.
    expect(celLiteral('C:\\')).toBe('"C:\\\\"')
  })

  test('escapes newlines and tabs rather than emitting a literal break', () => {
    expect(celLiteral('a\nb')).toBe('"a\\nb"')
    expect(celLiteral('a\tb')).toBe('"a\\tb"')
  })

  test('numbers are emitted as doubles, because the engine has no implicit conversion', () => {
    // CEL will not compare an int to a double, and every number a form
    // collects is a double. `qty > 5` against a double field is a type error
    // at check time; `qty > 5.0` is what was meant.
    expect(celLiteral(5)).toBe('5.0')
    expect(celLiteral(2.5)).toBe('2.5')
    expect(celLiteral(-3)).toBe('-3.0')
  })

  test('booleans and null are themselves', () => {
    expect(celLiteral(true)).toBe('true')
    expect(celLiteral(false)).toBe('false')
    expect(celLiteral(null)).toBe('null')
  })
})

describe('compileCondition', () => {
  test('compares a field to a value', () => {
    expect(compileCondition({ field: 'country', operator: 'is', value: 'CH' })).toBe(
      'country == "CH"',
    )
    expect(compileCondition({ field: 'country', operator: 'isNot', value: 'CH' })).toBe(
      'country != "CH"',
    )
  })

  test('orders numbers as numbers', () => {
    expect(compileCondition({ field: 'qty', operator: 'isMoreThan', value: 5 })).toBe('qty > 5.0')
    expect(compileCondition({ field: 'qty', operator: 'isLessThan', value: 5 })).toBe('qty < 5.0')
  })

  test('"is answered" is a null check, not a truthiness check', () => {
    // An empty answer is null, and `country` alone would be a type error on a
    // string field rather than the falsey test somebody expects from
    // JavaScript.
    expect(compileCondition({ field: 'country', operator: 'isAnswered' })).toBe('country != null')
    expect(compileCondition({ field: 'country', operator: 'isNotAnswered' })).toBe(
      'country == null',
    )
  })

  test('a checkbox comparison is against a boolean, not a string', () => {
    expect(compileCondition({ field: 'terms', operator: 'is', value: true })).toBe('terms == true')
  })

  test('a field inside a repeater row is addressed through item', () => {
    // Inside a row the engine binds `item`, so a rule about a sibling field
    // has to say so — `qty` alone would look for a top-level field.
    expect(
      compileCondition({ field: 'items[].qty', operator: 'isMoreThan', value: 0 }),
    ).toBe('item.qty > 0.0')
  })

  test('a grouped field keeps its dotted path', () => {
    expect(compileCondition({ field: 'billing.city', operator: 'is', value: 'Bern' })).toBe(
      'billing.city == "Bern"',
    )
  })

  test('a value with a quote in it survives the round trip into CEL', () => {
    expect(compileCondition({ field: 'name', operator: 'is', value: 'O"Brien' })).toBe(
      'name == "O\\"Brien"',
    )
  })
})

/**
 * String equality only proves the compiler agrees with the test author. These
 * run the output through the real engine, which is the only thing whose
 * opinion counts — a condition that looks right and does not compile is worse
 * than no condition builder at all.
 */
describe('what it produces actually runs', () => {
  const CLOCK = { now: () => 0, today: () => '2026-09-20', random: () => 0.5 }

  const engineWith = (cel: string, value: Record<string, unknown>): ReturnType<typeof createFormEngine> =>
    createFormEngine({
      schema: {
        specVersion: '1',
        id: 'c',
        title: 'C',
        model: {
          fields: [
            { key: 'country', type: 'text', label: 'Country' },
            { key: 'qty', type: 'number', label: 'Quantity' },
            { key: 'terms', type: 'checkbox', label: 'Terms' },
            { key: 'shown', type: 'text', label: 'Shown' },
          ],
        },
        logic: { rules: [{ target: 'shown', kind: 'visible', cel }] },
      } as FormSchema,
      initialValue: value,
      capabilities: CLOCK,
    })

  const visible = (condition: Condition, value: Record<string, unknown>): boolean =>
    engineWith(compileCondition(condition), value).getFieldSnapshot(['shown']).visible

  test('a string comparison decides visibility', () => {
    const condition: Condition = { field: 'country', operator: 'is', value: 'CH' }

    expect(visible(condition, { country: 'CH' })).toBe(true)
    expect(visible(condition, { country: 'DE' })).toBe(false)
  })

  test('a number comparison type-checks against a double field', () => {
    // The whole reason celLiteral emits `5.0`: CEL refuses to compare an int
    // to a double, and engine construction would throw rather than misbehave.
    const condition: Condition = { field: 'qty', operator: 'isMoreThan', value: 5 }

    expect(visible(condition, { qty: 6 })).toBe(true)
    expect(visible(condition, { qty: 4 })).toBe(false)
  })

  test('a checkbox compares against a boolean', () => {
    const condition: Condition = { field: 'terms', operator: 'is', value: true }

    expect(visible(condition, { terms: true })).toBe(true)
    expect(visible(condition, { terms: false })).toBe(false)
  })

  test('"is answered" distinguishes an empty answer from a given one', () => {
    const condition: Condition = { field: 'country', operator: 'isAnswered' }

    expect(visible(condition, { country: 'CH' })).toBe(true)
    expect(visible(condition, {})).toBe(false)
  })

  test('a value full of quotes and backslashes still compiles', () => {
    // The case that breaks hand-rolled quoting. If the escaping were wrong the
    // engine would throw on construction rather than return false.
    const nasty = 'he said "stop" \\ then C:\\'
    const condition: Condition = { field: 'country', operator: 'is', value: nasty }

    expect(visible(condition, { country: nasty })).toBe(true)
    expect(visible(condition, { country: 'other' })).toBe(false)
  })
})

describe('combining more than one comparison', () => {
  /**
   * "Country is Switzerland AND total is more than 100" — the thing a form
   * author reaches for second, and the thing the editor could not express.
   *
   * The expression language handled it all along; only the authoring side could
   * not, so somebody wanting two comparisons had to write CEL by hand. That is
   * fine for a developer and is the whole difficulty for the audience this
   * builder exists for.
   *
   * **Flat, deliberately.** A group joins comparisons with all or any and cannot
   * contain another group. Nesting is where a condition editor stops being
   * readable — three levels in, nobody can tell what the parentheses do — and
   * the repeater refuses nesting for the same reason. Somebody who genuinely
   * needs it can still eject to CEL, which is the escape hatch that makes the
   * restriction affordable.
   */
  test('all of them becomes &&', () => {
    const cel = compileGroup({
      join: 'all',
      conditions: [
        { field: 'country', operator: 'is', value: 'CH' },
        { field: 'total', operator: 'isMoreThan', value: 100 },
      ],
    })

    // `100.0`, not `100`: CEL does not convert implicitly and every number a
    // form collects is a double, so the integer literal would be a type error at
    // check time. My first expectation here said `100` and the code was right.
    expect(cel).toBe('country == "CH" && total > 100.0')
  })

  test('any of them becomes ||', () => {
    const cel = compileGroup({
      join: 'any',
      conditions: [
        { field: 'country', operator: 'is', value: 'CH' },
        { field: 'country', operator: 'is', value: 'AT' },
      ],
    })

    expect(cel).toBe('country == "CH" || country == "AT"')
  })

  test('one comparison compiles to exactly what it did before', () => {
    const one: Condition = { field: 'country', operator: 'is', value: 'CH' }

    // No parentheses, no join, nothing to migrate: a rule written before groups
    // existed must produce a byte-identical expression, or every existing form
    // would show as changed the moment it was opened.
    expect(compileGroup({ join: 'all', conditions: [one] })).toBe(compileCondition(one))
  })

  test('mixing all and any is not possible, so no parentheses are needed', () => {
    // Stated as a test because it is the reason the output has none. A flat
    // group has one join, so precedence cannot surprise anybody -- and if
    // nesting is ever added, this case fails and forces the question.
    const cel = compileGroup({
      join: 'any',
      conditions: [
        { field: 'a', operator: 'isAnswered' },
        { field: 'b', operator: 'isAnswered' },
        { field: 'c', operator: 'isAnswered' },
      ],
    })

    expect(cel).toBe('a != null || b != null || c != null')
    expect(cel).not.toContain('(')
  })

  test('an empty group is refused rather than compiled to nothing', () => {
    // `''` would be a rule that always passes, silently. A rule with no
    // comparisons is an authoring mistake and has to be visible as one.
    expect(() => compileGroup({ join: 'all', conditions: [] })).toThrow(/at least one/i)
  })

  test('a row-scoped field still resolves against the row', () => {
    const cel = compileGroup({
      join: 'all',
      conditions: [
        { field: 'items[].qty', operator: 'isMoreThan', value: 0 },
        { field: 'items[].name', operator: 'isAnswered' },
      ],
    })

    // `item.` is what a rule inside a repeater scopes to, and it has to survive
    // being combined -- it would be easy to prefix only the first.
    expect(cel).toBe('item.qty > 0.0 && item.name != null')
  })
})
