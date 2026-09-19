import { describe, expect, test } from 'vitest'
import { parse } from './parse.js'

describe('parse', () => {
  test('returns an AST handle for a syntactically valid expression', () => {
    const result = parse('total > 1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ast.source).toBe('total > 1')
  })

  test('reports a syntax error as an ExpressionError with a position', () => {
    const result = parse('total +')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.name).toBe('ExpressionError')
    expect(result.error.kind).toBe('syntax')
    expect(result.error.source).toBe('total +')
    expect(result.error.position).toEqual({ start: 7, end: 7 })
  })
})
