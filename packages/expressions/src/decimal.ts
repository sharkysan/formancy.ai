/**
 * Exact decimal arithmetic on scaled integers.
 *
 * A form that adds up money must not hold it in a double: 0.1 + 0.2 is
 * 0.30000000000000004 in IEEE 754, and a total that is off by a cent is a
 * support ticket at best. CEL's numeric types are int64, uint64 and double, so
 * `decimal` is registered as our own type rather than reused from the language.
 */

/**
 * The most decimal places a value may carry. Multiplication adds the scales of
 * its operands, so without a ceiling a chain of products grows the underlying
 * integer without bound and turns an innocuous expression into an expensive
 * one. Twenty places is far past anything money or a tax rate needs.
 */
export const MAX_DECIMAL_SCALE = 20

export class Decimal {
  /** The value as an integer, scaled by 10^scale. */
  readonly units: bigint
  /** Digits after the decimal point. Never negative. */
  readonly scale: number

  constructor(units: bigint, scale: number) {
    assertScale(scale)
    this.units = units
    this.scale = scale
    Object.freeze(this)
  }
}

const DECIMAL_TEXT = /^[+-]?\d+(?:\.\d+)?$/

/**
 * Parse the written form of a decimal, keeping its scale.
 *
 * `19.90` and `19.9` are the same number and a different price tag, so the
 * trailing zero survives; only `compareDecimal` ignores it.
 */
export function decimalFromString(text: string): Decimal {
  if (!DECIMAL_TEXT.test(text)) {
    throw new RangeError(`Not a decimal number: ${JSON.stringify(text)}`)
  }

  const negative = text.startsWith('-')
  const unsigned = text.startsWith('+') || negative ? text.slice(1) : text
  const point = unsigned.indexOf('.')
  const digits = point === -1 ? unsigned : unsigned.slice(0, point) + unsigned.slice(point + 1)
  const scale = point === -1 ? 0 : unsigned.length - point - 1

  assertScale(scale)
  const units = BigInt(digits)
  return new Decimal(negative ? -units : units, scale)
}

export function decimalToString(value: Decimal): string {
  const negative = value.units < 0n
  const digits = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, '0')
  const whole = digits.slice(0, digits.length - value.scale)
  const fraction = value.scale === 0 ? '' : `.${digits.slice(digits.length - value.scale)}`
  return `${negative ? '-' : ''}${whole}${fraction}`
}

export function addDecimal(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale)
  return new Decimal(rescale(a, scale) + rescale(b, scale), scale)
}

export function subtractDecimal(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale)
  return new Decimal(rescale(a, scale) - rescale(b, scale), scale)
}

/** Exact: the product of two scaled integers is scaled by the sum of the scales. */
export function multiplyDecimal(a: Decimal, b: Decimal): Decimal {
  const scale = a.scale + b.scale
  assertScale(scale)
  return new Decimal(a.units * b.units, scale)
}

export function negateDecimal(value: Decimal): Decimal {
  return new Decimal(-value.units, value.scale)
}

/** -1, 0 or 1, comparing by value so that 1.50 and 1.5 are equal. */
export function compareDecimal(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale)
  const left = rescale(a, scale)
  const right = rescale(b, scale)
  if (left < right) return -1
  return left > right ? 1 : 0
}

/**
 * Round to `places`, half away from zero.
 *
 * Half away from zero rather than half to even: invoicing and VAT rules in the
 * markets this targets specify commercial rounding, and a total that disagrees
 * with the one a person computes by hand is indefensible even when it is more
 * evenly distributed.
 */
export function roundDecimal(value: Decimal, places: number): Decimal {
  // Checked up front so the caller is told about THEIR places, not about an
  // intermediate scale the implementation happened to build on the way.
  assertScale(places)
  if (places >= value.scale) return new Decimal(rescale(value, places), places)

  const divisor = TEN ** BigInt(value.scale - places)
  const quotient = value.units / divisor
  const remainder = value.units % divisor
  const roundsAway = abs(remainder) * 2n >= divisor
  const step = value.units < 0n ? -1n : 1n
  return new Decimal(roundsAway ? quotient + step : quotient, places)
}

/**
 * Divide to exactly `places`, rounding half away from zero.
 *
 * There is no `/` operator for decimals on purpose. Division does not stay
 * exact, so the number of places is not something this package may pick on the
 * author's behalf.
 */
export function divideDecimal(a: Decimal, b: Decimal, places: number): Decimal {
  assertScale(places)
  if (b.units === 0n) throw new RangeError('Division by zero')

  // Compute one extra place, then round it off, so the last kept digit is
  // rounded rather than truncated. The guard digit lives in plain bigint
  // arithmetic and never becomes a Decimal, so `places` may use the full
  // MAX_DECIMAL_SCALE without the internal extra place breaking the ceiling.
  const shift = places + 1 + b.scale - a.scale
  const numerator = shift >= 0 ? a.units * TEN ** BigInt(shift) : a.units
  const denominator = shift >= 0 ? b.units : b.units * TEN ** BigInt(-shift)
  const extended = numerator / denominator
  const quotient = extended / TEN
  const roundsAway = abs(extended % TEN) >= 5n
  const step = extended < 0n ? -1n : 1n
  return new Decimal(roundsAway ? quotient + step : quotient, places)
}

const TEN = 10n

function rescale(value: Decimal, scale: number): bigint {
  return value.units * TEN ** BigInt(scale - value.scale)
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}

function assertScale(scale: number): void {
  assertPlaces(scale)
  if (scale > MAX_DECIMAL_SCALE) {
    throw new RangeError(`Decimal scale ${scale} exceeds the maximum of ${MAX_DECIMAL_SCALE}`)
  }
}

function assertPlaces(places: number): void {
  if (!Number.isInteger(places) || places < 0) {
    throw new RangeError(`Decimal places must be a non-negative integer, got ${String(places)}`)
  }
}
