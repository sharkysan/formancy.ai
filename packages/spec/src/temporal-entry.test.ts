import { afterEach, describe, expect, test, vi } from 'vitest'

import { editMasked, formatMasked } from './mask.js'
import { temporalDateExists, temporalShape } from './temporal.js'
import { pastedInstant, pasteOutcome, storedFromTyped, temporalEntryMask, typedFromStored } from './temporal-entry.js'
import type { TypedTemporalType } from './temporal-entry.js'

/**
 * A `time` or `datetime` with a `precision`, typed into a mask in its own shape.
 *
 * These four functions are the one answer to each keystroke for React's, Angular's and
 * Material's controls and both builders' condition editors. A case that reads as a
 * corner — a spring-forward night, a digit the mask cannot show — is one a person meets
 * at a keyboard, and the failure each prevents is an answer stored as some other instant
 * than the one the person read on the screen.
 *
 * A `datetime` is typed in the person's own wall clock, so every case that converts pins
 * a zone, and the conversions run in two: a runner on UTC would convert nothing and
 * show only the width half of each case.
 */

const accepts = (type: TypedTemporalType, precision: number, answer: string | null): boolean =>
  answer !== null && new RegExp(temporalShape(type, precision)).test(answer)

// A whole text as `pastedInstant` reads it: the instant when the text is one, else the text
// read through the mask as typed digits, which is where a zone can move an answer. A control
// asks `pasteOutcome` instead, which ignores what this holds; these cases pin what is never
// read as typing, which both decide through `couldBeTyped`.
const pasteInto = (type: TypedTemporalType, precision: number, text: string): string | null =>
  pastedInstant(type, precision, text) ?? storedFromTyped(type, precision, editMasked(temporalEntryMask(type, precision), '', text).answer)

// Put back by name. `vi.unstubAllEnvs()` deletes TZ, and Node keeps the zone it was last
// given rather than returning to the one it started in (measured 2026-11-15, Node 24), so
// a case pinned to New York would otherwise leave the rest of the file in New York.
const started = Intl.DateTimeFormat().resolvedOptions().timeZone
afterEach(() => {
  vi.stubEnv('TZ', started)
  vi.unstubAllEnvs()
})

describe('the mask a person types into', () => {
  test('a time at precision 0 is the clock to the second', () => {
    // A mask without the seconds would make precision 0 a minute field, and every
    // answer it produced would be refused by the shape it was typed for.
    expect(temporalEntryMask('time', 0)).toBe('99:99:99')
  })

  test('a time at precision 3 has a position for every declared digit', () => {
    // One position short, and no answer typed into it could ever be complete.
    expect(temporalEntryMask('time', 3)).toBe('99:99:99.999')
  })

  test('a datetime at precision 0 is a local date and clock, a space between them', () => {
    // The T and the Z are the stored shape's; a person types their own wall clock, so
    // neither is theirs to type.
    expect(temporalEntryMask('datetime', 0)).toBe('9999-99-99 99:99:99')
  })

  test('a datetime at precision 3 carries the fraction after the seconds', () => {
    // The fraction is the one part a zone does not move, so it is typed where it is
    // stored, after the seconds, and copied rather than converted.
    expect(temporalEntryMask('datetime', 3)).toBe('9999-99-99 99:99:99.999')
  })

  test('a precision outside 0 to 9 has no mask, as it has no shape', () => {
    // A mask of ten fraction positions would collect an answer no shape accepts, and
    // the person would be told so only after typing all of it.
    expect(() => temporalEntryMask('time', 10)).toThrow(RangeError)
    expect(() => temporalEntryMask('datetime', -1)).toThrow(RangeError)
  })
})

describe('a time, typed exactly as it is stored', () => {
  test('a seven-digit time round-trips digit for digit', () => {
    // A machine supplies digits nobody types. Dropping one on the way into the control,
    // or on the way back, would change a measured value without anybody seeing it.
    const typed = typedFromStored('time', 7, '10:34:56.7890121')
    expect(typed).toBe('1034567890121')
    expect(storedFromTyped('time', 7, typed)).toBe('10:34:56.7890121')
  })

  test('incomplete digits store the formatted partial, which the shape refuses', () => {
    // Completing 14:03:2 to 14:03:20 or 14:03:02 would be a guess at what the person
    // meant. Held as typed, the engine says shape and the person is told.
    const stored = storedFromTyped('time', 3, '14032')
    expect(stored).toBe('14:03:2')
    expect(accepts('time', 3, stored)).toBe(false)
  })

  test('a held partial time shows as its own digits, so the person carries on where they were', () => {
    // 14:03:2 is no time at any width, only what the mask held. Shown as nothing, the
    // half-typed answer would be lost on the next render of the control holding it.
    expect(typedFromStored('time', 3, '14:03:2')).toBe('14032')
  })

  test('a clock that does not exist is written as typed, for the shape check to refuse', () => {
    // The shape check is the engine's and the server's one verdict on a time. A second
    // one here, mapping 25:00 to anything, could disagree with it.
    const stored = storedFromTyped('time', 0, '250000')
    expect(stored).toBe('25:00:00')
    expect(accepts('time', 0, stored)).toBe(false)
  })

  test('empty stores null, not an empty string and not a partial', () => {
    // Clearing the control is "no answer". An empty string would be an answer the shape
    // refuses, so a cleared optional field would block the submission.
    expect(storedFromTyped('time', 3, '')).toBeNull()
  })
})

