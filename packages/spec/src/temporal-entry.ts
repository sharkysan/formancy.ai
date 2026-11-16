import { fitsMask, fitsSlot, formatMasked, maskPositions } from './mask.js'
import { TEMPORAL_PRECISION_MAX, fractionDigits, temporalDateExists, temporalShape } from './temporal.js'

/**
 * Typed entry for a `time` or a `datetime` with a `precision`: the mask a person types the
 * answer into, and the conversions between what that mask holds and what is stored.
 *
 * The control is the mask core's (0125), so the mask's answer is the digits alone and
 * `editMasked` decides where each one lands. Here, in the data contract, because more than
 * one thing types into it and must agree — React's control and Angular's, which a Material
 * form draws too (0132), and the builders' condition editors once they type a literal at a
 * field's width — and two implementations would be two answers to one keystroke
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
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

/** How many positions a mask has to type into. */
const slotCount = (mask: string): number => maskPositions(mask).filter((position) => 'slot' in position).length

/** Each character a mask writes, and how many positions come before it: `9999-99` writes `-` after four. */
function writtenAt(mask: string): { readonly literal: string; readonly after: number }[] {
  const written: { literal: string; after: number }[] = []
  let after = 0
  for (const position of maskPositions(mask)) {
    if ('slot' in position) after += 1
    else written.push({ literal: position.literal, after })
  }
  return written
}

/**
 * Whether a person could have typed this text into the field's mask: digits, no more of
 * them than the mask has positions, and otherwise only the characters the mask writes,
 * each exactly where it writes it — after as many digits as the mask puts before it — and
 * at most once. One may be left out: `20261115 14:03` types as `2026-11-15 14:03` does.
 * One anywhere else marks a place the mask does not have, so the mask would drop it and
 * every digit after it would move: early, `1:15:23.456` became 11:52:34.56; late, an
 * offset lost its sign and its digits became the fraction.
 *
 * It is what the mask may read as typing and what `storedFromTyped` holds. A zone, a
 * second space, a space after the stop or a digit too many is none of it, and nor is an
 * offset in a time, whose mask writes no sign, or one in a datetime after more than six
 * digits, since its mask writes `-` only after the year's four and the month's two.
 */
function couldBeTyped(type: TypedTemporalType, precision: number, text: string): boolean {
  const mask = temporalEntryMask(type, precision)
  const written = writtenAt(mask)
  let next = 0
  let digits = 0
  for (const character of text) {
    if (fitsSlot('digit', character)) {
      digits += 1
      continue
    }
    // The place the mask writes it after exactly these digits, not used yet; the places
    // skipped to reach it are characters left out.
    const place = written.findIndex((at, index) => index >= next && at.literal === character && at.after === digits)
    if (place === -1) return false
    next = place + 1
  }
  return digits <= slotCount(mask)
}

/** The stored shape of a datetime as a mask, so the mask core writes its separators too. */
const instantMask = (precision: number): string => `9999-99-99T99:99:99${fractionMask(precision)}`

/** A UTC instant at any width: its whole seconds, and its fraction. */
const INSTANT = /^(?<whole>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d+))?Z$/

/** A time at any width, as it is stored and as it is pasted. */
const TIME = /^(?<clock>\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d+))?$/

/** A datetime's whole seconds as the stored shape checks them, so 25:00 and 13:60 are no instant. */
const WHOLE_SECONDS = new RegExp(temporalShape('datetime', 0))

/** A wall clock to the second is fourteen digits, YYYYMMDDHHMMSS. */
const WALL_DIGITS = 14

type Wall = readonly [year: number, month: number, day: number, hour: number, minute: number, second: number]

const digitsIn = (text: string): string => text.replace(/[^0-9]/g, '')

/** Fourteen digits as the six parts of a wall clock. */
function wallOf(digits: string): Wall {
  const part = (from: number, to: number): number => Number(digits.slice(from, to))
  return [part(0, 4), part(4, 6), part(6, 8), part(8, 10), part(10, 12), part(12, 14)]
}

/**
 * A zone's reading of a date as a wall clock: the runtime's own, which the person types in,
 * or UTC, which is stored. Each direction reads one of them and writes the other.
 */
type Zone = (date: Date) => Wall

const LOCAL: Zone = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]

