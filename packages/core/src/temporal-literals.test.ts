import { describe, expect, test } from 'vitest'
import { temporalExample, temporalShape } from '@formancy/spec'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { misshapenTemporalLiterals } from './temporal-literals.js'

/**
 * A date, a time or a date and time compared with text that is not written as its answers
 * are (0236). A rule compares the two as text, which orders them in time only when both have
 * the answers' one shape (0067), so such a rule holds at the wrong moment and `==` holds for
 * nobody. The condition editor wrote one for every date and time through 0.13.0 (0235).
 *
 * Each case is a literal that shipped or could, and the answer that would leave it unsaid or
 * say something about a correct rule.
 */
const trip = (rules: LogicRule[]): FormSchema => ({
  specVersion: '5',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      { key: 'departs', type: 'datetime', label: 'Departs' },
      { key: 'leave', type: 'date', label: 'Leaving' },
      { key: 'opens', type: 'time', label: 'Opens' },
      { key: 'note', type: 'text', label: 'Note' },
      {
        key: 'legs',
        type: 'repeater',
        fields: [
          { key: 'at', type: 'datetime', label: 'At' },
          { key: 'memo', type: 'text', label: 'Memo' },
        ],
      },
    ],
  },
  logic: { rules },
})

const visible = (cel: string, target = 'note'): LogicRule => ({ target, kind: 'visible', cel })

describe('a temporal field compared with text', () => {
  test('is found where the text is the editor’s old wall clock, and says what to write instead', () => {
    const [found, ...rest] = misshapenTemporalLiterals(trip([visible('departs > "2026-10-08T10:30"')]))

    expect(rest).toEqual([])
    expect(found).toMatchObject({ target: 'note', kind: 'visible', path: 'departs', type: 'datetime', literal: '2026-10-08T10:30' })
    // The sentence names the rule, the field, the literal and the shape, so the author can
    // find the rule in a long list and knows what a correct one looks like.
    expect(found?.message).toContain('"note"')
    expect(found?.message).toContain('"departs"')
    expect(found?.message).toContain('"2026-10-08T10:30"')
    expect(found?.message).toContain('YYYY-MM-DDTHH:MM:SSZ')
  })

  test('gives, for each type, the shape its answers have and an answer in it', () => {
    // The letters are prose and the example a copy, and nothing held either to the shape: a
    // sentence saying "HH:MM:SS" for a field whose answers are "HH:MM" sends the author to
    // write a literal that orders wrongly too. Read back from the sentence, each letter a
    // digit, the letters must be an answer of the field's own shape, and the example must be
    // the one every sentence about a temporal answer gives.
    const said = misshapenTemporalLiterals(trip([visible('departs > "x"'), visible('leave < "x"'), visible('opens == "x"')]))
    expect(said).toHaveLength(3)
    for (const { type, message } of said) {
      const [, letters, example] = /written "([^"]+)".*?, like "([^"]+)"/.exec(message) ?? []
      expect(new RegExp(temporalShape(type)).test(letters?.replace(/[YMDHS]/g, '0') ?? ''), `${type}: ${String(letters)}`).toBe(true)
      expect(example, type).toBe(temporalExample(type))
    }
  })

  test('and says nothing about one written as the answers are', () => {
    // A channel that warns about a correct rule is one people stop reading.
    expect(
      misshapenTemporalLiterals(trip([visible('departs > "2026-10-08T08:30:00Z"'), visible('leave < "2026-12-01"'), visible('opens >= "09:30"')])),
    ).toEqual([])
  })

  test('is found for a date and a time as well, whose shapes the editor always wrote', () => {
    // Written by hand, `"2026-1-5"` sorts after `"2026-10-01"` and `"9:30"` after `"10:00"`.
    expect(misshapenTemporalLiterals(trip([visible('leave < "2026-1-5"'), visible('opens == "9:30"')])).map(({ path, literal }) => [path, literal])).toEqual([
      ['leave', '2026-1-5'],
      ['opens', '9:30'],
    ])
  })

  test('and inside a row, where `item` is the row of the rule’s own repeater', () => {
    // Resolved as unknownReferences resolves it. Without that, `item.at` names no field and
    // a row rule would never be checked.
    const found = misshapenTemporalLiterals(trip([visible('item.at == "2026-10-08T10:30"', 'legs[].memo')]))

    expect(found.map(({ path }) => path)).toEqual(['legs[].at'])
  })

  test('but not a text field compared with anything', () => {
    expect(misshapenTemporalLiterals(trip([visible('note == "2026-10-08T10:30"')]))).toEqual([])
  })

  test('nor a rule with no expression, or one that does not parse, which publish already refuses', () => {
    const check: LogicRule = { target: 'departs', kind: 'validate', check: 'notBooked' }

    expect(misshapenTemporalLiterals(trip([check, visible('departs > ')]))).toEqual([])
  })
})
