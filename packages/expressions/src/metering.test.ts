import { describe, expect, test } from 'vitest'
import { fixedCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import { evaluate } from './evaluate.js'
import type { CompileOptions } from './compile.js'
import type { EvaluateOptions } from './evaluate.js'

const capabilities = fixedCapabilities({ nowMs: 0, today: '2026-09-19', random: 0 })

const withS: CompileOptions = { kind: 'visible', variables: { s: 'string' } }

function program(source: string, options: CompileOptions) {
  const compiled = compile(source, options)
  if (!compiled.ok) throw compiled.error
  return compiled.program
}

function run(
  source: string,
  values: Record<string, unknown>,
  options: CompileOptions = withS,
  extra?: Partial<EvaluateOptions>,
) {
  return evaluate(program(source, options), values, { capabilities, ...extra })
}

/**
 * The reviewer's amplification shape: a collection produced INSIDE the
 * expression, iterated with more internal work per element. Nothing here reads
 * the value bag per iteration, so before internal metering the whole walk was
 * free and its cost was linear in a field's length.
 */
const AMPLIFIER = 's.split("").map(c, "abcdefgh".split("").exists(d, d == "z")).size() > 0'

describe('collections produced inside an expression are metered', () => {
  test('the oversized repro fails fast on the value bound, identically every time', () => {
    const compiled = program(AMPLIFIER, withS)
    const values = { s: 'a'.repeat(4_000_000) }

    const started = Date.now()
    const first = evaluate(compiled, values, { capabilities })
    const second = evaluate(compiled, values, { capabilities })
    const elapsed = Date.now() - started

    expect(first.ok).toBe(false)
    if (first.ok || second.ok) return
    expect(first.error.code).toBe('value_limit_exceeded')
    expect(first.error.message).toMatch(/\bs\b/)
    expect(second.error.code).toBe(first.error.code)
    expect(second.error.message).toBe(first.error.message)
    // "Deterministic and quick": both refusals together, without evaluating.
    expect(elapsed).toBeLessThan(500)
  })

  test('the repro at a legal field length fails on steps, identically every time', () => {
    const compiled = program(AMPLIFIER, withS)
    const values = { s: 'a'.repeat(16_000) }

    const first = evaluate(compiled, values, { capabilities })
    const second = evaluate(compiled, values, { capabilities })

    expect(first.ok).toBe(false)
    if (first.ok || second.ok) return
    expect(first.error.kind).toBe('budget')
    expect(first.error.code).toBe('steps_exceeded')
    expect(second.error.code).toBe(first.error.code)
    expect(second.error.message).toBe(first.error.message)
  })

  test('split charges in proportion to the list it produces', () => {
    const outcome = run('s.split("").size() > 0', { s: 'a'.repeat(1000) })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.steps).toBeGreaterThanOrEqual(1000)
  })

  test('iterating an internal collection charges per element', () => {
    const outcome = run('s.split("").exists(c, c == "z")', { s: 'a'.repeat(500) })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // Production of the 500-element list plus one step per iteration.
    expect(outcome.steps).toBeGreaterThanOrEqual(1000)
  })

  test('the same evaluation costs the same steps every time', () => {
    const compiled = program('s.split("").exists(c, c == "z")', withS)
    const values = { s: 'a'.repeat(200) }

    const first = evaluate(compiled, values, { capabilities })
    const second = evaluate(compiled, values, { capabilities })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.steps).toBe(second.steps)
  })

  test('string concatenation charges in proportion to what it builds', () => {
    const outcome = run(
      '(s + s + s + s).contains("z")',
      { s: 'a'.repeat(6400) },
      withS,
      { budget: { maxSteps: 100 } },
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.code).toBe('steps_exceeded')
  })

  test('a string scan inside a comprehension charges by what it scans', () => {
    // contains() walks its receiver on every iteration; unpriced, a bounded
    // field rescanned thousands of times is still a lot of free CPU.
    const outcome = run(
      'items.all(x, s.contains("z") == false)',
      { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], s: 'a'.repeat(6400) },
      { kind: 'visible', variables: { items: 'list', s: 'string' } },
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // Ten iterations, each charged ~6400/64 for the scan.
    expect(outcome.steps).toBeGreaterThanOrEqual(1000)
  })

  test('a comprehension over a literal collection still pays per iteration', () => {
    const outcome = run('[1, 2, 3, 4].all(x, x > 0)', {}, { kind: 'visible', variables: {} })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.steps).toBeGreaterThanOrEqual(4)
  })

  test('ordinary form expressions stay far below the default budget', () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ n: index }))
    const outcome = run('items.all(x, x.n >= 0)', { items }, {
      kind: 'visible',
      variables: { items: 'list' },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.value).toBe(true)
    expect(outcome.steps).toBeLessThan(2000)
  })
})
