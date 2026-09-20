import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { celLiteral, compileCondition } from './conditions.js'
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
