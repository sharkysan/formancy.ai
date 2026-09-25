import { describe, expect, test } from 'vitest'
import { createFormEngine } from './engine.js'
import { engineRefusal } from './engine-refusal.js'
import type { FormSchema } from '@formancy/spec'

/**
 * Whether the engine would open a document, asked without opening it.
 *
 * The property that matters is agreement: `engineRefusal` must refuse exactly
 * what `createFormEngine` refuses, because it exists for callers that check a
 * document without building an engine and then hand it to something that
 * does. The cases are the three a model writing a form actually produces.
 */
const CAPABILITIES = { now: () => 0, today: () => '2026-09-25', random: () => 0.5 }

const form = (
  fields: FormSchema['model']['fields'],
  rules: NonNullable<FormSchema['logic']>['rules'],
): FormSchema => ({
  specVersion: '2',
  id: 'booking',
  title: 'Booking',
  model: { fields },
  logic: { rules },
})

const FIELDS: FormSchema['model']['fields'] = [
  { key: 'halfBoard', type: 'checkbox', label: 'Half board' },
  { key: 'diet', type: 'text', label: 'Diet' },
  { key: 'nights', type: 'number', label: 'Nights' },
  { key: 'total', type: 'number', label: 'Total' },
]

const refused = {
  'a checkbox as a condition on its own': form(FIELDS, [
    { target: 'diet', kind: 'visible', cel: 'halfBoard' },
  ]),
  'a misspelled field name': form(FIELDS, [
    { target: 'diet', kind: 'visible', cel: 'halfbord == true' },
  ]),
  'a cycle between computed fields': form(FIELDS, [
    { target: 'nights', kind: 'computed', cel: 'total / 65.0' },
    { target: 'total', kind: 'computed', cel: 'nights * 65.0' },
  ]),
}

describe('engineRefusal', () => {
  test('a document the engine opens is not refused', () => {
    const fine = form(FIELDS, [
      { target: 'diet', kind: 'visible', cel: 'halfBoard == true' },
      { target: 'total', kind: 'computed', cel: 'nights * 65.0' },
    ])

    expect(engineRefusal(fine)).toBeUndefined()
  })

  test('a document with no rules at all is not refused', () => {
    // The engine demands a capabilities source only when there are rules, and
    // this must not trip over the difference.
    expect(engineRefusal(form(FIELDS, []))).toBeUndefined()
  })

  test.each(Object.entries(refused))('refuses %s, in the engine’s own words', (_, schema) => {
    let thrown: string | undefined
    try {
      createFormEngine({ schema, capabilities: CAPABILITIES })
    } catch (error) {
      thrown = (error as Error).message
    }

    // Agreement, not a second opinion: the same message the engine throws.
    expect(thrown).toBeDefined()
    expect(engineRefusal(schema)).toBe(thrown)
  })

  test('names the field that is not there', () => {
    expect(engineRefusal(refused['a misspelled field name'])).toContain('halfbord')
  })

  test('names the cycle', () => {
    expect(engineRefusal(refused['a cycle between computed fields'])).toMatch(/cycle/i)
  })
})

describe('the engine says what to write instead', () => {
  test('a checkbox on its own: compare it', () => {
    // The most natural way to write "when the box is ticked", and refused for
    // a real reason — an untouched box is null. "produces dyn" alone means
    // nothing to whoever wrote it; the fix is always the same.
    expect(engineRefusal(refused['a checkbox as a condition on its own'])).toContain(
      'write halfBoard == true',
    )
  })

  test('only for a checkbox, where the fix is certain', () => {
    // `diet == true` would be wrong advice for a text field, so none is given.
    const text = form(FIELDS, [{ target: 'nights', kind: 'visible', cel: 'diet' }])

    expect(engineRefusal(text)).toBeDefined()
    expect(engineRefusal(text)).not.toContain('== true')
  })

  test('the expression package’s own hints are no longer dropped on the way out', () => {
    // `decimal * double` has a hint attached by the expression package. The
    // engine used to report the message and discard the hint, so the one
    // sentence saying what to write never reached the publish gate.
    const money = form(FIELDS, [
      { target: 'total', kind: 'computed', cel: "dec('65.00') * 2.0" },
    ])

    expect(engineRefusal(money)).toContain('Write dec("2.0") instead of 2.0')
  })
})
