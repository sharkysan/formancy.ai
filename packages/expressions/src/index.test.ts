/**
 * The public entry point, exercised the way the engine will use it: compile
 * once when the form is saved, evaluate once per pass, with one frozen set of
 * capabilities shared by every expression in that pass.
 */
import { describe, expect, test } from 'vitest'
import {
  captureCapabilities,
  compile,
  decimalToString,
  evaluate,
  parse,
  referencedPaths,
} from './index.js'
import type { Capabilities, Decimal, VariableDeclarations } from './index.js'

const variables: VariableDeclarations = {
  quantity: 'int',
  unitPrice: 'decimal',
  newsletter: 'bool',
}

const pass: Capabilities = captureCapabilities({
  now: () => Date.UTC(2026, 8, 19, 8, 0, 0),
  today: () => '2026-09-19',
  random: () => 0.5,
})

describe('an order form, end to end', () => {
  test('computes a line total exactly', () => {
    const compiled = compile('round(dec(quantity) * unitPrice, 2)', {
      kind: 'computed',
      variables,
    })
    if (!compiled.ok) throw compiled.error

    expect(compiled.program.references).toEqual(['quantity', 'unitPrice'])
    expect(compiled.program.resultType).toBe('decimal')

    const result = evaluate(
      compiled.program,
      { quantity: 3, unitPrice: '19.99', newsletter: false },
      { capabilities: pass },
    )
    if (!result.ok) throw result.error

    expect(decimalToString(result.value as Decimal)).toBe('59.97')
  })

  test('decides visibility, and refuses to save an expression that cannot', () => {
    const shown = compile('quantity > 0 && newsletter', { kind: 'visible', variables })
    expect(shown.ok).toBe(true)

    const wrong = compile('quantity', { kind: 'visible', variables })
    expect(wrong.ok).toBe(false)
  })

  test('answers what an expression reads without needing a schema for it', () => {
    const parsed = parse('lines.exists(line, line.sku == wanted)')
    if (!parsed.ok) throw parsed.error

    expect(referencedPaths(parsed.ast)).toEqual(['lines', 'wanted'])
  })
})