describe.each([
  { zone: 'Europe/Zurich', wall: '20261115140327' },
  { zone: 'America/New_York', wall: '20261115080327' },
])('a datetime typed in $zone', ({ zone, wall }) => {
  // One instant, 2026-11-15T13:03:27Z, read on two wall clocks.

  test('a whole entry stores the UTC instant with the fraction unchanged', () => {
    // Read as UTC digits, the answer would be off by the person's offset: an hour in
    // Zurich, five in New York.
    vi.stubEnv('TZ', zone)
    expect(storedFromTyped('datetime', 3, `${wall}415`)).toBe('2026-11-15T13:03:27.415Z')
  })

  test('at precision 6 the fraction is copied, never passed through Date', () => {
    // Date holds milliseconds. Through it, .789012 would come back as .789, or rounded.
    vi.stubEnv('TZ', zone)
    expect(storedFromTyped('datetime', 6, `${wall}789012`)).toBe('2026-11-15T13:03:27.789012Z')
  })

  test('a stored instant at precision 6 shows on the local clock, with the same fraction', () => {
    // A zone moves whole seconds and never a fraction, so a copy of the fraction is the
    // exact local reading of it.
    vi.stubEnv('TZ', zone)
    expect(typedFromStored('datetime', 6, '2026-11-15T13:03:27.789012Z')).toBe(`${wall}789012`)
  })

  test('a 20-character instant in a precision-3 field shows converted with its seconds', () => {
    // Review focus 2. A supplied value at the wrong width is shown with the digits it has,
    // never blanked; the engine says shape, and nothing here invents a .000.
    vi.stubEnv('TZ', zone)
    expect(typedFromStored('datetime', 3, '2026-11-15T13:03:27Z')).toBe(wall)
  })

  test('what the control shows, stored again, is the same instant', () => {
    // For a wall clock that happens once, showing an answer and taking it back agree to
    // the digit; otherwise a person who retypes one digit of a supplied value would move
    // the rest of it. The hour that happens twice does not round-trip, and is pinned
    // under "an ambiguous wall clock" below.
    vi.stubEnv('TZ', zone)
    const stored = '2026-11-15T13:03:27.415Z'
    expect(storedFromTyped('datetime', 3, typedFromStored('datetime', 3, stored))).toBe(stored)
  })
})

describe('a local time that is not real is held as typed', () => {
  test('30 February is held, not moved into March', () => {
    // Date rolls 30 February over to 2 March. Stored, that is a day nobody typed.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const stored = storedFromTyped('datetime', 0, '20260230100000')
    expect(stored).toBe('2026-02-30 10:00:00')
    expect(accepts('datetime', 0, stored)).toBe(false)
  })

  test.each([
    { zone: 'Europe/Zurich', typed: '20260329023000', shown: '2026-03-29 02:30:00' },
    { zone: 'America/New_York', typed: '20260308023000', shown: '2026-03-08 02:30:00' },
  ])('a wall clock in the spring-forward gap in $zone is held, not moved to 03:30', ({ zone, typed, shown }) => {
    // Review focus 3. Date reads 02:30 on that night as 03:30, an hour the person did not
    // type. Held, the shape check refuses it and the person is told.
    vi.stubEnv('TZ', zone)
    const stored = storedFromTyped('datetime', 0, typed)
    expect(stored).toBe(shown)
    expect(accepts('datetime', 0, stored)).toBe(false)
  })

  test('a local time whose instant has no four-digit year is held', () => {
    // 9999-12-31 23:30 in New York is 10000-01-01T04:30Z. Written into four digits, the
    // year would be cut and the answer would be some other instant in a valid shape.
    vi.stubEnv('TZ', 'America/New_York')
    const stored = storedFromTyped('datetime', 0, '99991231233000')
    expect(stored).toBe('9999-12-31 23:30:00')
    expect(accepts('datetime', 0, stored)).toBe(false)
  })
})

describe('a year before 100', () => {
  test('is that year, not 19xx', () => {
    // Date's constructors read a year 0-99 as 1900-1999, so 0050 would be held as not
    // real when typed, and a stored 0050 instant would be shown as its UTC digits. Pinned
    // to a fixed offset (Etc/GMT-1 is UTC+1), not a city, whose zone in the year 50 is its
    // local mean time; and not to UTC, where the UTC digits would pass for the local ones.
    vi.stubEnv('TZ', 'Etc/GMT-1')
    expect(storedFromTyped('datetime', 0, '00500601110000')).toBe('0050-06-01T10:00:00Z')
    expect(typedFromStored('datetime', 0, '0050-06-01T10:00:00Z')).toBe('00500601110000')
  })
})

