import { describe, expect, test } from 'vitest'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { crossWidthComparisons } from './temporal-widths.js'
import { misshapenTemporalLiterals } from './temporal-literals.js'

/**
 * A comparison that puts a temporal answer beside something of another width (spec 6). A rule
 * compares the two as text, which is only right between strings of one shape (0067), so such a
 * rule holds at the wrong moment and `==` holds for nobody. Unlike 0236 this is refused: no valid
 * document could declare a precision before version 6, so nothing valid becomes invalid.
 *
 * Each case is a comparison that is wrong or right, and the answer that would refuse a correct
 * rule or let a wrong one publish.
 */
const trip = (rules: LogicRule[]): FormSchema => ({
  specVersion: '6',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      { key: 'opens', type: 'time', label: 'Opens', precision: 3 },
      { key: 'closes', type: 'time', label: 'Closes', precision: 3 },
      { key: 'coarse', type: 'time', label: 'Coarse', precision: 1 },
      { key: 'plain', type: 'datetime', label: 'Plain' },
      { key: 'leave', type: 'date', label: 'Leaving' },
      { key: 'fine', type: 'datetime', label: 'Fine', precision: 3 },
      { key: 'finer', type: 'datetime', label: 'Finer', precision: 6 },
      { key: 'finest', type: 'datetime', label: 'Finest', precision: 6 },
      { key: 'note', type: 'text', label: 'Note' },
      {
        key: 'legs',
        type: 'repeater',
        fields: [{ key: 'at', type: 'datetime', label: 'At', precision: 3 }],
      },
    ],
  },
  logic: { rules },
})

const visible = (cel: string, target = 'note'): LogicRule => ({ target, kind: 'visible', cel })

describe('a literal compared with a field that declares precision', () => {
  test('is reported when it is not at the field’s width, with the three remedies', () => {
    const [found, ...rest] = crossWidthComparisons(trip([visible('opens > "09:00"')]))

    expect(rest).toEqual([])
    expect(found).toMatchObject({ target: 'note', kind: 'visible', cel: 'opens > "09:00"', paths: ['opens'], literal: '09:00' })
    // The sentence names the rule, the field and the literal, and gives the way out each of
    // the three ways, or the author is told it is wrong and not what to do.
    expect(found?.message).toContain('"note"')
    expect(found?.message).toContain('"opens"')
    expect(found?.message).toContain('"09:00"')
    expect(found?.message).toContain('09:30:00.000')
    expect(found?.message).toContain('one precision')
    expect(found?.message).toContain('timestamp(a) < timestamp(b)')
  })

  test('is not reported at the field’s width', () => {
    // A refusal of a correct rule would make the field unusable in logic.
    expect(crossWidthComparisons(trip([visible('opens > "09:00:00.000"')]))).toEqual([])
  })

  test('is not reported here for a field without precision, which #343 still warns about', () => {
    // Refusing it would turn a valid version-5 document invalid (0236, 0097).
    const schema = trip([visible('plain > "2026-1-5"')])
    expect(crossWidthComparisons(schema)).toEqual([])
    expect(misshapenTemporalLiterals(schema)).toHaveLength(1)
  })

  test('is warned about once: the warning skips a field that declares precision', () => {
    // Warning and refusing the one comparison says it twice, in two voices.
    expect(misshapenTemporalLiterals(trip([visible('opens > "09:00"')]))).toEqual([])
  })
})

describe('two temporal fields compared', () => {
  test('is reported where the precisions differ', () => {
    const [found, ...rest] = crossWidthComparisons(trip([visible('fine < finer')]))

    expect(rest).toEqual([])
    expect(found?.paths).toEqual(['fine', 'finer'])
    expect(found?.literal).toBeUndefined()
    expect(found?.message).toContain('"fine"')
    expect(found?.message).toContain('"finer"')
  })

  test('is not reported where both have one precision', () => {
    // Same shape on both sides orders as time does; refusing it would refuse the rule this feature is for.
    expect(crossWidthComparisons(trip([visible('opens < closes'), visible('finer >= finest')]))).toEqual([])
  })

  test('is reported for a date and a precision-1 time, whose lengths are equal', () => {
    // Both are ten characters; a length test lets the comparison of a date with a time through.
    expect(crossWidthComparisons(trip([visible('leave < coarse')]))).toHaveLength(1)
  })

  test('is reported where only one field declares precision', () => {
    // A field without it is version 5's shape, which is a different width to any declared one.
    expect(crossWidthComparisons(trip([visible('plain < fine')]))).toHaveLength(1)
  })

  test('is not reported for two fields neither of which declares precision', () => {
    // A version-5 document comparing a date with a datetime behaves as today (0067).
    expect(crossWidthComparisons(trip([visible('leave < plain')]))).toEqual([])
  })

  test('is not reported for fields that are not temporal', () => {
    // `note` has no shape of its own to differ from.
    expect(crossWidthComparisons(trip([visible('note == fine')]))).toEqual([])
  })
})

describe('in a row rule', () => {
  test('`item.at` is resolved to its repeater and reported under its model path', () => {
    // Unresolved, `item.at` names no field and the same wrong comparison publishes inside a row.
    const [found] = crossWidthComparisons(trip([visible('item.at < "2026-10-08T10:00:00Z"', 'legs[].at')]))

    expect(found?.paths).toEqual(['legs[].at'])
    expect(found?.message).toContain('"legs[].at"')
  })

  test('`item` is no row outside a row rule', () => {
    // Outside a row `item` is a name like any other, and must not be taken for a repeater's.
    expect(crossWidthComparisons(trip([visible('item.at < "x"')]))).toEqual([])
  })
})
