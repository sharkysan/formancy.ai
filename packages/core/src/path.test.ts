import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { formatPath, parsePath } from './path.js'

describe('parsePath', () => {
  test('parses a bare key', () => {
    expect(parsePath('email')).toEqual(['email'])
  })

  test('parses dotted member access', () => {
    expect(parsePath('address.city')).toEqual(['address', 'city'])
  })

  test('parses bracket indices as numbers', () => {
    expect(parsePath('items[2].name')).toEqual(['items', 2, 'name'])
  })

  test('parses consecutive indices', () => {
    expect(parsePath('grid[0][3]')).toEqual(['grid', 0, 3])
  })

  test('parses the empty string as the root path', () => {
    expect(parsePath('')).toEqual([])
  })

  test.each([
    ['unclosed bracket', 'items['],
    ['empty segment', 'a..b'],
    ['trailing dot', 'a.'],
    ['leading dot', '.a'],
    ['non-numeric index', 'items[x]'],
    ['negative index', 'items[-1]'],
    ['dot before bracket', 'items.[0]'],
  ])('rejects %s (%s)', (_label, input) => {
    expect(() => parsePath(input)).toThrow()
  })
})

describe('formatPath', () => {
  test('formats keys and indices back to the wire form', () => {
    expect(formatPath(['items', 2, 'name'])).toBe('items[2].name')
  })

  test('formats the root path as the empty string', () => {
    expect(formatPath([])).toBe('')
  })

  test('round-trips every path parsePath accepts', () => {
    const arbSegment = fc.oneof(
      fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,10}$/),
      fc.nat({ max: 999 }),
    )
    fc.assert(
      fc.property(fc.array(arbSegment, { maxLength: 6 }), (segments) => {
        // An index cannot be the first segment in the wire form we emit; skip those.
        fc.pre(typeof segments[0] !== 'number' || segments.length === 0)
        const wire = formatPath(segments)
        expect(parsePath(wire)).toEqual(segments)
      }),
    )
  })
})

describe('formatPath rejects keys that cannot round-trip', () => {
  // A key containing a structural character would parse back as a different
  // path — a silent identity change on the wire. Refuse instead.
  test.each([
    ['a dot', 'first.name'],
    ['a bracket', 'a[b'],
    ['a closing bracket', 'a]b'],
    ['the empty string', ''],
  ])('throws on a key containing %s', (_label, key) => {
    expect(() => formatPath([key])).toThrow()
  })

  test('throws on a fractional or negative index', () => {
    expect(() => formatPath(['items', 1.5])).toThrow()
    expect(() => formatPath(['items', -1])).toThrow()
  })
})
