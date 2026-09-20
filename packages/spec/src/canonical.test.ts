import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { canonicalize } from './canonical.js'

describe('canonicalize', () => {
  test('produces identical output for objects differing only in key order', () => {
    const a = { title: 'Contact', model: { fields: [] }, specVersion: '1' }
    const b = { specVersion: '1', model: { fields: [] }, title: 'Contact' }

    expect(canonicalize(a)).toBe(canonicalize(b))
  })
})

describe('canonicalize round-trip', () => {
  test('is stable: re-canonicalizing a parsed canonical form is a fixed point', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = canonicalize(value)
        expect(canonicalize(JSON.parse(once))).toBe(once)
      }),
    )
  })
})

describe('canonicalize rejects non-JSON values', () => {
  // A schema carrying `undefined` or `NaN` must not hash successfully. JSON
  // stringification would silently drop or coerce it, so two different schemas
  // would share a hash — which breaks the tamper evidence submissions rely on.
  test.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a function', () => 'nope'],
    ['a bigint', 10n],
  ])('throws on %s', (_label, value) => {
    expect(() => canonicalize({ field: value })).toThrow()
  })
})
