import { fitsMask, formatMasked, maskPositions } from './mask.js'
import { fractionDigits, temporalShape } from './temporal.js'

/**
 * Typed entry for a `time` or a `datetime` with a `precision`: the mask a person types the
 * answer into, and the conversions between what that mask holds and what is stored.
 *
 * The control is the mask core's (0125), so the mask's answer is the digits alone and
 * `editMasked` decides where each one lands. Here, in the data contract, because five
 * things type into it and must agree — React's, Angular's and Material's controls and both
 * builders' condition editors — and two implementations would be two answers to one
 * keystroke ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * - **A `time` is typed exactly as it is stored**, `HH:MM:SS` and the declared digits.
 * - **A `datetime` is typed on the person's own wall clock** as `YYYY-MM-DD HH:MM:SS` and the
 *   declared digits, and stored as the UTC instant. Its whole seconds cross the zone through
 *   `Date`. Its fraction is copied digit for digit, both ways, and never passed through
 *   `Date`, which holds milliseconds: a zone moves whole seconds and never a fraction, so
 *   the copy is the exact reading.
 * - **Nothing is rounded, and nothing incomplete is completed.** An entry that does not fill
 *   the mask, or names a wall clock that does not exist — 30 February, an hour the clocks
 *   skip — is stored as the text the control shows. The shape check refuses that, so the
 *   person is told, rather than given an answer they did not type.
 *
 * What it does not do: a wall clock that happens twice, on the night the clocks go back,
 * is the earlier of its two instants, because that is how `Date` reads it. The typed shape
 * is fixed and ISO-like, not the person's locale.
 */

/** The types a precision applies to. A `date` has no clock to be precise about. */
export type TypedTemporalType = 'time' | 'datetime'

const fractionMask = (precision: number): string => {
  const n = fractionDigits(precision)
  return n === 0 ? '' : `.${'9'.repeat(n)}`
}

/** The mask a person types into: time p3 → "99:99:99.999"; datetime p0 → "9999-99-99 99:99:99". */
export function temporalEntryMask(type: TypedTemporalType, precision: number): string {
  return `${type === 'datetime' ? '9999-99-99 ' : ''}99:99:99${fractionMask(precision)}`
}

/** The stored shape of a datetime as a mask, so the mask core writes its separators too. */
const instantMask = (precision: number): string => `9999-99-99T99:99:99${fractionMask(precision)}`

/** A UTC instant at any width, its whole seconds in six groups and its fraction in the seventh. */
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/

/** A wall clock to the second is fourteen digits, YYYYMMDDHHMMSS. */
const WALL_DIGITS = 14

type Wall = readonly [year: number, month: number, day: number, hour: number, minute: number, second: number]

/**
 * One zone's reading of a wall clock: the runtime's own, which the person types in, or
 * UTC, which is stored. One record each, because the same check runs in both directions.
 */
interface Zone {
  readonly instant: (...wall: Wall) => Date
  readonly wall: (date: Date) => Wall
}

// Both constructors read a year 0-99 as 1900-1999, so the date is set again, which reads
// the year as given; for any other wall clock that exists, setting it again changes nothing.
const LOCAL: Zone = {
  instant: (year, month, day, hour, minute, second) => {
    const date = new Date(year, month - 1, day, hour, minute, second)
    date.setFullYear(year, month - 1, day)
    return date
  },
  wall: (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()],
}

const UTC: Zone = {
  instant: (year, month, day, hour, minute, second) => {
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    date.setUTCFullYear(year, month - 1, day)
    return date
  },
  wall: (date) => [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()],
}

/** A date's wall clock in a zone as fourteen digits; undefined when its year has no four. */
function wallDigits(date: Date, zone: Zone): string | undefined {
  const [year, ...rest] = zone.wall(date)
  if (year < 0 || year > 9999) return undefined
  return [String(year).padStart(4, '0'), ...rest.map((part) => String(part).padStart(2, '0'))].join('')
}

/**
 * The instant whose wall clock in a zone reads these fourteen digits, or undefined when
 * none does. `Date` does not refuse 30 February or a skipped hour, it moves them — to 2
 * March, to 03:30 — so the instant is only the answer when its own wall clock gives the
 * digits back.
 */
function instantAt(wall: string, zone: Zone): Date | undefined {
  const part = (from: number, to: number): number => Number(wall.slice(from, to))
  const date = zone.instant(part(0, 4), part(4, 6), part(6, 8), part(8, 10), part(10, 12), part(12, 14))
  return wallDigits(date, zone) === wall ? date : undefined
}

/** A stored instant's digits on the local wall clock, its fraction copied; undefined when it is no instant. */
function localDigits(stored: string): string | undefined {
  const match = INSTANT.exec(stored)
  if (match === null) return undefined
  const instant = instantAt(match.slice(1, 7).join(''), UTC)
  const local = instant === undefined ? undefined : wallDigits(instant, LOCAL)
  return local === undefined ? undefined : `${local}${match[7] ?? ''}`
}

/**
 * The mask answer (digits) to show for a stored answer: a datetime in local time, its
 * fraction copied. Anything that is not an instant — a held partial, a value at another
 * shape — shows as its own digits, so it is never blanked.
 *
 * Only as many digits as the mask has positions: an instant wider than the field shows
 * what fits. Keeping the rest in the answer would hide them in it, and a deletion would
 * slide one into view and make a complete answer of digits the person never saw.
 */
export function typedFromStored(type: TypedTemporalType, precision: number, stored: string): string {
  const mask = temporalEntryMask(type, precision)
  const digits = (type === 'datetime' ? localDigits(stored) : undefined) ?? stored.replace(/[^0-9]/g, '')
  return digits.slice(0, maskPositions(mask).filter((position) => 'slot' in position).length)
}

/**
 * The stored answer for typed digits: null when empty; the formatted partial text when
 * incomplete or not a real local time. `typed` is a mask answer, as `editMasked` and
 * `typedFromStored` give one.
 *
 * A filled time is its formatted text, whatever its digits: 25:00:00 is the shape check's
 * to refuse, which is the engine's and the server's verdict, and a second one here could
 * disagree with it.
 */
export function storedFromTyped(type: TypedTemporalType, precision: number, typed: string): string | null {
  const mask = temporalEntryMask(type, precision)
  if (typed === '') return null
  if (type === 'time' || !fitsMask(mask, typed)) return formatMasked(mask, typed)
  const instant = instantAt(typed.slice(0, WALL_DIGITS), LOCAL)
  const utc = instant === undefined ? undefined : wallDigits(instant, UTC)
  if (utc === undefined) return formatMasked(mask, typed)
  return `${formatMasked(instantMask(precision), `${utc}${typed.slice(WALL_DIGITS)}`)}Z`
}

/**
 * A whole answer pasted in the stored shape (a UTC instant from a log), taken as it is;
 * undefined otherwise, and the control reads the paste through the mask.
 *
 * Read through the mask, an instant's digits would be taken as the person's own wall clock
 * and the answer moved by their offset. The whitespace around it is not part of it: a
 * copied log line brings its line break, and refused for that, it would land as local digits.
 */
export function pastedInstant(type: TypedTemporalType, precision: number, text: string): string | undefined {
  const answer = text.trim()
  return new RegExp(temporalShape(type, precision)).test(answer) ? answer : undefined
}