describe('a datetime that is not an instant', () => {
  test('incomplete digits store the formatted partial, which the shape refuses', () => {
    // Completed to 14:03:00.000 and converted, it would be an instant nobody typed, and
    // it would pass.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const stored = storedFromTyped('datetime', 3, '202611151403')
    expect(stored).toBe('2026-11-15 14:03')
    expect(accepts('datetime', 3, stored)).toBe(false)
  })

  test('empty stores null', () => {
    // Review focus 4. Select all and delete is "no answer", not "" and not a partial.
    expect(storedFromTyped('datetime', 3, '')).toBeNull()
  })

  test('a held partial shows as its own digits, so the person carries on where they were', () => {
    // Read as an instant, or blanked, the half-typed answer would be lost on the next
    // render of the control holding it.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(typedFromStored('datetime', 3, '2026-11-15 14:03')).toBe('202611151403')
    expect(typedFromStored('datetime', 0, '2026-02-30 10:00:00')).toBe('20260230100000')
  })

  test('a stored instant on a day that does not exist shows nothing, not the day Date rolls to', () => {
    // 2026-02-30T10:00:00Z has the shape and is no instant. Shown as 2 March, the control
    // would display a day the answer does not hold; shown as its digits, it would read
    // as a local clock it never was. Empty, and the engine says shape, because a field
    // with a precision refuses a day the calendar does not have.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(typedFromStored('datetime', 0, '2026-02-30T10:00:00Z')).toBe('')
    expect(temporalDateExists('datetime', '2026-02-30T10:00:00Z')).toBe(false)
  })

  test('a stored instant at a second past 23:59:59 shows nothing, not the hour Date rolls to', () => {
    // The day is asked of the calendar, which knows no clock. Date reads 25:00 as 01:00 on
    // the 16th and setting the year again puts the day back, so without the clock checked
    // 25:00Z became 01:00Z on the 15th and the control showed 2026-11-15 02:00:00 in
    // Zurich, an hour the answer does not hold; 13:60 likewise showed 15:00:00.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(typedFromStored('datetime', 0, '2026-11-15T25:00:00Z')).toBe('')
    expect(typedFromStored('datetime', 0, '2026-11-15T13:60:00Z')).toBe('')
  })

  test.each([
    { zone: 'Europe/Zurich', stored: '9999-12-31T23:30:00Z' },
    { zone: 'America/New_York', stored: '0000-01-01T03:00:00Z' },
  ])('an instant whose local year has no four digits shows nothing, and passes the shape and the calendar: $stored in $zone', ({ zone, stored }) => {
    // A residual accepted, for the safety analysis to name: on this clock its year is 10000
    // or -0001, which the mask cannot show. Here, that the shape and the calendar — the
    // checks the engine makes of it — both pass it; that the engine accepts it is core's
    // temporal-precision.test.ts. Pinned, so a change to either half is a decision.
    vi.stubEnv('TZ', zone)
    expect(typedFromStored('datetime', 0, stored)).toBe('')
    expect(accepts('datetime', 0, stored) && temporalDateExists('datetime', stored)).toBe(true)
  })

  test.each([
    { precision: 3, text: '2026-11-15T13:03:27.415+24:00', why: 'an offset no zone has' },
    { precision: 3, text: '2026-11-15 14:03:27 +0100', why: "git's offset after a space" },
    { precision: 3, text: '9999-12-31T23:30:00-01:00', why: 'an offset past year 9999' },
    { precision: 3, text: 'hello', why: 'no clock at all' },
    { precision: 4, text: '20261115140327-0100', why: 'an offset after a clock written without separators' },
  ])('text held as pasted shows nothing, never its digits as a local clock: $why', ({ precision, text }) => {
    // Shown as its digits, 14:03:27 +0100 would read as the person's own 14:03:27, and
    // the first edit would store that local clock, shifted from the instant the text
    // names; at precision 4, 20261115140327-0100 showed as 14:03:27.0100, the offset as
    // the fraction. Empty, the engine's shape error says why, and a keystroke replaces it.
    vi.stubEnv('TZ', 'America/New_York')
    expect(typedFromStored('datetime', precision, text)).toBe('')
  })

  test('a time that could not have been typed shows nothing', () => {
    // 14:03:27+01:00 is a clock with an offset a time has no place for; as digits it
    // would show 14:03:27.010.
    expect(typedFromStored('time', 3, '14:03:27+01:00')).toBe('')
  })
})

describe('an ambiguous wall clock, on the night the clocks go back', () => {
  test('is the earlier of its two instants, as Date reads it', () => {
    // 02:30 happens twice in Zurich on 2026-10-25. Date takes the first, as the browser's
    // own datetime-local control does today; pinned so that a change of conversion cannot
    // move which instant such an entry stores without a test saying so.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(storedFromTyped('datetime', 0, '20261025023000')).toBe('2026-10-25T00:30:00Z')
    expect(typedFromStored('datetime', 0, '2026-10-25T01:30:00Z')).toBe('20261025023000')
  })
})

describe('an answer wider than the mask', () => {
  test('shows the digits that fit, and a deletion does not pull a hidden one into view', () => {
    // A precision-6 instant in a precision-3 field shows .789 of .789012. Were the hidden
    // 012 kept in the mask's answer, deleting the 9 would slide the 0 into its place and
    // store a complete answer the person never saw.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const mask = temporalEntryMask('datetime', 3)
    const typed = typedFromStored('datetime', 3, '2026-11-15T13:03:27.789012Z')
    expect(formatMasked(mask, typed)).toBe('2026-11-15 14:03:27.789')
    const edit = editMasked(mask, typed, '2026-11-15 14:03:27.78')
    expect(storedFromTyped('datetime', 3, edit.answer)).toBe('2026-11-15 14:03:27.78')
  })
})

