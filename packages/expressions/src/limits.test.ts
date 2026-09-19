import { describe, expect, test } from 'vitest'
import { DEFAULT_LIMITS } from './limits.js'
import { parse } from './parse.js'
import type { StructuralLimits } from './limits.js'

/** The limit error for `source`, asserted to be a rejection rather than a pass. */
function rejection(source: string, limits: Partial<StructuralLimits>) {
  const result = parse(source, { limits })
  if (result.ok) throw new Error(`expected ${source} to be rejected`)
  return result.error
}

describe('structural limits', () => {
  test('accepts an ordinary form expression under the defaults', () => {
    expect(parse('items.filter(i, i.active).size() > 0 && total > 100').ok).toBe(true)
  })

  test('rejects an expression with too many AST nodes', () => {
    expect(rejection('1 + 2 + 3 + 4 + 5 + 6', { maxAstNodes: 5 }).kind).toBe('limit')
  })

  test('rejects an expression nested deeper than the limit', () => {
    expect(rejection('a.b.c.d.e.f', { maxDepth: 3 }).kind).toBe('limit')
  })

  test('rejects a list literal with too many elements', () => {
    expect(rejection('[1, 2, 3]', { maxListElements: 2 }).kind).toBe('limit')
  })

  test('rejects a map literal with too many entries', () => {
    expect(rejection('{"a": 1, "b": 2}', { maxMapEntries: 1 }).kind).toBe('limit')
  })

  test('rejects a call with too many arguments', () => {
    expect(rejection('f(1, 2, 3)', { maxCallArguments: 2 }).kind).toBe('limit')
  })

  test('rejects a string literal longer than the limit', () => {
    const error = rejection('"abcdefgh" == name', { maxStringLiteralLength: 4 })
    expect(error.kind).toBe('limit')
    expect(error.code).toBe('string_literal_too_long')
    expect(error.position).toEqual({ start: 0, end: 10 })
  })

  test('rejects comprehensions nested deeper than the limit', () => {
    const error = rejection('a.all(x, b.all(y, x == y))', { maxComprehensionDepth: 1 })
    expect(error.kind).toBe('limit')
    expect(error.code).toBe('comprehension_too_deep')
  })

  test('allows comprehension nesting up to the limit', () => {
    expect(parse('a.all(x, b.all(y, x == y))', { limits: { maxComprehensionDepth: 2 } }).ok).toBe(
      true,
    )
  })

  test('has defaults small enough that the worst case stays cheap', () => {
    expect(DEFAULT_LIMITS.maxComprehensionDepth).toBeLessThanOrEqual(3)
    expect(DEFAULT_LIMITS.maxAstNodes).toBeLessThanOrEqual(1000)
  })
})
