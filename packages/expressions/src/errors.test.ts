import { describe, expect, test } from 'vitest'
import { ExpressionError } from './errors.js'

describe('ExpressionError', () => {
  test('carries the expression source, a position and an author-readable message', () => {
    const error = new ExpressionError({
      kind: 'syntax',
      code: 'unexpected_token',
      message: 'Unexpected end of expression.',
      source: 'total +',
      position: { start: 7, end: 7 },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ExpressionError')
    expect(error.kind).toBe('syntax')
    expect(error.code).toBe('unexpected_token')
    expect(error.source).toBe('total +')
    expect(error.position).toEqual({ start: 7, end: 7 })
    expect(error.message).toBe('Unexpected end of expression.')
  })
})
