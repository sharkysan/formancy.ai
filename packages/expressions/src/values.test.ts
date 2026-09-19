import { describe, expect, test } from 'vitest'
import { fixedCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import { evaluate } from './evaluate.js'
import { DEFAULT_VALUE_LIMITS } from './limits.js'
import type { CompileOptions } from './compile.js'
import type { EvaluateOptions } from './evaluate.js'

const capabilities = fixedCapabilities({ nowMs: 0, today: '2026-09-19', random: 0 })

const withDue: CompileOptions = { kind: 'computed', variables: { due: 'timestamp' } }

function run(source: string, values: Record<string, unknown>, options: CompileOptions = withDue) {
  const compiled = compile(source, options)
  if (!compiled.ok) throw compiled.error
  return evaluate(compiled.program, values, { capabilities })
}

function value(source: string, values: Record<string, unknown>) {
  const outcome = run(source, values)
  if (!outcome.ok) throw outcome.error
  return outcome.value
}

function bindFailure(source: string, values: Record<string, unknown>) {
  const outcome = run(source, values)
  if (outcome.ok) throw new Error(`expected binding to fail, got ${String(outcome.value)}`)
  return outcome.error
}

/**
 * The timestamp boundary must be zone-explicit. `new Date('2026-09-19T00:00:00')`
 * parses in HOST-LOCAL time, so the same submission would replay differently on
 * a server in another zone. A value is only accepted when it carries its zone.
 */
describe('binding a declared timestamp', () => {
  test('accepts an ISO 8601 instant in UTC', () => {
    expect(value('string(due)', { due: '2026-09-19T00:00:00Z' })).toBe('2026-09-19T00:00:00Z')
  })

  test('accepts an ISO 8601 instant with a numeric offset', () => {
    // 02:00 at +02:00 is midnight UTC: the offset is honoured, not stripped.
    expect(value('due == timestamp("2026-09-19T00:00:00Z")', { due: '2026-09-19T02:00:00+02:00' })).toBe(
      true,
    )
  })

  test('accepts fractional seconds when the zone is still explicit', () => {
    expect(value('string(due)', { due: '2026-09-19T00:00:00.500Z' })).toBe(
      '2026-09-19T00:00:00.500Z',
    )
  })

  test('accepts a Date instance, which is already an unambiguous instant', () => {
    expect(value('string(due)', { due: new Date(Date.UTC(2026, 8, 19)) })).toBe(
      '2026-09-19T00:00:00Z',
    )
  })

  test('rejects the zone-less string a datetime-local input emits', () => {
    const error = bindFailure('string(due)', { due: '2026-09-19T00:00:00' })

    expect(error.kind).toBe('runtime')
    expect(error.code).toBe('invalid_value')
    expect(error.message).toMatch(/zone/i)
    expect(error.message).toMatch(/due/)
  })

  test('rejects a date without a time, which has no zone either', () => {
    expect(bindFailure('string(due)', { due: '2026-09-19' }).code).toBe('invalid_value')
  })

  test('rejects a free-form date string the host would parse locally', () => {
    expect(bindFailure('string(due)', { due: 'Sep 19 2026' }).code).toBe('invalid_value')
  })

  test('rejects an epoch number, so the boundary has exactly one string form', () => {
    expect(bindFailure('string(due)', { due: 1789776000000 }).code).toBe('invalid_value')
  })

  test('rejects a syntactically ISO string that is not a real instant', () => {
    expect(bindFailure('string(due)', { due: '2026-13-45T00:00:00Z' }).code).toBe('invalid_value')
  })
})

/**
 * The step meter charges reads of the value bag, so what ENTERS the bag has to
 * be bounded too: a four-megabyte string is four million split() elements, and
 * no step budget can price work it never sees coming. The bounds are enforced
 * at binding, deterministically, before any expression code runs.
 */
describe('bounding the values entering an evaluation', () => {
  const withItems: CompileOptions = { kind: 'visible', variables: { items: 'list' } }
  const withS: CompileOptions = { kind: 'visible', variables: { s: 'string' } }

  function outcome(
    source: string,
    values: Record<string, unknown>,
    options: CompileOptions,
    extra?: Partial<EvaluateOptions>,
  ) {
    const compiled = compile(source, options)
    if (!compiled.ok) throw compiled.error
    return evaluate(compiled.program, values, { capabilities, ...extra })
  }

  function limitFailure(
    source: string,
    values: Record<string, unknown>,
    options: CompileOptions,
    extra?: Partial<EvaluateOptions>,
  ) {
    const result = outcome(source, values, options, extra)
    if (result.ok) throw new Error(`expected the values to be rejected`)
    return result.error
  }

  test('rejects a string over the default limit, naming the path and the limit', () => {
    const error = limitFailure(
      's.size() > 0',
      { s: 'a'.repeat(DEFAULT_VALUE_LIMITS.maxStringLength + 1) },
      withS,
    )

    expect(error.kind).toBe('runtime')
    expect(error.code).toBe('value_limit_exceeded')
    expect(error.message).toMatch(/\bs\b/)
    expect(error.message).toContain(String(DEFAULT_VALUE_LIMITS.maxStringLength))
  })

  test('accepts a string exactly at the limit', () => {
    expect(
      outcome('s.size() > 0', { s: 'a'.repeat(DEFAULT_VALUE_LIMITS.maxStringLength) }, withS).ok,
    ).toBe(true)
  })

  test('rejects a list with more elements than the caller allows', () => {
    const error = limitFailure('items.size() > 0', { items: [1, 2, 3, 4] }, withItems, {
      valueLimits: { maxListElements: 3 },
    })

    expect(error.code).toBe('value_limit_exceeded')
    expect(error.message).toMatch(/items/)
    expect(error.message).toContain('3')
  })

  test('rejects an oversized map, wherever it hides', () => {
    const error = limitFailure(
      'items.size() > 0',
      { items: [{ a: 1, b: 2, c: 3 }] },
      withItems,
      { valueLimits: { maxMapEntries: 2 } },
    )

    expect(error.code).toBe('value_limit_exceeded')
    expect(error.message).toContain('items[0]')
  })

  test('names the nested path of an oversized string inside a row', () => {
    const error = limitFailure(
      'items.size() > 0',
      { items: [{ comment: 'too long for the limit' }] },
      withItems,
      { valueLimits: { maxStringLength: 5 } },
    )

    expect(error.code).toBe('value_limit_exceeded')
    expect(error.message).toContain('items[0].comment')
  })

  test('rejects values nested deeper than the caller allows', () => {
    const error = limitFailure('items.size() > 0', { items: [[[1]]] }, withItems, {
      valueLimits: { maxNestingDepth: 2 },
    })

    expect(error.code).toBe('value_limit_exceeded')
    expect(error.message).toContain('2')
  })

  test('accepts an ordinary bag under the defaults', () => {
    const items = Array.from({ length: 50 }, (_, index) => ({ n: index, tag: `row ${index}` }))
    expect(outcome('items.size() > 0', { items }, withItems).ok).toBe(true)
  })
})
