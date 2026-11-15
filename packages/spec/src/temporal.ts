import type { TemporalFieldType } from './types.js'

/** Nine digits after the seconds: where RFC 3339 timestamps in CEL stop. */
export const TEMPORAL_PRECISION_MAX = 9

const CLOCK = '(?:[01]\\d|2[0-3]):[0-5]\\d'
const SECONDS = ':[0-5]\\d'
const DATE = '\\d{4}-\\d{2}-\\d{2}'

/**
 * The digits after the seconds a precision means. Outside 0..9 there is no shape, and
 * returning one would validate documents no reader can parse, so an out-of-range precision
 * throws.
 */
export function fractionDigits(precision: number | undefined): number {
  if (precision === undefined) return 0
  if (!Number.isInteger(precision) || precision < 0 || precision > TEMPORAL_PRECISION_MAX) {
    throw new RangeError(`precision must be an integer from 0 to ${TEMPORAL_PRECISION_MAX}, not ${precision}`)
  }
  return precision
}

/** The answer's pattern for a field of this type and precision; absent precision is version 5's shape. */
export function temporalShape(type: TemporalFieldType, precision?: number): string {
  const n = fractionDigits(precision)
  const fraction = n === 0 ? '' : `\\.\\d{${n}}`
  if (type === 'date') return `^${DATE}$`
  if (type === 'time') return precision === undefined ? `^${CLOCK}$` : `^${CLOCK}${SECONDS}${fraction}$`
  return `^${DATE}T${CLOCK}${SECONDS}${fraction}Z$`
}

/** Every width the type can have, as one pattern: what a bound may be before its field is known. */
export function temporalAnyShape(type: TemporalFieldType): string {
  const any = `(?:\\.\\d{1,${TEMPORAL_PRECISION_MAX}})?`
  if (type === 'date') return `^${DATE}$`
  if (type === 'time') return `^${CLOCK}(?:${SECONDS}${any})?$`
  return `^${DATE}T${CLOCK}${SECONDS}${any}Z$`
}

/**
 * Whether a `date` or `datetime` answer, already in its shape, names a day the calendar has.
 * The shape is digits in places, so 2026-02-30 passes it. The parts go through `Date.UTC`
 * and must come back as they went in, which `Date` does not refuse but moves (to 2 March);
 * the year is set again, because `Date.UTC` reads 0–99 as 1900–1999. A `time` names no
 * day, so it always does.
 */
export function temporalDateExists(type: TemporalFieldType, answer: string): boolean {
  if (type === 'time') return true
  const [year, month, day] = [Number(answer.slice(0, 4)), Number(answer.slice(5, 7)), Number(answer.slice(8, 10))]
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** An answer in that shape, for sentences: time p3 → "09:30:00.000", datetime absent → "2026-10-08T09:30:00Z". */
export function temporalExample(type: TemporalFieldType, precision?: number): string {
  const n = fractionDigits(precision)
  const seconds = `:00${n === 0 ? '' : `.${'0'.repeat(n)}`}`
  if (type === 'date') return '2026-10-08'
  if (type === 'time') return precision === undefined ? '09:30' : `09:30${seconds}`
  return `2026-10-08T09:30${seconds}Z`
}
