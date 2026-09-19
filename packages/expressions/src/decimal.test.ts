import { describe, expect, test } from 'vitest'
import {
  Decimal,
  addDecimal,
  compareDecimal,
  decimalFromString,
  decimalToString,
  divideDecimal,
  multiplyDecimal,
  negateDecimal,
  roundDecimal,
  subtractDecimal,
} from './decimal.js'

describe('decimalFromString', () => {
  test('keeps the written scale, because 19.90 and 19.9 display differently', () => {
    expect(decimalFromString('19.90')).toEqual(new Decimal(1990n, 2))
    expect(decimalFromString('19.9')).toEqual(new Decimal(199n, 1))
  })

  test('reads integers, negatives and a leading plus', () => {
    expect(decimalFromString('42')).toEqual(new Decimal(42n, 0))
    expect(decimalFromString('-0.05')).toEqual(new Decimal(-5n, 2))
    expect(decimalFromString('+1.5')).toEqual(new Decimal(15n, 1))
  })

  test('rejects anything that is not a plain decimal number', () => {
    for (const bad of ['', 'abc', '1.2.3', '1e5', ' 1', '1 ', '1,5', '.', '-']) {
      expect(() => decimalFromString(bad)).toThrow(RangeError)
    }
  })

  test('rejects more decimal places than the arithmetic will carry', () => {
    expect(() => decimalFromString(`0.${'1'.repeat(21)}`)).toThrow(RangeError)
  })
})

describe('decimalToString', () => {
  test('round-trips the written form', () => {
    for (const text of ['19.90', '0.001', '-0.05', '42', '-7.25']) {
      expect(decimalToString(decimalFromString(text))).toBe(text.replace('+', ''))
    }
  })

  test('pads to the scale', () => {
    expect(decimalToString(new Decimal(5n, 3))).toBe('0.005')
    expect(decimalToString(new Decimal(-5n, 3))).toBe('-0.005')
  })
})

describe('decimal arithmetic is exact', () => {
  test('adds the way a person adds, unlike a double', () => {
    const sum = addDecimal(decimalFromString('0.1'), decimalFromString('0.2'))

    expect(decimalToString(sum)).toBe('0.3')
    expect(compareDecimal(sum, decimalFromString('0.3'))).toBe(0)
    // The trap this type exists to avoid.
    expect(0.1 + 0.2).not.toBe(0.3)
  })

  test('aligns differing scales before adding', () => {
    expect(decimalToString(addDecimal(decimalFromString('1.5'), decimalFromString('0.25')))).toBe(
      '1.75',
    )
  })

  test('subtracts exactly', () => {
    expect(
      decimalToString(subtractDecimal(decimalFromString('0.3'), decimalFromString('0.1'))),
    ).toBe('0.2')
  })

  test('multiplies into the sum of the scales, losing nothing', () => {
    const net = decimalFromString('19.90')
    const vatRate = decimalFromString('0.19')

    expect(decimalToString(multiplyDecimal(net, vatRate))).toBe('3.7810')
  })

  test('negates', () => {
    expect(decimalToString(negateDecimal(decimalFromString('1.25')))).toBe('-1.25')
  })
})

describe('compareDecimal', () => {
  test('compares by value, not by representation', () => {
    expect(compareDecimal(decimalFromString('1.50'), decimalFromString('1.5'))).toBe(0)
    expect(compareDecimal(decimalFromString('1.5'), decimalFromString('1.05'))).toBe(1)
    expect(compareDecimal(decimalFromString('-2'), decimalFromString('-1.99'))).toBe(-1)
  })
})

describe('roundDecimal', () => {
  test('rounds half away from zero, which is what an invoice does', () => {
    expect(decimalToString(roundDecimal(decimalFromString('3.7810'), 2))).toBe('3.78')
    expect(decimalToString(roundDecimal(decimalFromString('2.345'), 2))).toBe('2.35')
    expect(decimalToString(roundDecimal(decimalFromString('-2.345'), 2))).toBe('-2.35')
    expect(decimalToString(roundDecimal(decimalFromString('2.344'), 2))).toBe('2.34')
  })

  test('pads rather than truncates when asked for more places', () => {
    expect(decimalToString(roundDecimal(decimalFromString('2.5'), 3))).toBe('2.500')
  })

  test('rejects a negative number of places', () => {
    expect(() => roundDecimal(decimalFromString('1'), -1)).toThrow(RangeError)
  })
})

describe('divideDecimal', () => {
  test('needs the number of places, because division does not stay exact', () => {
    expect(decimalToString(divideDecimal(decimalFromString('10'), decimalFromString('3'), 4))).toBe(
      '3.3333',
    )
    expect(decimalToString(divideDecimal(decimalFromString('10'), decimalFromString('4'), 2))).toBe(
      '2.50',
    )
  })

  test('rounds half away from zero at the requested place', () => {
    expect(decimalToString(divideDecimal(decimalFromString('2'), decimalFromString('3'), 2))).toBe(
      '0.67',
    )
    expect(decimalToString(divideDecimal(decimalFromString('-2'), decimalFromString('3'), 2))).toBe(
      '-0.67',
    )
  })

  test('refuses to divide by zero', () => {
    expect(() => divideDecimal(decimalFromString('1'), decimalFromString('0'), 2)).toThrow(
      RangeError,
    )
  })
})

describe('the scale ceiling', () => {
  test('rejects a product whose scale would run away', () => {
    const deep = new Decimal(1n, 15)
    expect(() => multiplyDecimal(deep, deep)).toThrow(RangeError)
  })
})