describe('a whole answer pasted', () => {
  test('a UTC instant from a log is taken as that instant', () => {
    // Review focus 1. Read through the mask, its digits would be taken as the person's
    // local clock and the answer moved by their offset.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(pastedInstant('datetime', 3, '2026-11-15T13:03:27.415Z')).toBe('2026-11-15T13:03:27.415Z')
  })

  test('with the line break a copied log line carries', () => {
    // A triple-clicked line comes with its newline. Refused for it, the paste would fall
    // to the mask's reading and land as local digits, the failure above.
    expect(pastedInstant('datetime', 3, ' 2026-11-15T13:03:27.415Z\n')).toBe('2026-11-15T13:03:27.415Z')
  })

  test.each([
    { type: 'datetime', precision: 3, text: '2026-11-15T13:03:27Z', taken: '2026-11-15T13:03:27.000Z' },
    { type: 'datetime', precision: 6, text: '2026-11-15T13:03:27.415Z', taken: '2026-11-15T13:03:27.415000Z' },
    { type: 'time', precision: 3, text: '14:03:27', taken: '14:03:27.000' },
  ] as const)('a narrower $type is padded with zeros, which is the same instant: $text', ({ type, precision, text, taken }) => {
    // Refused for its width, it fell to the mask, whose digits are the person's wall
    // clock: in Zurich the instant was stored an hour off, and complete.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(pasteInto(type, precision, text)).toBe(taken)
  })

  test.each([
    { type: 'datetime', precision: 3, text: '2026-11-15T13:03:27.415000Z', taken: '2026-11-15T13:03:27.415Z' },
    { type: 'datetime', precision: 0, text: '2026-11-15T13:03:27.000Z', taken: '2026-11-15T13:03:27Z' },
    { type: 'time', precision: 3, text: '14:03:27.415000', taken: '14:03:27.415' },
    { type: 'time', precision: 0, text: '14:03:27.000', taken: '14:03:27' },
  ] as const)('a wider $type is cut to the field only where the digits cut are zeros: $text', ({ type, precision, text, taken }) => {
    // A device logging to the microsecond writes .415000 for .415. Cutting zeros is
    // exact, and refusing it would send an answer the field can hold to the mask. Asked
    // of the paste itself: a time's mask happens to cut the same zeros, and a datetime's
    // moves the instant.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(pastedInstant(type, precision, text)).toBe(taken)
  })

  test.each([
    { type: 'datetime', precision: 3, text: '2026-11-15T13:03:27.415123Z' },
    { type: 'datetime', precision: 0, text: '2026-11-15T13:03:27.415Z' },
    { type: 'time', precision: 3, text: '14:03:27.415123' },
  ] as const)('a wider $type with a digit the field cannot hold is kept at its own width: $text', ({ type, precision, text }) => {
    // Review focus 1, as the review measured it in Zurich: read through the mask,
    // …27.415123Z in a precision-3 field stored …T12:03:27.415Z, an hour off, cut, and in
    // a valid shape; a time lost its last three digits. Kept as it is, nothing is moved
    // or dropped, the engine says shape, and the control shows it converted.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const stored = pasteInto(type, precision, text)
    expect(stored).toBe(text)
    expect(accepts(type, precision, stored)).toBe(false)
  })

  test('every instant-shaped text is taken whole, at any width, into a field of any width', () => {
    // One width that fell through to the mask would be one width whose digits are read
    // as the person's wall clock, the failure above. Each result is the text itself or
    // the same instant with zeros added or removed after the seconds.
    const sameInstant = (text: string, taken: string): boolean => {
      const [a, b] = [text.replace(/Z$/, ''), taken.replace(/Z$/, '')]
      const tail = a.startsWith(b) ? a.slice(b.length) : b.startsWith(a) ? b.slice(a.length) : undefined
      return tail !== undefined && /^\.?0*$/.test(tail)
    }
    for (const type of ['time', 'datetime'] as const) {
      for (let width = 0; width <= 9; width += 1) {
        for (const digits of ['415123789'.slice(0, width), '0'.repeat(width)]) {
          const fraction = width === 0 ? '' : `.${digits}`
          const text = type === 'time' ? `14:03:27${fraction}` : `2026-11-15T13:03:27${fraction}Z`
          for (let precision = 0; precision <= 9; precision += 1) {
            const taken = pastedInstant(type, precision, text)
            expect(taken, `${text} into ${type} p${precision}`).toBeDefined()
            expect(sameInstant(text, taken!), `${text} into ${type} p${precision} gave ${taken}`).toBe(true)
          }
        }
      }
    }
  })

  test('text a person could have typed into the mask, and that fits it, is read as typing', () => {
    // The typed shape is the person's own clock, and a fragment is the start of one.
    // Taken whole, either would be held as text no shape accepts, in place of what the
    // person would have got by typing it. A time without seconds is version 5's shape,
    // with no seconds to bring to a width.
    expect(pastedInstant('datetime', 3, '2026-11-15 14:03:27.415')).toBeUndefined()
    expect(pastedInstant('datetime', 3, '2026-11-15 14:03')).toBeUndefined()
    expect(pastedInstant('time', 3, '14:03')).toBeUndefined()
  })

  test.each([
    { precision: 3, text: '2026-11-15 14:03:27', why: 'stopped at the seconds' },
    { precision: 3, text: '2026-11-15 14', why: 'stopped at the hour' },
    { precision: 3, text: '20261115 14:03:27.415', why: 'the dashes left out' },
    { precision: 3, text: '20261115140327415', why: 'digits alone' },
    { precision: 0, text: '2026-11-15 14:03:27', why: 'complete at precision 0' },
  ])('a written character may be left out, and a fragment stops anywhere: $why', ({ precision, text }) => {
    // A rule on where each written character sits that also refused one left out, or a
    // text that stops short, would hold what the same keys type, and the person would be
    // refused a paste of the answer they could type.
    expect(pastedInstant('datetime', precision, text)).toBeUndefined()
  })

  test.each([
    { type: 'datetime', precision: 3, text: '2026-11-15 14:03:27.415', stored: '2026-11-15T13:03:27.415Z' },
    { type: 'time', precision: 0, text: '14:03:27', stored: '14:03:27' },
  ] as const)('so a typed-shape paste lands as the same keys would: $text', ({ type, precision, text, stored }) => {
    // Held as pasted instead, the person's own clock, pasted, would be refused although
    // typing it is accepted.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(pasteInto(type, precision, text)).toBe(stored)
  })

  test('a clock past 23:59:59 is no answer, so nothing is padded onto it', () => {
    // Taken as an answer, 25:00:00 would come back as 25:00:00.000: three digits nobody
    // pasted, on a time of day that does not exist. A time is typed as it is stored, so
    // the mask holds it as typed; an instant-shaped one is held as pasted.
    expect(pastedInstant('time', 3, '25:00:00')).toBeUndefined()
    expect(pastedInstant('datetime', 3, '2026-11-15T25:00:00Z')).toBe('2026-11-15T25:00:00Z')
    expect(pastedInstant('datetime', 3, '2026-11-15T13:60:00+01:00')).toBe('2026-11-15T13:60:00+01:00')
  })

  test('a day that does not exist, in UTC, is held as pasted rather than padded', () => {
    // 2026-02-30T10:00:00Z has the stored shape, so padded to .000 it passed the shape
    // check: a day nobody can have logged, accepted.
    const stored = pasteInto('datetime', 3, '2026-02-30T10:00:00Z')
    expect(stored).toBe('2026-02-30T10:00:00Z')
    expect(accepts('datetime', 3, stored)).toBe(false)
  })

  test('a time in its stored shape is taken as it is', () => {
    // A time has no zone, so its stored shape is its typed one, and the paste means what
    // it says in every control alike.
    expect(pastedInstant('time', 3, '14:03:27.415')).toBe('14:03:27.415')
  })
})

