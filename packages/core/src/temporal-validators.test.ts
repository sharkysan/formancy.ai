import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * Temporal answers, checked for shape and then bounded.
 *
 * A bound is a string comparison, and that is only correct while every answer takes
 * one canonical, zero-padded, fixed-width form. Measured: `'9:30' < '10:00'` is
 * **false** while `'09:30' < '10:00'` is true, and
 * `'2026-09-19T10:00:00+03:00' < '2026-09-19T08:00:00Z'` is **false** although the
 * first instant is 07:00Z and therefore earlier.
 *
 * So an answer of the wrong shape must FAIL rather than be compared. Comparing it
 * gives an ordering nobody predicted, and on the server that is the hostile-payload
 * path: a bounded field becomes unbounded for anyone who sends a value the bound
 * cannot order.
 *
 * `date` is a version 1 type and **nothing has ever checked its shape**. A
 * deployment posting `19/09/2026` has been accepted until now and starts failing
 * with `shape`.
 *
 * Taken on purpose. The freeze promises a version 1 *document* keeps validating, not
 * that a malformed *answer* keeps being accepted — and an unchecked date cannot be
 * bounded, sorted or exported without the reader guessing which of `03/04` is the
 * month. The last case in this file is that change, asserted rather than left for
 * somebody to discover from a support ticket.
 */

const schema: FormSchema = {
  specVersion: '2',
  id: 'booking',
  title: 'Booking',
  model: {
    fields: [
      { key: 'day', type: 'date' },
      { key: 'slot', type: 'time', earliest: '09:00', latest: '17:00' },
      {
        key: 'at',
        type: 'datetime',
        earliest: '2026-01-01T00:00:00Z',
        latest: '2026-12-31T23:59:59Z',
      },
    ],
  },
} as FormSchema

function errorsFor(initialValue: Record<string, unknown>): Record<string, string[]> {
  return createFormEngine({ schema, initialValue }).validate().errors
}

describe('a time answer', () => {
  test('inside its bounds trips nothing', () => {
    expect(errorsFor({ slot: '09:00' })).toEqual({})
    expect(errorsFor({ slot: '12:30' })).toEqual({})
    // Inclusive at both ends: a bound that excluded its own value would make
    // "between 09:00 and 17:00" a lie in the two cases people check first.
    expect(errorsFor({ slot: '17:00' })).toEqual({})
  })

  test('outside its bounds says which end', () => {
    // Which end matters to the message catalogue: "too early" and "too late" are
    // different sentences, and one code for both would force every consumer to
    // re-derive it from the value.
    expect(errorsFor({ slot: '08:59' })).toEqual({ slot: ['earliest'] })
    expect(errorsFor({ slot: '17:01' })).toEqual({ slot: ['latest'] })
  })

  test('of the wrong shape fails on the shape and is not compared', () => {
    // `'9:30'` is inside 09:00–17:00 as a time and BEFORE '09:00' as a string, so a
    // bound applied to it would reject a legal answer for the wrong reason. Failing
    // on the shape is what keeps the bound honest.
    expect(errorsFor({ slot: '9:30' })).toEqual({ slot: ['shape'] })
    expect(errorsFor({ slot: '24:00' })).toEqual({ slot: ['shape'] })
    expect(errorsFor({ slot: '09:30:00' })).toEqual({ slot: ['shape'] })
    // The hostile-payload path: a non-string where a string belongs.
    expect(errorsFor({ slot: 930 })).toEqual({ slot: ['shape'] })
  })

  test('that is empty trips nothing, because emptiness is required’s job', () => {
    expect(errorsFor({ slot: null })).toEqual({})
    expect(errorsFor({})).toEqual({})
  })
})

describe('a datetime answer', () => {
  test('must carry Z, and an offset is refused however correct the instant', () => {
    // The measured case that decided the format. `+03:00` sorts after `Z` as text
    // while being earlier in fact, so two answers to one field would be
    // incomparable — and a bound over them would be meaningless.
    expect(errorsFor({ at: '2026-06-01T12:00:00Z' })).toEqual({})
    expect(errorsFor({ at: '2026-06-01T12:00:00+03:00' })).toEqual({ at: ['shape'] })
    // Zoneless cannot be compared with a frozen clock and agree on both sides.
    expect(errorsFor({ at: '2026-06-01T12:00:00' })).toEqual({ at: ['shape'] })
    // Seconds mandatory and no fractional part, so the width is fixed.
    expect(errorsFor({ at: '2026-06-01T12:00Z' })).toEqual({ at: ['shape'] })
    expect(errorsFor({ at: '2026-06-01T12:00:00.000Z' })).toEqual({ at: ['shape'] })
  })

  test('outside its bounds says which end', () => {
    expect(errorsFor({ at: '2025-12-31T23:59:59Z' })).toEqual({ at: ['earliest'] })
    expect(errorsFor({ at: '2027-01-01T00:00:00Z' })).toEqual({ at: ['latest'] })
  })
})

describe('a date answer', () => {
  test('of the documented shape trips nothing', () => {
    expect(errorsFor({ day: '2026-09-19' })).toEqual({})
  })

  test('of another shape now fails, which is a change for a frozen type', () => {
    // Version 1 fixed `date` as a date-only ISO 8601 string and nothing checked it,
    // so these were accepted until now. The freeze promises a version 1 DOCUMENT
    // keeps validating; it does not promise a malformed ANSWER keeps being accepted,
    // and an unchecked date cannot be bounded, sorted or exported without the reader
    // guessing which of `03/04` is the month.
    expect(errorsFor({ day: '19/09/2026' })).toEqual({ day: ['shape'] })
    expect(errorsFor({ day: '2026-9-19' })).toEqual({ day: ['shape'] })
    expect(errorsFor({ day: 'tomorrow' })).toEqual({ day: ['shape'] })
  })

  test('is not comparable with a datetime, and the shapes are why', () => {
    // `'2026-09-19' < '2026-09-19T00:00:00Z'` is true because the shorter string is a
    // prefix, so a date sorts before every instant on its own day, midnight
    // included. Asserted here so nobody later "helpfully" allows a datetime bound on
    // a date field.
    expect('2026-09-19' < '2026-09-19T00:00:00Z').toBe(true)
  })
})
