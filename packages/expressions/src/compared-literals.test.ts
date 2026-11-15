import { describe, expect, test } from 'vitest'
import { comparedFields, comparedLiterals } from './compared-literals.js'
import { parse } from './parse.js'

/** Parse or fail the test loudly; every case here is syntactically valid. */
function literalsOf(source: string): ReturnType<typeof comparedLiterals> {
  const result = parse(source)
  if (!result.ok) throw result.error
  return comparedLiterals(result.ast)
}

/**
 * Every place a field is compared with a string, which is what a check needs to tell a
 * date compared with something that is not a date (0236). Each case is a way a comparison
 * is written, and the answer that would hide one or invent one.
 */
describe('comparedLiterals', () => {
  test('finds a field compared with a string, with the operator as written', () => {
    // The literal the condition editor wrote for a date and time until 0235.
    expect(literalsOf('departs > "2026-10-08T10:30"')).toEqual([{ path: 'departs', operator: '>', literal: '2026-10-08T10:30' }])
  })

  test('on whichever side the string stands', () => {
    // Only the left-hand side read, `"2026" <= a.b` would go unseen.
    expect(literalsOf('"2026" <= a.b')).toEqual([{ path: 'a.b', operator: '<=', literal: '2026' }])
  })

  test('at any depth, and every one of them', () => {
    // A guard in front of the comparison is how the editor writes most of them (0127).
    expect(literalsOf('has(trip.leave) && trip.leave != "2026-1-5" || opens == "9:30"')).toEqual([
      { path: 'trip.leave', operator: '!=', literal: '2026-1-5' },
      { path: 'opens', operator: '==', literal: '9:30' },
    ])
  })

  test('naming a field read through brackets as referencedPaths names it', () => {
    // Two spellings of one read must be one path, or a check keyed on paths finds neither.
    expect(literalsOf('trip["leave"] < "x"')).toEqual([{ path: 'trip.leave', operator: '<', literal: 'x' }])
  })

  test('and a row field through `item`, which the caller resolves to its repeater', () => {
    expect(literalsOf('item.departs >= "x"')).toEqual([{ path: 'item.departs', operator: '>=', literal: 'x' }])
  })

  test('but not a comprehension’s own variable, which is no field', () => {
    // `x` is bound by `all`, so `x.at` names nothing in the model; reporting it would
    // invent a comparison with a field that does not exist.
    expect(literalsOf('legs.all(x, x.at == "1")')).toEqual([])
  })

  test('nor a comparison between two fields, or with anything but a string', () => {
    expect(literalsOf('a < b')).toEqual([])
    expect(literalsOf('n > 5.0')).toEqual([])
    expect(literalsOf('"a" == "b"')).toEqual([])
  })

  test('nor a string handed to a function, whose argument is not compared with the field', () => {
    // `timestamp("…")` is a conversion; whether it parses is the evaluator's to say.
    expect(literalsOf('timestamp(at) > timestamp("2026-10-08T08:30:00Z")')).toEqual([])
  })
})

function fieldsOf(source: string): ReturnType<typeof comparedFields> {
  const result = parse(source)
  if (!result.ok) throw result.error
  return comparedFields(result.ast)
}

/**
 * Two fields compared, which `comparedLiterals` cannot see and a check across widths needs
 * (0236's sibling): a precision-3 time against a precision-6 one orders wrongly as text.
 */
describe('comparedFields', () => {
  test('finds two fields compared, as written', () => {
    // Reported turned round, a check could name the wrong field as the left of a rule.
    expect(fieldsOf('startedAt < endedAt')).toEqual([{ left: 'startedAt', right: 'endedAt', operator: '<' }])
  })

  test('gives none for a field against a literal', () => {
    // That is comparedLiterals' answer; reporting it here too would say one comparison twice.
    expect(fieldsOf('startedAt < "2026-10-08T08:30:00Z"')).toEqual([])
  })

  test('gives none through a comprehension’s variable', () => {
    // The named limit, decided in 0237: `s` is bound by `all`, so `s.at` is no field, and the
    // pair with `startedAt` goes unseen. Seeing it means teaching this package what the
    // variable stands for, which 0236 declined on purpose.
    expect(fieldsOf('steps.all(s, s.at >= startedAt)')).toEqual([])
  })
})