const UTC: Zone = (date) => [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]

/** A date's wall clock in a zone as fourteen digits; undefined when its year has no four. */
function wallDigits(date: Date, zone: Zone): string | undefined {
  const [year, ...rest] = zone(date)
  if (year < 0 || year > 9999) return undefined
  return [String(year).padStart(4, '0'), ...rest.map((part) => String(part).padStart(2, '0'))].join('')
}

// Both constructors below read a year 0-99 as 1900-1999, so the date is set again, which
// reads the year as given; for any other wall clock that exists, setting it again changes nothing.

/**
 * The instant whose local wall clock reads these fourteen digits, or undefined when none
 * does. `Date` does not refuse 30 February or a skipped hour, it moves them — to 2 March,
 * to 03:30 — so the instant is only the answer when its own wall clock gives the digits
 * back. Which hours a zone skips only the runtime knows, so here the round trip is the check.
 */
function localInstant(digits: string): Date | undefined {
  const [year, month, day, hour, minute, second] = wallOf(digits)
  const date = new Date(year, month - 1, day, hour, minute, second)
  date.setFullYear(year, month - 1, day)
  return wallDigits(date, LOCAL) === digits ? date : undefined
}

/**
 * The instant a datetime's whole seconds, `YYYY-MM-DDTHH:MM:SS`, name in UTC; undefined when
 * there is none: a second past 23:59:59, or a day the calendar does not have. UTC skips no
 * hour, so with the clock in range the day is the only question, and it is asked of
 * `temporalDateExists`, as the engine asks it: the control and the engine's shape error
 * cannot disagree about which days there are.
 */
function utcInstant(whole: string): Date | undefined {
  if (!WHOLE_SECONDS.test(`${whole}Z`) || !temporalDateExists('datetime', whole)) return undefined
  const [year, month, day, hour, minute, second] = wallOf(digitsIn(whole))
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  date.setUTCFullYear(year, month - 1, day)
  return date
}

/** A stored instant's digits on the local wall clock, its fraction copied; undefined when it is no instant. */
function localDigits(stored: string): string | undefined {
  const { whole, fraction = '' } = INSTANT.exec(stored)?.groups ?? {}
  const instant = whole === undefined ? undefined : utcInstant(whole)
  const local = instant === undefined ? undefined : wallDigits(instant, LOCAL)
  return local === undefined ? undefined : `${local}${fraction}`
}

/** A stored answer's digits as the mask shows them, at any width: an instant on the local clock, a time as it is. */
function storedDigits(type: TypedTemporalType, stored: string): string | undefined {
  if (type === 'datetime') return localDigits(stored)
  return TIME.test(stored) ? digitsIn(stored) : undefined
}

/**
 * The mask answer (digits) to show for a stored answer: a datetime in local time, its
 * fraction copied, at whatever width it was stored. A held partial — text a person could
 * have typed, which is what `storedFromTyped` holds — shows as its own digits, so the
 * person carries on where they were.
 *
 * Anything else shows nothing. As digits, a clock held at a foreign offset would read as
 * the person's own, and the first edit would store that local clock, shifted from the
 * instant the text names. Empty, the engine's shape error says why, and a keystroke
 * replaces it.
 *
 * One answer the engine accepts shows nothing too, a residual accepted rather than fixed,
 * for the safety analysis to name: an instant whose year on the local clock leaves 0000–9999
 * (9999-12-31T23:30:00Z in Zurich is 10000-01-01 there), which four digits cannot show.
 *
 * Only as many digits as the mask has positions: an instant wider than the field shows
 * what fits. Keeping the rest in the answer would hide them in it, and a deletion would
 * slide one into view and make a complete answer of digits the person never saw.
 */
export function typedFromStored(type: TypedTemporalType, precision: number, stored: string): string {
  const mask = temporalEntryMask(type, precision)
  const digits = storedDigits(type, stored) ?? (couldBeTyped(type, precision, stored) ? digitsIn(stored) : '')
  return digits.slice(0, slotCount(mask))
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
  const instant = localInstant(typed.slice(0, WALL_DIGITS))
  const utc = instant === undefined ? undefined : wallDigits(instant, UTC)
  if (utc === undefined) return formatMasked(mask, typed)
  return `${formatMasked(instantMask(precision), `${utc}${typed.slice(WALL_DIGITS)}`)}Z`
}