describe('an instant pasted with an offset, or with more digits than any field', () => {
  test.each(['Europe/Zurich', 'America/New_York', 'Asia/Kathmandu'])('is the same instant in UTC, wherever it is pasted: %s', (zone) => {
    // Review focus 1. An offset is the log saying which clock it read. Refused, the paste
    // fell to the mask, whose digits are the person's own clock: in New York this one was
    // stored as 19:03:27Z, six hours off, complete and in a valid shape.
    vi.stubEnv('TZ', zone)
    expect(pasteInto('datetime', 3, '2026-11-15T14:03:27.415+01:00')).toBe('2026-11-15T13:03:27.415Z')
  })

  test.each([
    { text: '2026-11-15T00:30:00-05:00', taken: '2026-11-15T05:30:00Z' },
    { text: '2026-11-15T21:30:00-05:00', taken: '2026-11-16T02:30:00Z' },
    { text: '2026-11-15T00:30:00+01:00', taken: '2026-11-14T23:30:00Z' },
    { text: '2026-12-31T23:30:00-01:00', taken: '2027-01-01T00:30:00Z' },
  ])('carries the offset across a day or a year: $text', ({ text, taken }) => {
    // An offset applied to the clock alone, without carrying into the date, would keep
    // the pasted day and land a day off, at a valid-looking hour.
    expect(pastedInstant('datetime', 0, text)).toBe(taken)
  })

  test.each([
    { form: 'a space for the T', text: '2026-11-15 13:03:27.415Z' },
    { form: 'a lower-case t and z', text: '2026-11-15t13:03:27.415z' },
    { form: 'an offset in hours alone', text: '2026-11-15 14:03:27.415+01' },
    { form: 'an offset without its colon', text: '2026-11-15T14:03:27.415+0100' },
  ])('written with $form, it is still that instant', ({ text }) => {
    // RFC 3339 allows the first two and PostgreSQL prints the third. Each is evidently an
    // instant; refused, its digits fell to the mask as the person's own clock, and in New
    // York the answer was stored five or six hours off.
    vi.stubEnv('TZ', 'America/New_York')
    expect(pasteInto('datetime', 3, text)).toBe('2026-11-15T13:03:27.415Z')
  })

  test('an offset that is not a whole hour is applied to the minute', () => {
    // Kathmandu logs at +05:45; read in whole hours, every instant would be 45 minutes off.
    expect(pastedInstant('datetime', 3, '2026-11-15T18:48:27.415+05:45')).toBe('2026-11-15T13:03:27.415Z')
  })

  test.each(['+00:00', '-00:00'])('an offset of %s is UTC, written as Z', (offset) => {
    // The stored form has one spelling for UTC. Kept as +00:00, the same instant would
    // be refused as shape.
    expect(pastedInstant('datetime', 3, `2026-11-15T13:03:27.415${offset}`)).toBe('2026-11-15T13:03:27.415Z')
  })

  test.each(['+24:00', '-24:00', '+01:60', '+2400', '+24'])('an offset outside a day, or past 59 minutes, is held as pasted: %s', (offset) => {
    // No zone is a day or more from UTC, so this is no instant to convert. Left to the
    // mask, its digits filled every position: in Zurich it was stored as …T12:03:27.415Z,
    // complete and shifted, and at precision 6 the offset's digits became the fraction.
    const text = `2026-11-15T13:03:27.415${offset}`
    expect(pastedInstant('datetime', 3, text)).toBe(text)
  })

  test('with a digit the field cannot hold, it is the UTC instant at its own width', () => {
    // Kept as pasted, with its offset, it could not have been typed, so the control would
    // show it empty. In UTC at its own width, it is the same instant, the engine says
    // shape, and the control shows it converted.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const taken = pastedInstant('datetime', 3, '2026-11-15T14:03:27.415123+01:00')
    expect(taken).toBe('2026-11-15T13:03:27.415123Z')
    expect(accepts('datetime', 3, taken ?? null)).toBe(false)
    expect(typedFromStored('datetime', 3, taken!)).toBe('20261115140327415')
  })

  test.each([
    { type: 'datetime', text: '2026-11-15T13:03:27.4151234567Z', taken: '2026-11-15T13:03:27.4151234567Z' },
    { type: 'datetime', text: '2026-11-15T14:03:27.4151234567+01:00', taken: '2026-11-15T13:03:27.4151234567Z' },
    { type: 'time', text: '14:03:27.4151234567', taken: '14:03:27.4151234567' },
  ] as const)('with more than nine digits after the seconds it is kept at its own width, in UTC: $text', ({ type, text, taken }) => {
    // No precision holds a tenth digit. Left to the mask, the instant's first digits were
    // read as the local clock and the rest cut. Kept, nothing moves and the engine says
    // shape; in UTC rather than at its offset, the control shows it converted.
    vi.stubEnv('TZ', 'America/New_York')
    expect(pasteInto(type, 9, text)).toBe(taken)
  })

  test('with an offset that takes it past year 9999, it is kept as pasted', () => {
    // 9999-12-31T23:30-01:00 is 10000-01-01T00:30Z, which four digits cannot write. Cut to
    // four, it would be another instant in a valid shape.
    expect(pastedInstant('datetime', 0, '9999-12-31T23:30:00-01:00')).toBe('9999-12-31T23:30:00-01:00')
  })

  test('on a day that does not exist, it is kept as pasted', () => {
    // Date would roll 30 February to 2 March before the offset was applied: an instant
    // nobody logged, written as Z and accepted.
    expect(pastedInstant('datetime', 0, '2026-02-30T10:00:00+01:00')).toBe('2026-02-30T10:00:00+01:00')
  })
})

