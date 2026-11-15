import { describe, expect, test } from 'vitest'
import { comparedLiterals } from './compared-literals.js'
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
