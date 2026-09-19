import { Decimal, decimalFromString } from './decimal.js'
import { ExpressionError } from './errors.js'
import type { ValueLimits } from './limits.js'
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
  limits: ValueLimits,
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
    assertValueWithinLimits(name, raw, limits, 0, source)
    bound[name] = bindValue(name, type, raw, source)
  }
  return bound
}

/**
 * Enforce `ValueLimits` on one bound value, before any expression code sees it.
 *
 * The step meter prices READS of the bag, but the cost of a collection an
 * expression produces internally — split(), concatenation — is set by the size
 * of what it was produced from. Bounding the inputs here is what makes the
 * budget's worst case a number rather than a hope, and it must be
 * deterministic: the same bag is rejected the same way on every machine.
 */
function assertValueWithinLimits(
  path: string,
  value: unknown,
  limits: ValueLimits,
  depth: number,
  source: string,
): void {
  if (typeof value === 'string') {
    if (value.length > limits.maxStringLength) {
      throw valueOverLimit(
        path,
        source,
        `a string of ${value.length} characters, over the limit of ${limits.maxStringLength}`,
      )
    }
    return
  }
  if (typeof value !== 'object' || value === null) return
  // A Decimal or Date holds a bounded amount of data; only containers recurse.
  if (value instanceof Decimal || value instanceof Date) return

  if (depth >= limits.maxNestingDepth) {
    throw valueOverLimit(
      path,
      source,
      `nested more than ${limits.maxNestingDepth} containers deep`,
    )
  }

  if (Array.isArray(value)) {
    if (value.length > limits.maxListElements) {
      throw valueOverLimit(
        path,
        source,
        `a list of ${value.length} elements, over the limit of ${limits.maxListElements}`,
      )
    }
    for (let i = 0; i < value.length; i++) {
      assertValueWithinLimits(`${path}[${i}]`, value[i], limits, depth + 1, source)
    }
    return
  }

  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value)
  if (entries.length > limits.maxMapEntries) {
    throw valueOverLimit(
      path,
      source,
      `a map of ${entries.length} entries, over the limit of ${limits.maxMapEntries}`,
    )
  }
  for (const [key, entry] of entries) {
    assertValueWithinLimits(`${path}.${String(key)}`, entry, limits, depth + 1, source)
  }
}

function valueOverLimit(path: string, source: string, detail: string): ExpressionError {
  return new ExpressionError({
    kind: 'runtime',
    code: 'value_limit_exceeded',
    message: `The value of ${path} is ${detail}.`,
    source,
    hint: 'Shrink the value, or raise the evaluation valueLimits on purpose.',
  })
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

/**
 * ISO 8601 date-time WITH an explicit zone: `Z` or a numeric offset. Anything
 * zone-less (what a datetime-local input emits, or a free-form date) would be
 * parsed in the HOST'S zone, and a submission that evaluated in the browser
 * must replay byte-identically on a server whose zone the browser never knew.
 */
const ZONED_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/

function bindTimestamp(name: string, raw: unknown, source: string): unknown {
  if (raw instanceof Date) return raw
  if (typeof raw === 'string') {
    if (!ZONED_TIMESTAMP.test(raw)) {
      throw invalidValue(
        name,
        source,
        `${JSON.stringify(raw)} is not an ISO 8601 date-time with an explicit zone; ` +
          'supply the zone, e.g. "2026-09-19T00:00:00Z" or "…+02:00"',
      )
    }
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) {
      throw invalidValue(name, source, `${JSON.stringify(raw)} is not a real instant`)
    }
    return date
  }
  if (typeof raw === 'number') {
    // One canonical form at the boundary: an epoch number is unambiguous but
    // invites a seconds-versus-milliseconds mistake nothing would catch.
    throw invalidValue(
      name,
      source,
      'a number cannot be used as a timestamp; supply an ISO 8601 date-time with an explicit zone',
    )
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