describe('a paste that could not have been typed into the mask is held as pasted', () => {
  // Each of these was read through the mask as the person's own clock and stored complete,
  // in a valid shape, and shifted: the mask reads digits and drops the rest, so a zone, an
  // offset or a digit too many became part of the answer or vanished from it. The mask
  // reads a paste only when a person could have typed it; anything else is held exactly
  // as pasted, which the shape check refuses, at every precision.
  test.each([
    { type: 'datetime', text: '2026-11-15T13:03:27.415+24:00', why: 'an offset no zone has' },
    { type: 'datetime', text: '2026-11-15 14:03:27 +0100', why: "git's offset after a space" },
    { type: 'datetime', text: '2026-11-15T13:03:27,415Z', why: 'a decimal comma' },
    { type: 'datetime', text: '2026-11-15T13:03:27.415Z[UTC]', why: 'a zone name after the Z' },
    { type: 'datetime', text: '2026-11-15T14:03:27.415+01:00[Europe/Zurich]', why: 'a zone name after the offset' },
    { type: 'datetime', text: '2026-11-15\t13:03:27.415Z', why: 'a tab for the T' },
    { type: 'datetime', text: '2026-11-15\t14:03:27.415', why: 'a tab in a local clock' },
    { type: 'time', text: '14:03:27+01:00', why: 'a time with an offset' },
  ] as const)('$why: $text', ({ type, text }) => {
    vi.stubEnv('TZ', 'Europe/Zurich')
    for (let precision = 0; precision <= 9; precision += 1) {
      const stored = pasteInto(type, precision, text)
      expect(stored, `${type} p${precision}`).toBe(text)
      expect(accepts(type, precision, stored), `${type} p${precision}`).toBe(false)
    }
  })

  test.each([
    { text: '2026-11-15 14:03:27.415', why: 'with a stop the mask does not write' },
    { text: '20261115140327415', why: 'as digits alone, where only their count tells' },
  ])('a local clock with more digits than the field has positions is held, not cut to fit: $why', ({ text }) => {
    // Read through a precision-0 mask, 2026-11-15 14:03:27.415 was cut to …:27 and stored
    // complete: three digits the person pasted, dropped without a word.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const stored = pasteInto('datetime', 0, text)
    expect(stored).toBe(text)
    expect(accepts('datetime', 0, stored)).toBe(false)
  })

  test.each([
    { precision: 4, text: '20261115 140327-0100', why: 'a space before a dash' },
    { precision: 7, text: '20261115-140327.415 0100', why: 'a space after the stop' },
  ])('written characters out of the order the mask writes them are held: $why', ({ precision, text }) => {
    // Counted but not ordered, each passed as typing: the mask read their digits and, with
    // exactly as many as it has positions, stored a complete instant whose fraction was the
    // offset's digits — 14:03:27.0100 and 14:03:27.4150100 local, both accepted.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const stored = pasteInto('datetime', precision, text)
    expect(stored).toBe(text)
    expect(accepts('datetime', precision, stored)).toBe(false)
  })

  test.each([
    { zone: 'Europe/Zurich', precision: 4, text: '20261115140327-0100' },
    { zone: 'America/New_York', precision: 4, text: '20261115140327-0100' },
    { zone: 'Europe/Zurich', precision: 2, text: '20261115140327-01' },
    { zone: 'America/New_York', precision: 2, text: '20261115140327-01' },
  ])('a dash after the place the mask writes one is held, in $zone: $text', ({ zone, precision, text }) => {
    // The instant is 15:03:27Z. Read as typing, the offset's sign was dropped and its
    // digits became the fraction: …T13:03:27.0100Z in Zurich and …T19:03:27.0100Z in New
    // York, complete and accepted. No order catches a lone dash, since the mask writes one
    // first; only where it sits does — after the seconds, where the mask writes none.
    vi.stubEnv('TZ', zone)
    const stored = pasteInto('datetime', precision, text)
    expect(stored).toBe(text)
    expect(accepts('datetime', precision, stored)).toBe(false)
  })

  test('an offset after a date with its four-digit year is never read as typing, however the date and clock are written', () => {
    // The claim the code makes of an offset, checked over its spellings: one form that
    // reached the mask would have its sign dropped and its digits read as the person's
    // clock or its fraction. A time's mask writes no sign at all, so there any offset is.
    const offsets = ['-01', '-0100', '-01:00', '+01', '+0100', '+01:00', ' -0100', ' +0100', 'Z']
    const clocks = ['14', '1403', '14:03', '140327', '14:03:27', '140327415', '140327.415', '14:03:27.415']
    for (let precision = 0; precision <= 9; precision += 1) {
      for (const offset of offsets) {
        for (const clock of clocks) {
          expect(pastedInstant('time', precision, `${clock}${offset}`), `time p${precision}: ${clock}${offset}`).toBeDefined()
          for (const date of ['2026-11-15', '20261115']) {
            for (const between of ['', ' ', 'T']) {
              const text = `${date}${between}${clock}${offset}`
              expect(pastedInstant('datetime', precision, text), `datetime p${precision}: ${text}`).toBeDefined()
            }
          }
        }
      }
    }
  })

  test.each([
    { type: 'time', precision: 2, text: '1:15:23.456', shifted: '11:52:34.56' },
    { type: 'time', precision: 5, text: '1:05:12.123456', shifted: '10:51:21.23456' },
    { type: 'datetime', precision: 2, text: '2026-11-15 1:05:12.345', shifted: '2026-11-15T09:51:23.45Z' },
    { type: 'datetime', precision: 1, text: '2026-1-2 1:10:20.3040', shifted: '2026-12-11T01:03:04.0Z' },
    { type: 'datetime', precision: 0, text: '15-11-1112 14:03:27', shifted: '1511-11-12T13:29:19Z' },
  ] as const)('a written character before the place the mask writes it is held: $text', ({ type, precision, text, shifted }) => {
    // The mask drops a character it has no place for there, and every digit after it moves
    // one position left: read as typing, each of these was stored complete and in its shape
    // as `shifted`, an answer the text does not say (measured in Zurich, whose clock in 1511
    // was its local mean time). Allowed early, a written character marks no place at all.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(accepts(type, precision, shifted)).toBe(true)
    const stored = pasteInto(type, precision, text)
    expect(stored).toBe(text)
    expect(accepts(type, precision, stored)).toBe(false)
  })

  test.each(['261012-0100', '261012-01', '1403-0530'])(
    'a sign after four digits or six is read as the date’s own dash, and leaves the date unfinished: %s',
    (text) => {
      // What pastedInstant says of the one place an offset's sign can reach the mask: where a
      // datetime's mask writes its dashes. With only an offset's digits after it, the date has
      // ten digits at most, so it is never stored complete; were it, the offset's digits would
      // be a month, a day and an hour nobody meant — each of these completes to a real one.
      vi.stubEnv('TZ', 'Europe/Zurich')
      for (let precision = 0; precision <= 9; precision += 1) {
        expect(pastedInstant('datetime', precision, text), `p${precision}`).toBeUndefined()
        expect(accepts('datetime', precision, pasteInto('datetime', precision, text)), `p${precision}`).toBe(false)
      }
    },
  )

  test('a clock pasted into a datetime is held, not typed into the year', () => {
    // The mask writes no colon after two digits of a year, so 14:03 is no start of a
    // datetime: read as typing it was the year 1403, which is no use to anybody. Held, the
    // engine's shape error says it is no answer of the field. Into a time it is typing.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(pasteInto('datetime', 3, '14:03')).toBe('14:03')
    expect(typedFromStored('datetime', 3, '14:03')).toBe('')
  })

  test('a stop pasted into a precision-0 field is held, as the mask writes none', () => {
    // Read against the widest mask, 14:03:27. was typing at precision 0, and the stop was
    // dropped without a word; the field's own mask has no place for it.
    expect(pastedInstant('time', 0, '14:03:27.')).toBe('14:03:27.')
  })

  test.each([
    { precision: 4, text: '2026-11-15 14:03:27 0100', why: "git's offset without its sign, after a second space" },
    { precision: 3, text: '2026-11-15 14:03:27..415', why: 'a second stop, where the mask writes one' },
  ])('a written character more often than the mask writes it is held: $why', ({ precision, text }) => {
    // Two spaces cannot be typed into a mask that writes one. Read as digits, git's
    // offset without its sign filled a precision-4 mask's fraction: 14:03:27.0100. A
    // second stop sits where the mask writes its one, so only the count holds it; read
    // as typing, the mask dropped it without a word and stored the rest as complete.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(pasteInto('datetime', precision, text)).toBe(text)
  })
})

