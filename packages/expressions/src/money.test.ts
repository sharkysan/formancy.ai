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

  test('quotes the literal that actually offends, not the first one anywhere', () => {
    // The first numeric literal in source order is round's `2`, which is fine
    // where it is; following a dec("2") hint would produce a fresh type error.
    const error = rejection('round(price, 2) * 0.19')

    expect(error.hint).toMatch(/dec\("0\.19"\)/)
    expect(error.hint).not.toMatch(/dec\("2"\)/)
  })

  test('gives advice without inventing a literal when none is in the source', () => {
    const error = rejection('price * rate')

    expect(error.hint).toMatch(/dec\(/)
    expect(error.hint).not.toMatch(/0\.19/)
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

  test('divides at the documented maximum number of places', () => {
    // 19.90 / 3 to 20 places; the guard digit is internal and must not make
    // an expression that check() accepted die at evaluation.
    expect(moneyValue('string(divide(price, dec("3"), 20))')).toBe('6.63333333333333333333')
  })

  test('reports the real ceiling when one more place is asked for', () => {
    const compiled = compile('string(divide(price, dec("3"), 21))', money)
    if (!compiled.ok) throw compiled.error
    const result = evaluate(compiled.program, values, { capabilities })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('invalid_value')
    expect(result.error.message).toMatch(/maximum of 20/)
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

/**
 * Equality is the one operator CEL degrades silently: with no decimal overload
 * matching, a universal fallback answers `false` for two equal amounts. That
 * fallback must never be reachable for money, in either direction, at either
 * gate.
 */
describe('decimal equality never answers a silent false', () => {
  const optional: CompileOptions = {
    kind: 'visible',
    variables: { price: 'decimal', discount: 'dyn' },
  }
  const bag = { price: '19.90', discount: '19.90' }

  test('rejects == between a decimal and a dyn field when the form is saved', () => {
    const error = rejection('price == discount', optional)

    expect(error.kind).toBe('type')
    expect(error.code).toBe('decimal_equality_mismatch')
    expect(error.hint).toMatch(/dec\(discount\)/)
  })

  test('rejects != the same way, because it is derived from ==', () => {
    expect(rejection('price != discount', optional).code).toBe('decimal_equality_mismatch')
  })

  test('rejects == against a statically known non-decimal', () => {
    expect(rejection('price == "19.90"', optional).code).toBe('decimal_equality_mismatch')
    expect(rejection('price == 19.90', optional).hint).toMatch(/dec\("19\.90"\)/)
  })

  test('accepts the dec() workaround and compares by value', () => {
    const compiled = compile('price == dec(discount)', optional)
    if (!compiled.ok) throw compiled.error

    const equal = evaluate(compiled.program, bag, { capabilities })
    expect(equal).toEqual({ ok: true, value: true, steps: expect.any(Number) })

    const different = evaluate(compiled.program, { price: '19.90', discount: '19.91' }, { capabilities })
    expect(different).toEqual({ ok: true, value: false, steps: expect.any(Number) })
  })

  test('accepts the dec() workaround for != too', () => {
    const compiled = compile('price != dec(discount)', optional)
    if (!compiled.ok) throw compiled.error

    expect(evaluate(compiled.program, bag, { capabilities })).toEqual({
      ok: true,
      value: false,
      steps: expect.any(Number),
    })
  })

  test('errors loudly when a decimal meets a non-decimal only at runtime', () => {
    // Both sides are dyn, so the static gate cannot see the mismatch; the
    // runtime operator must error rather than let the false fallback answer.
    const compiled = compile('a == b', { kind: 'visible', variables: { a: 'dyn', b: 'dyn' } })
    if (!compiled.ok) throw compiled.error

    const result = evaluate(
      compiled.program,
      { a: new Decimal(1990n, 2), b: '19.90' },
      { capabilities },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('runtime')
    expect(result.error.message).toMatch(/decimal/)
  })

  test('still compares two decimals that only meet at runtime', () => {
    const compiled = compile('a == b', { kind: 'visible', variables: { a: 'dyn', b: 'dyn' } })
    if (!compiled.ok) throw compiled.error

    expect(
      evaluate(compiled.program, { a: new Decimal(1990n, 2), b: new Decimal(199n, 1) }, { capabilities }),
    ).toEqual({ ok: true, value: true, steps: expect.any(Number) })
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