/**
 * An answer as a paste may carry it: the clock, any number of digits after the seconds,
 * and for an instant its date and the zone it was read in. RFC 3339 also writes the T as a
 * space and both letters in lower case, and PostgreSQL writes an offset as `±HH`; each is
 * evidently an instant, and one left to the mask would be read as the person's own clock.
 */
const PASTED: Readonly<Record<TypedTemporalType, RegExp>> = {
  time: TIME,
  datetime: /^(?<date>\d{4}-\d{2}-\d{2})[Tt ](?<clock>\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d+))?(?<zone>[Zz]|[+-]\d{2}(?::?\d{2})?)$/,
}

/** A zone as minutes east of UTC, Z and ±00:00 being 0; undefined for an offset of a day or more, or past 59 minutes. */
function offsetMinutes(zone: string): number | undefined {
  if (zone === '' || zone === 'Z' || zone === 'z') return 0
  const hours = Number(zone.slice(1, 3))
  const minutes = zone.length > 3 ? Number(zone.slice(-2)) : 0
  if (hours > 23 || minutes > 59) return undefined
  return (zone.startsWith('-') ? -1 : 1) * (hours * 60 + minutes)
}

/**
 * Whole seconds read at an offset, as the same instant's whole seconds in UTC: the parts
 * through `Date.UTC`, then the offset in whole minutes, so no fraction and no string ever
 * reaches `Date`. Undefined when no UTC text says it: a day that does not exist, or a year
 * past 9999.
 */
function inUtc(whole: string, offset: number): string | undefined {
  const asIfUtc = utcInstant(whole)
  const utc = asIfUtc === undefined ? undefined : wallDigits(new Date(asIfUtc.getTime() - offset * 60_000), UTC)
  return utc === undefined ? undefined : formatMasked(instantMask(0), utc)
}

/**
 * A time or an instant pasted whole, at the field's width where that is exact; undefined
 * when the text is neither, or names one no stored text can say exactly.
 *
 * - An instant with an offset is the same instant in UTC, its fraction copied.
 * - Fewer digits after the seconds than the field declares are padded with zeros.
 * - More are cut, but only when every digit cut is a zero, and never past nine digits,
 *   which no field has.
 * - Otherwise it is kept at its own width, in UTC, never rounded or cut to fit, for the
 *   shape check to refuse and the control to show converted.
 */
function answerPasted(type: TypedTemporalType, n: number, answer: string): string | undefined {
  const groups = PASTED[type].exec(answer)?.groups
  if (groups === undefined) return undefined
  const { date = '', clock = '', fraction = '', zone = '' } = groups
  const whole = type === 'datetime' ? `${date}T${clock}` : clock
  const suffix = type === 'datetime' ? 'Z' : ''
  const offset = offsetMinutes(zone)
  // The clock checked as the stored shape checks it, so 25:00 is no time and no instant.
  if (offset === undefined || !new RegExp(temporalShape(type, 0)).test(`${whole}${suffix}`)) return undefined
  // An instant's day asked of the calendar at every offset, Z included: 30 February is none.
  const utc = type === 'datetime' ? inUtc(whole, offset) : whole
  if (utc === undefined) return undefined
  const exact = fraction.length <= TEMPORAL_PRECISION_MAX && /^0*$/.test(fraction.slice(n))
  const digits = exact ? fraction.slice(0, n).padEnd(n, '0') : fraction
  return `${utc}${digits === '' ? '' : `.${digits}`}${suffix}`
}

/**
 * A whole text, as a paste was first read: the answer it names, undefined when a person
 * could have typed it into this mask, and anything else held exactly as given, for the
 * shape check to refuse. Whitespace around it is not part of it.
 *
 * It is not how a control reads a paste, and it is not in the package's index: a control
 * asks `pasteOutcome`, which ignores what this would hold rather than storing it, and judges
 * the text the paste makes rather than the pasted text alone. It stays because its cases pin
 * what `couldBeTyped` refuses, which is how `pasteOutcome` decides typing too: at precision
 * 4, `20261115140327-0100` read as typing was stored complete and valid as 14:03:27.0100 on
 * the person's clock, the offset's digits as the fraction.
 */
