import { afterEach, describe, expect, test, vi } from 'vitest'

import { editMasked, formatMasked } from './mask.js'
import { temporalShape } from './temporal.js'
import { pastedInstant, storedFromTyped, temporalEntryMask, typedFromStored } from './temporal-entry.js'
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
    // Showing an answer and taking it back must agree to the digit, or a person who
    // retypes one digit of a supplied value moves the rest of it.
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

  test('a stored instant on a day that does not exist shows its digits, not the day Date rolls to', () => {
    // 2026-02-30T10:00:00Z has the shape and is no instant. Shown as 2 March, the control
    // would display a day the answer does not hold.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(typedFromStored('datetime', 0, '2026-02-30T10:00:00Z')).toBe('20260230100000')
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

  test('text that is not a whole answer at this precision is left to the mask', () => {
    // A fragment, or an instant at another width, is not an answer this field can take
    // as it is; the control reads it as typed digits instead.
    expect(pastedInstant('datetime', 3, '14:03')).toBeUndefined()
    expect(pastedInstant('datetime', 3, '2026-11-15T13:03:27Z')).toBeUndefined()
    expect(pastedInstant('datetime', 3, '2026-11-15 14:03:27.415')).toBeUndefined()
  })

  test('a time in its stored shape is taken as it is', () => {
    // A time has no zone, so its stored shape is its typed one, and the paste means what
    // it says in every control alike.
    expect(pastedInstant('time', 3, '14:03:27.415')).toBe('14:03:27.415')
    expect(pastedInstant('time', 3, '14:03')).toBeUndefined()
  })
})