describe('conversions a probe checked once, pinned', () => {
  test('nine digits ending in zeros come back as nine digits, both ways', () => {
    // A fraction read as a number, or through Date, is .1 or .100: the zeros are digits
    // the field declares, and a value supplied as .100000000 is submitted byte-identical.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(storedFromTyped('datetime', 9, '20261115140327100000000')).toBe('2026-11-15T13:03:27.100000000Z')
    expect(typedFromStored('datetime', 9, '2026-11-15T13:03:27.100000000Z')).toBe('20261115140327100000000')
    expect(storedFromTyped('time', 9, '140327100000000')).toBe('14:03:27.100000000')
    expect(typedFromStored('time', 9, '14:03:27.100000000')).toBe('140327100000000')
  })

  test('a zone whose offset is not a whole hour converts both ways', () => {
    // Kathmandu is UTC+05:45. An offset taken in whole hours would put every answer
    // there 45 minutes off, and Zurich and New York would never show it.
    vi.stubEnv('TZ', 'Asia/Kathmandu')
    expect(storedFromTyped('datetime', 3, '20261115184827415')).toBe('2026-11-15T13:03:27.415Z')
    expect(typedFromStored('datetime', 3, '2026-11-15T13:03:27.415Z')).toBe('20261115184827415')
  })

  test('a date before 1970 converts both ways', () => {
    // Before the epoch an instant is a negative count of milliseconds, where arithmetic
    // that splits off the seconds by remainder goes wrong. Zurich kept no summer time in
    // 1965, so its clock read UTC+1.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(storedFromTyped('datetime', 3, '19650615113015250')).toBe('1965-06-15T10:30:15.250Z')
    expect(typedFromStored('datetime', 3, '1965-06-15T10:30:15.250Z')).toBe('19650615113015250')
  })
})