export function pastedInstant(type: TypedTemporalType, precision: number, text: string): string | undefined {
  const answer = text.trim()
  const taken = recognisedAnswer(type, precision, answer)
  if (taken !== undefined) return taken
  return couldBeTyped(type, precision, answer) ? undefined : answer
}

/**
 * The answer a pasted text names on its own, or undefined when it names none. Whitespace
 * around it is not part of it: a copied log line brings its line break.
 *
 * - A time, `HH:MM:SS` and any number of digits after the seconds.
 * - An instant: a date, a `T` or a space, a clock, any digits after the seconds, and its zone,
 *   `Z` or an offset (`±HH:MM`, `±HHMM` or PostgreSQL's `±HH`; RFC 3339's lower-case letters
 *   too). It is the same instant in UTC, its fraction copied, never passed through `Date`.
 * - At the field's width where that is exact: fewer digits padded with zeros, more cut only
 *   when every digit cut is a zero and there are no more than nine. Otherwise at its own
 *   width, never rounded or cut, so the shape check refuses it and the person is told.
 *
 * None for anything else, among it a clock the stored shape refuses (25:00), an offset of a
 * day or more, a day the calendar does not have, an instant whose year in UTC leaves
 * 0000–9999, a time with a zone, and a date and clock with no zone, which are the person's
 * own and for `pasteOutcome` to read as typing.
 */
export function recognisedAnswer(type: TypedTemporalType, precision: number, text: string): string | undefined {
  return answerPasted(type, fractionDigits(precision), text.trim())
}

/**
 * What a paste into a typed control means: an answer to store, typing to read through the
 * mask, or nothing at all. `before`, `selected` and `after` are the text the control shows,
 * split by the selection the paste replaces; `pasted` is the clipboard's text, empty when it
 * holds none.
 *
 * One decision here for every control, so that React's, Angular's and Material's cannot read
 * one paste three ways (0091). Tried in order:
 *
 * 1. **A time or an instant on its own is the answer** (`recognisedAnswer`), wherever it lands:
 *    it says by itself what it means, so what it replaces is beside the point. That holds over
 *    the same text too: a stored value wider than the field can show as the very text pasted
 *    over it, and the paste then stores what the person reads.
 * 2. **A paste of nothing is ignored, and so is any other text pasted over itself.** Nothing is
 *    an empty clipboard, one holding only an image, or whitespace alone. Read as typing, nothing
 *    over a selection deleted it, which is the Delete key's job; and where the text was left as
 *    it was — nothing at a caret, or the same text over itself — the mask read the edit as a
 *    backspace, so a digit went.
 * 3. **Digits alone are typing, when they fit**: the whole text the field would hold, provided
 *    it has no more digits than the mask has positions. Digits carry no zone, so there is
 *    nothing to misread, and the mask places them as the same keystrokes, even where that
 *    leaves the field's own separators out of place: 0 over the hour of 14:03:27.415 types as
 *    the key does. Digits that do not fit would be cut, and the rest stored complete and
 *    accepted: an answer the paste does not denote.
 * 4. **Any other text is typing if the mask could have been typed into it** (`couldBeTyped`):
 *    digits that fit, and each of the mask's own characters only where it writes it.
 * 5. **Anything else is ignored**, as a keystroke the mask cannot place changes nothing.
 *    Nothing is stored, so a combination of the pasted text and the field's own digits that
 *    nobody wrote, such as a fragment of an offset joined to a minute, can never be accepted.
 */
export function pasteOutcome(
  type: TypedTemporalType,
  precision: number,
  { before, selected, pasted, after }: { readonly before: string; readonly selected: string; readonly pasted: string; readonly after: string },
): { answer: string } | { typed: string } | { ignored: true } {
  const answer = recognisedAnswer(type, precision, pasted)
  if (answer !== undefined) return { answer }
  if (pasted.trim() === '' || pasted === selected) return { ignored: true }
  const whole = `${before}${pasted}${after}`
  const fits = digitsIn(whole).length <= slotCount(temporalEntryMask(type, precision))
  if (fits && /^\d+$/.test(pasted.trim())) return { typed: whole }
  return couldBeTyped(type, precision, whole) ? { typed: whole } : { ignored: true }
}
