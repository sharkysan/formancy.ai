import { Decimal, decimalFromString } from './decimal.js'
import { ExpressionError } from './errors.js'
import type { DeclaredType, VariableDeclarations } from './types.js'

/**
 * What an expression can be handed and what it gives back.
 *
 * Timestamps leave as RFC 3339 strings and money leaves as a `Decimal`, so a
 * result is JSON-shaped apart from the one type JSON cannot carry exactly.
 */
export type ExpressionValue =
  | null
  | boolean
  | number
  | string
  | Decimal
  | readonly ExpressionValue[]
  | { readonly [key: string]: ExpressionValue }

/**
 * Convert a form value bag into the shapes CEL expects.
 *
 * Form state is JSON: integers are `number`, dates and money are strings. CEL
 * wants a bigint for `int` and refuses to guess at the rest, so the conversion
 * happens here, once, driven by what the field was declared to be.
 *
 * Only the declared top-level variables are converted. Values nested inside a
 * list or map stay as they are, because the declaration says nothing about
 * their shape; an expression reaching into a repeater row writes
 * `dec(row.price)` for money.
 */
export function bindValues(
  declarations: VariableDeclarations,
  values: Record<string, unknown>,
  source: string,
): Record<string, unknown> {
  const bound: Record<string, unknown> = {}
  for (const [name, type] of Object.entries(declarations)) {
    const raw = values[name]
    if (raw === undefined) {
      throw new ExpressionError({
        kind: 'runtime',
        code: 'missing_variable',
        message: `No value was supplied for ${name}.`,
        source,
        hint: `Pass null for an empty field and declare it as dyn, or supply a ${type}.`,
      })
    }
    bound[name] = bindValue(name, type, raw, source)
  }
  return bound
}

function bindValue(name: string, type: DeclaredType, raw: unknown, source: string): unknown {
  switch (type) {
    case 'int':
      return bindInt(name, raw, source)
    case 'decimal':
      return bindDecimal(name, raw, source)
    case 'timestamp':
      return bindTimestamp(name, raw, source)
    default:
      return raw
  }
}

function bindInt(name: string, raw: unknown, source: string): unknown {
  if (typeof raw === 'bigint') return raw
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) {
      throw invalidValue(name, source, `${String(raw)} is not a whole number an int can hold`)
    }
    return BigInt(raw)
  }
  return raw
}

function bindDecimal(name: string, raw: unknown, source: string): unknown {
  if (raw instanceof Decimal) return raw
  if (typeof raw === 'string') {
    try {
      return decimalFromString(raw)
    } catch (error) {
      throw invalidValue(name, source, `${JSON.stringify(raw)} is not a decimal number`, error)
    }
  }
  if (typeof raw === 'number') {
    // Accepting a double here would quietly undo the reason `decimal` exists.
    throw invalidValue(
      name,
      source,
      'a number cannot be used as money, because it may already have lost precision',
    )
  }
  return raw
}

function bindTimestamp(name: string, raw: unknown, source: string): unknown {
  if (raw instanceof Date) return raw
  if (typeof raw === 'string' || typeof raw === 'number') {
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) {
      throw invalidValue(name, source, `${JSON.stringify(raw)} is not a date`)
    }
    return date
  }
  return raw
}

function invalidValue(
  name: string,
  source: string,
  detail: string,
  cause?: unknown,
): ExpressionError {
  return new ExpressionError({
    kind: 'runtime',
    code: 'invalid_value',
    message: `The value of ${name} cannot be used: ${detail}.`,
    source,
    cause,
  })
}

/**
 * Convert what CEL produced back into a plain value.
 *
 * This also materialises the metered view of the value bag: a result that came
 * straight out of the input is a Proxy, and handing one to a caller would keep
 * a spent meter alive behind their backs.
 */
export function toExpressionValue(value: unknown, source: string): ExpressionValue {
  if (value === null || value === undefined) return null

  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value
    case 'number':
      return value
    case 'bigint':
      return fromBigInt(value, source)
    case 'object':
      break
    default:
      throw unsupported(value, source)
  }

  if (value instanceof Decimal) return value
  if (value instanceof Date) return timestampToString(value)
  if (Array.isArray(value)) return value.map((item) => toExpressionValue(item, source))

  const unsigned = (value as { value?: unknown }).value
  if (typeof unsigned === 'bigint') return fromBigInt(unsigned, source)

  const duration = value as { seconds?: unknown; nanos?: unknown }
  if (typeof duration.seconds === 'number' && typeof duration.nanos === 'number') {
    return String(value)
  }

  if (value instanceof Map) {
    const entries: Record<string, ExpressionValue> = {}
    for (const [key, item] of value) entries[String(key)] = toExpressionValue(item, source)
    return entries
  }

  const prototype = Object.getPrototypeOf(value) as object | null
  if (prototype === Object.prototype || prototype === null) {
    const entries: Record<string, ExpressionValue> = {}
    for (const [key, item] of Object.entries(value)) {
      entries[key] = toExpressionValue(item, source)
    }
    return entries
  }

  throw unsupported(value, source)
}

function fromBigInt(value: bigint, source: string): number {
  const asNumber = Number(value)
  if (!Number.isSafeInteger(asNumber)) {
    throw new ExpressionError({
      kind: 'runtime',
      code: 'int_out_of_range',
      message: `The result ${value.toString()} is too large to be represented exactly.`,
      source,
      hint: 'Use dec() and keep the value as a decimal if it has to stay exact.',
    })
  }
  return asNumber
}

/**
 * RFC 3339, the form CEL specifies for a timestamp, without the fractional
 * part when there is nothing in it. Two evaluations of the same instant must
 * produce the same string or replay comparison is worthless.
 */
export function timestampToString(date: Date): string {
  const iso = date.toISOString()
  return iso.endsWith('.000Z') ? `${iso.slice(0, -5)}Z` : iso
}

function unsupported(value: unknown, source: string): ExpressionError {
  return new ExpressionError({
    kind: 'runtime',
    code: 'unsupported_value',
    message: `An expression produced a ${typeof value} that has no form value equivalent.`,
    source,
  })
}
