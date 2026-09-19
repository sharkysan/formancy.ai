import { describe, expect, test } from 'vitest'
import { fixedCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import { Decimal, decimalToString } from './decimal.js'
import { evaluate } from './evaluate.js'
import type { CompileOptions } from './compile.js'

const capabilities = fixedCapabilities({ nowMs: 0, today: '2026-09-19', random: 0 })

const money: CompileOptions = {
  kind: 'computed',
  variables: { price: 'decimal', quantity: 'int', rate: 'double' },
}

const values = { price: '19.90', quantity: 3, rate: 0.19 }

function moneyValue(source: string, bag: Record<string, unknown> = values) {
  const compiled = compile(source, money)
  if (!compiled.ok) throw compiled.error
  const result = evaluate(compiled.program, bag, { capabilities })
  if (!result.ok) throw result.error
  return result.value
}

function rejection(source: string, options: CompileOptions = money) {
  const compiled = compile(source, options)
  if (compiled.ok) throw new Error(`expected ${source} to be rejected`)
  return compiled.error
}

describe('money cannot be mixed with doubles', () => {
  test('rejects a decimal times a double literal when the form is saved', () => {
    const error = rejection('price * 0.19')

    expect(error.kind).toBe('type')
    expect(error.message).toMatch(/decimal/)
    expect(error.hint).toMatch(/dec\("0\.19"\)/)
  })

  test('rejects a decimal times a declared double', () => {
    expect(rejection('price * rate').kind).toBe('type')
  })

  test('rejects comparing money against a bare integer', () => {
    const error = rejection('price > 0')

    expect(error.kind).toBe('type')
    expect(error.hint).toMatch(/dec\(/)
  })

  test('accepts the explicit form and evaluates it exactly', () => {
    expect(moneyValue('string(price * dec("0.19"))')).toBe('3.7810')
  })

  test('accepts an integer quantity converted on purpose', () => {
    expect(moneyValue('string(dec(quantity) * price)')).toBe('59.70')
  })
})

describe('decimal arithmetic through CEL keeps what a double loses', () => {
  test('adds a tenth and a fifth and gets exactly three tenths', () => {
    expect(moneyValue('dec("0.1") + dec("0.2") == dec("0.3")')).toBe(true)
    expect(moneyValue('string(dec("0.1") + dec("0.2"))')).toBe('0.3')

    // The same sum in the type CEL would otherwise have used.
    expect(0.1 + 0.2 === 0.3).toBe(false)
  })

  test('rounds a VAT amount to the cent', () => {
    expect(moneyValue('string(round(price * dec("0.19"), 2))')).toBe('3.78')
  })

  test('divides only when told how many places to keep', () => {
    expect(moneyValue('string(divide(price, dec("3"), 2))')).toBe('6.63')
    expect(rejection('price / dec("3")').kind).toBe('type')
  })

  test('compares by value, so a trailing zero does not change the answer', () => {
    expect(moneyValue('dec("19.90") == price')).toBe(true)
  })

  test('returns money as a Decimal rather than as a lossy number', () => {
    const total = moneyValue('price * dec("0.19")')

    expect(total).toBeInstanceOf(Decimal)
    expect(decimalToString(total as Decimal)).toBe('3.7810')
  })
})

describe('decimal literals are checked before they are stored', () => {
  test('rejects a dec() literal that is not a decimal number', () => {
    const error = rejection('dec("nineteen ninety")')

    expect(error.kind).toBe('type')
    expect(error.code).toBe('invalid_decimal_literal')
  })

  test('accepts a well-formed literal', () => {
    expect(compile('dec("19.90")', money).ok).toBe(true)
  })
})

describe('money values crossing the boundary', () => {
  test('reads the written decimal string a form field holds', () => {
    expect(moneyValue('string(price)', { ...values, price: '0.05' })).toBe('0.05')
  })

  test('refuses a JavaScript number for a money field', () => {
    const compiled = compile('string(price)', money)
    if (!compiled.ok) throw compiled.error

    const result = evaluate(compiled.program, { ...values, price: 19.9 }, { capabilities })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('invalid_value')
    expect(result.error.message).toMatch(/precision/)
  })
})
