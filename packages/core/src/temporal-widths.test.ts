import { describe, expect, test } from 'vitest'
import { compile } from '@formancy/expressions'
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

/** Each expression a message offers, as code: what an author copies into the rule. */
const offered = (message: string | undefined): string[] => [...(message ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]!)

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

describe('what else is and is not a cross-width comparison', () => {
  test('an empty literal is refused, and the message says how to ask whether it was answered', () => {
    // `opens != ""` is the usual "was answered" test and is wrong: an unanswered field holds
    // null, so the rule is always true. Only a version-6 document can declare a precision, so
    // refusing invalidates nothing already published (0097, 0236). The message must give the
    // idiom that works, not three width remedies for a literal that never meant a time.
    const [found, ...rest] = crossWidthComparisons(trip([visible('opens != ""')]))

    expect(rest).toEqual([])
    expect(found?.literal).toBe('')
    // `has()` takes only a member, so `has(opens)` does not compile: at the top of the form
    // the way to ask is `!= null`, and a message offering both sent the author to a refusal.
    expect(offered(found?.message)).toEqual(['opens != null'])
    expect(found?.message).not.toContain('timestamp(a)')
  })

  test('in a row rule, the empty literal is answered with the read the rule wrote, and the test a row answers', () => {
    // `has(legs[].at)` is no expression at all, and `has(item.at)` is always true in a row,
    // which presents every key: the one test that asks there is `!= null`, on `item.at`.
    const [found] = crossWidthComparisons(trip([visible('item.at != ""', 'legs[].at')]))

    expect(offered(found?.message)).toEqual(['item.at != null'])
  })

  test('inside a group, the empty literal is answered with `has()`', () => {
    // Reading a member of a group nobody answered fails, and a rule that fails shows its
    // field (fail open), so `stay.at != null` would be wrong there; `has()` answers.
    const schema = trip([visible('stay.at != ""')])
    schema.model.fields.push({ key: 'stay', type: 'group', fields: [{ key: 'at', type: 'time', label: 'At', precision: 3 }] })

    expect(offered(crossWidthComparisons(schema)[0]?.message)).toEqual(['has(stay.at)'])
  })

  test('each way the empty literal message offers compiles as the rule it would replace', () => {
    // A sentence naming an idiom the parser refuses is a second refusal, at the next publish.
    const schema = trip([visible('opens != ""'), visible('item.at != ""', 'legs[].at'), visible('stay.at != ""')])
    schema.model.fields.push({ key: 'stay', type: 'group', fields: [{ key: 'at', type: 'time', label: 'At', precision: 3 }] })
    const idioms = crossWidthComparisons(schema).flatMap(({ message }) => offered(message))

    expect(idioms).toHaveLength(3)
    for (const idiom of idioms) {
      const compiled = compile(idiom, { kind: 'visible', variables: { opens: 'dyn', item: 'dyn', stay: 'dyn' } })
      expect(compiled.ok, idiom).toBe(true)
    }
  })

  test('a datetime without precision and one at precision 0 share a shape and are not reported', () => {
    // Both are whole seconds. A later change to the shape function that told them apart would
    // silently refuse a comparison that orders correctly.
    const schema = trip([visible('plain < zero')])
    schema.model.fields.push({ key: 'zero', type: 'datetime', label: 'Zero', precision: 0 })
    expect(crossWidthComparisons(schema)).toEqual([])
  })

  test('a literal on the left is reported as one on the right is', () => {
    // Reading only the right-hand side would let `"09:00" < opens` publish.
    expect(crossWidthComparisons(trip([visible('"09:00" < opens')]))).toHaveLength(1)
  })

  test('every comparison operator is seen, not only the ordering ones', () => {
    // `==` is the one that holds for nobody; a check on `<` alone would miss it.
    for (const operator of ['>=', '<=', '==', '!=']) {
      expect(crossWidthComparisons(trip([visible(`opens ${operator} "09:00"`)]))).toHaveLength(1)
    }
  })

  test('two fields compared through `item` in a row rule resolve to their model path', () => {
    // Unresolved, `item.at` names no field and a cross-width pair inside a row publishes.
    const schema = trip([visible('item.at < fine', 'legs[].at')])
    const [found] = crossWidthComparisons(schema)
    // `fine` is precision 3 like legs[].at, so make the widths differ.
    expect(found).toBeUndefined()
    const differing = trip([visible('item.at < finer', 'legs[].at')])
    expect(crossWidthComparisons(differing)[0]?.paths).toEqual(['legs[].at', 'finer'])
  })
})