describe('what a paste into a typed control means', () => {
  const SHOWN = '2026-11-15 09:03:27.415'
  const INSTANT = '2026-11-15T13:03:27.415Z'
  const CLOCK = '14:03:27.415'
  const place = (shown: string, from: number, to: number, pasted: string) => ({
    before: shown.slice(0, from),
    selected: shown.slice(from, to),
    pasted,
    after: shown.slice(to),
  })

  test.each([
    // Read as an edit, a change of nothing is what the mask takes for a backspace, so the digit
    // before the caret went: 0 over its own 0 stored 14:32:74.15.
    ['0 pasted over a selected 0', 'time', CLOCK, 3, 4, '0'],
    // An empty clipboard, or one holding only an image, pastes nothing; at caret 5 it stored 14:02:74.15.
    ['an empty paste at the caret', 'time', CLOCK, 5, 5, ''],
    ['an empty paste into an empty field', 'time', '', 0, 0, ''],
    // A datetime's own clock pasted over itself lost its last digit.
    ["a datetime's own clock over itself", 'datetime', SHOWN, 11, 23, '09:03:27.415'],
    ['a whole datetime over itself', 'datetime', SHOWN, 0, 23, SHOWN],
  ] as const)('%s changes nothing, as typing the same text does', (_name, type, shown, from, to, pasted) => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(pasteOutcome(type, 3, place(shown, from, to, pasted))).toEqual({ ignored: true })
  })

  test.each([
    // Read as typing, the digits that do not fit were cut and the rest stored, complete and
    // accepted: an answer the pasted text does not denote. Measured in Zurich, these stored
    // 13:03:27, …T12:03:27.415Z and …T12:03:27Z.
    ['nine digits into an empty time of whole seconds', 'time', 0, '', 0, 0, '130327415'],
    ['twenty-one digits into an empty datetime', 'datetime', 3, '', 0, 0, '202611151303274151234'],
    ['seventeen digits over a whole datetime of whole seconds', 'datetime', 0, '2026-11-15 14:03:27', 0, 19, '20261115130327415'],
    ['twenty-one digits over a whole datetime', 'datetime', 3, SHOWN, 0, 23, '202611151303274151234'],
    // With the field's own digits there is no room either; ignored, nothing is cut.
    ['a digit at the end of a full time', 'time', 3, CLOCK, 12, 12, '6'],
    ['a digit at the end of a full datetime', 'datetime', 3, SHOWN, 23, 23, '9'],
  ] as const)('%s is ignored, never cut to fit', (_name, type, precision, shown, from, to, pasted) => {
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(pasteOutcome(type, precision, place(shown, from, to, pasted))).toEqual({ ignored: true })
  })

  test.each([
    // Digits carry no zone, so there is nothing to misread, and the mask places them as the
    // same keystrokes, even where that leaves the field's own colon after one digit.
    ['one digit over the hour, as typing it there is', 'time', CLOCK, 0, 2, '0', '0:03:27.415'],
    // Exactly as many digits as the mask has positions: every one is placed and none is cut.
    ['nine digits over a whole time', 'time', CLOCK, 0, 12, '140327415', '140327415'],
    ['seventeen digits over a whole datetime', 'datetime', SHOWN, 0, 23, '20261115130327415', '20261115130327415'],
  ] as const)('%s is typing', (_name, type, shown, from, to, pasted, text) => {
    expect(pasteOutcome(type, 3, place(shown, from, to, pasted))).toEqual({ typed: text })
  })

  test('a bare-digit log paste into an empty datetime is typing, read as local', () => {
    // With no zone there is nothing to misread: these digits are the person's own clock exactly
    // as if they had typed them.
    expect(pasteOutcome('datetime', 3, place('', 0, 0, '20261115130327415'))).toEqual({ typed: '20261115130327415' })
  })

  test.each([
    // 59 over the minutes is whole text of one time; read alone it is no time.
    ['59 over the minutes', CLOCK, 3, 5, '59', '14:59:27.415'],
    // The pasted tail joined to what was shown reads as the rest of one time.
    ['a tail completing a partial time', '14:0', 4, 4, '3:27.415', '14:03:27.415'],
  ] as const)('%s is typing', (_name, shown, from, to, pasted, text) => {
    expect(pasteOutcome('time', 3, place(shown, from, to, pasted))).toEqual({ typed: text })
  })

  test('a whole time pasted into the middle of a filled time is that time, not a merge', () => {
    // Merged, its digits would be pushed through the mask into an answer nobody wrote.
    expect(pasteOutcome('time', 3, place(CLOCK, 3, 5, '09:15:00.000'))).toEqual({ answer: '09:15:00.000' })
  })

  const SELECTIONS = [
    ['at the start', 0, 0],
    ['over the date', 0, 10],
    ['over the year', 0, 4],
    ['over all but the last digit', 0, 22],
    ['over the hour', 11, 13],
    ['over the clock', 11, 23],
    ['at the end', 23, 23],
  ] as const

  describe.each(['Europe/Zurich', 'America/New_York'])('in %s', (zone) => {
    test.each(SELECTIONS)('an instant pasted %s is the answer, never local digits', (_where, from, to) => {
      // It said which instant it was; read through the mask the zone was dropped and the shown
      // clock's digits stored instead, hours from the instant, or on another day altogether.
      // PostgreSQL writes the offset as +00, or -05 west of UTC, with a space for the T.
      vi.stubEnv('TZ', zone)
      for (const text of [INSTANT, '2026-11-15 13:03:27.415+00', '2026-11-15 12:03:27.415-01', '2026-11-15 08:03:27.415-05', '2026-11-15T14:03:27.415+01:00']) {
        expect(pasteOutcome('datetime', 3, place(SHOWN, from, to, text)), text).toEqual({ answer: INSTANT })
      }
    })
  })

  test('an offset pasted after a local clock is ignored, not read at that offset', () => {
    // "-01" is a sign the mask writes only after the year and month, so it has no place there;
    // stored it would be this clock at that offset, an instant the person never read.
    for (const offset of ['Z', '+01:00', '-01:00', '-01', '-0100']) {
      expect(pasteOutcome('datetime', 3, place(SHOWN, 23, 23, offset)), offset).toEqual({ ignored: true })
    }
  })

  test.each([
    // Fragments of an offset joined to the field's digits became one nobody wrote.
    ['a fragment ending in an offset over a minute digit', 'datetime', SHOWN, 15, 16, '3:27-01'],
    ['an unfinished offset over twenty-one characters', 'datetime', SHOWN, 0, 21, '2026-11-15 13:03:27-'],
    ['an offset of a day', 'datetime', SHOWN, 11, 23, '13:03:27.415-24:00'],
    ['a zone after a date split by the paste', 'datetime', '2026-11-1', 9, 9, '6T13:03:27.415Z'],
    ['a zone after the start of a time', 'time', '14:0', 4, 4, '3:27.415Z'],
  ] as const)('%s is ignored', (_name, type, shown, from, to, pasted) => {
    expect(pasteOutcome(type, 3, place(shown, from, to, pasted))).toEqual({ ignored: true })
  })

  test('an instant whose year passes 9999 once converted is ignored, not stored as local digits', () => {
    // 9999-12-31 23:30 at -01:00 is year 10000 in UTC, which no stored text can say.
    expect(pasteOutcome('datetime', 3, place(SHOWN, 11, 23, '9999-12-31 23:30:00.000-01:00'))).toEqual({ ignored: true })
  })

  test('a T-and-Z clock over the clock in Tokyo is ignored, never the local date as a UTC date', () => {
    // A clock with a zone and no date is no instant; held, it came out complete and accepted.
    vi.stubEnv('TZ', 'Asia/Tokyo')
    expect(pasteOutcome('datetime', 3, place(SHOWN, 11, 23, 'T13:03:27.415Z'))).toEqual({ ignored: true })
  })

  test('a fraction of ten digits is kept as UTC at its own width, over a selection', () => {
    // It matched no shape the mask or the field has, and was read as ten typed digits.
    const long = '2026-11-15T13:03:27.4151234567Z'
    expect(pasteOutcome('datetime', 3, place(SHOWN, 10, 23, long))).toEqual({ answer: long })
  })

  test('a whole paste is judged as it always was, and what is neither is now ignored', () => {
    expect(pasteOutcome('datetime', 3, place('', 0, 0, '2026-11-15T14:03:27.415+01:00'))).toEqual({ answer: '2026-11-15T13:03:27.415Z' })
    expect(pasteOutcome('time', 3, place('', 0, 0, '140327415'))).toEqual({ typed: '140327415' })
    // Held, "noon-ish" was a shape error the person was told about; ignored, the field simply
    // does not take it, as it does not take the letter typed. The accepted cost.
    expect(pasteOutcome('time', 3, place('', 0, 0, 'noon-ish'))).toEqual({ ignored: true })
  })
})
