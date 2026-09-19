import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { describedBy, fieldIds } from './ids.js'

describe('fieldIds', () => {
  test('mints one id per part, deterministically', () => {
    const first = fieldIds('contact', ['address', 'city'])
    const second = fieldIds('contact', ['address', 'city'])

    expect(first).toEqual(second)
    expect(new Set(Object.values(first)).size).toBe(5)
  })

  test('ids are stable strings with no whitespace, so they are valid HTML ids', () => {
    const ids = fieldIds('contact', ['items', 2, 'name'])
    for (const id of Object.values(ids)) {
      expect(id).toMatch(/^\S+$/)
    }
  })

  test('two different fields can never share an id', () => {
    const arbKey = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_-]{0,8}$/)
    const arbPath = fc.array(fc.oneof(arbKey, fc.nat({ max: 99 })), { minLength: 1, maxLength: 4 })
    fc.assert(
      fc.property(arbKey, arbPath, arbKey, arbPath, (formA, pathA, formB, pathB) => {
        fc.pre(formA !== formB || JSON.stringify(pathA) !== JSON.stringify(pathB))
        // The dashed flattening trap: formId "a-b" + path "c" must not collide
        // with formId "a" + path "b-c" — hence generators that allow dashes.
        expect(fieldIds(formA, pathA).control).not.toBe(fieldIds(formB, pathB).control)
      }),
    )
  })

  test('rejects a form id containing the separator, instead of silently colliding', () => {
    expect(() => fieldIds('a:b', ['x'])).toThrow(/:/)
  })
})

describe('describedBy', () => {
  const ids = fieldIds('contact', ['email'])

  test('composes hint, then description, then error — the order screen readers announce', () => {
    expect(describedBy(ids, { hint: true, description: true, error: true })).toBe(
      `${ids.hint} ${ids.description} ${ids.error}`,
    )
  })

  test('includes only the parts that are present', () => {
    expect(describedBy(ids, { error: true })).toBe(ids.error)
    expect(describedBy(ids, { hint: true, error: true })).toBe(`${ids.hint} ${ids.error}`)
  })

  test('returns undefined when nothing is present, so the attribute is omitted entirely', () => {
    expect(describedBy(ids, {})).toBeUndefined()
  })
})
