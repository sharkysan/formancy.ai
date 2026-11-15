import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A bound is written at its field's width.
 *
 * Bounds compare as text, which is chronological only while both sides have the same
 * width ("09:30:00" < "09:30:00.5" is true, "09:30:00.5" < "09:30:00.123" is not what the
 * clock says). The schema lets a bound be written at any width, since it cannot see the
 * field's precision; this check holds the bound to the one width its field has.
 */
const formWith = (field: Partial<FieldDef>, specVersion = '6'): FormSchema =>
  ({
    specVersion,
    id: 'reading',
    title: 'Reading',
    model: { fields: [{ key: 'at', type: 'time', label: 'At', ...field }] },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('a bound at the wrong width', () => {
  // The case the widening exists for: the schema now accepts "09:00", so only this check
  // stands between a coarser bound and a field that compares it against finer answers.
  test('is refused, naming the shape the field expects', () => {
    expect(errorsOf(formWith({ precision: 3, earliest: '09:00' }))).toMatchObject([
      { path: '/model/fields/0/earliest', code: 'bounds.width', values: { expected: '09:30:00.000' } },
    ])
  })

  // The same for the other bound and for a datetime, so neither path is left unchecked.
  test('is refused on latest, and on a datetime', () => {
    expect(errorsOf(formWith({ type: 'datetime', precision: 3, latest: '2026-10-08T09:30:00Z' }))).toMatchObject([
      { path: '/model/fields/0/latest', code: 'bounds.width', values: { expected: '2026-10-08T09:30:00.000Z' } },
    ])
  })

  // A check that only refused too narrow would let a bound with extra digits through.
  test('is refused when it is finer than the field', () => {
    expect(errorsOf(formWith({ precision: 0, earliest: '09:00:00.000' }))).toMatchObject([{ code: 'bounds.width' }])
  })

  // The width the field asks for must pass, or no bound could ever be written.
  test('at the right width passes', () => {
    expect(errorsOf(formWith({ precision: 3, earliest: '09:00:00.000', latest: '17:00:00.000' }))).toEqual([])
  })

  // Version 5 has no precision: its shape is HH:MM, and the pattern used to say so. The
  // pattern is wider now, so the refusal has to survive in this check.
  test('with no precision is the version 5 shape, so seconds are still refused', () => {
    expect(errorsOf(formWith({ earliest: '09:00:00' }, '5'))).toMatchObject([{ code: 'bounds.width', values: { expected: '09:30' } }])
  })

  // A crossed pair is a real mistake and must still be named once the widths are right.
  test('a crossed pair at the right width is still crossed', () => {
    expect(errorsOf(formWith({ precision: 3, earliest: '17:00:00.000', latest: '09:00:00.000' }))).toMatchObject([{ code: 'bounds.crossed' }])
  })

  // Comparing strings of different widths says nothing; naming both mistakes would send
  // the author to fix an order that is not the problem.
  test('is not also reported as crossed', () => {
    const codes = errorsOf(formWith({ precision: 3, earliest: '17:00', latest: '09:00:00.000' })).map((e) => e.code)
    expect(codes).toEqual(['bounds.width'])
  })

  // The schema refuses precision 12; the shape functions throw on it. The validator must
  // report the schema's refusal and not crash on the width check.
  test('is not checked against a precision the schema refused', () => {
    expect(() => errorsOf(formWith({ precision: 12, earliest: '09:00' }))).not.toThrow()
  })
})

/**
 * A field with a precision refuses an answer on a day the calendar does not have (`shape`), so a
 * bound on such a day is no answer the field could have: its typed entry shows it empty, and a
 * `default` there stops the form opening. Its digits are all in their places, so the width check
 * alone lets it through.
 */
describe('a bound on a field with a precision', () => {
  // 30 February at the field's width: the case the width check passed.
  test('on a day that does not exist is refused, naming the bound', () => {
    expect(errorsOf(formWith({ type: 'datetime', precision: 3, earliest: '2026-02-30T00:00:00.000Z' }))).toMatchObject([
      { path: '/model/fields/0/earliest', code: 'bounds.noSuchDay', values: { bound: '2026-02-30T00:00:00.000Z' } },
    ])
  })

  // The other bound, and a month the calendar has none of, so neither path is left unchecked.
  test('in a month that does not exist is refused on latest', () => {
    expect(errorsOf(formWith({ type: 'datetime', precision: 0, latest: '2026-13-01T00:00:00Z' }))).toMatchObject([
      { path: '/model/fields/0/latest', code: 'bounds.noSuchDay' },
    ])
  })

  // A check that read the calendar wrongly would refuse a leap day, and with it every bound in it.
  test('on 29 February of a leap year passes', () => {
    expect(errorsOf(formWith({ type: 'datetime', precision: 3, earliest: '2028-02-29T00:00:00.000Z' }))).toEqual([])
  })

  // A field without a precision accepts 30 February as an answer, as 0.13.0 did, so refusing its
  // bound would turn a valid version-5 document invalid.
  test('is not looked at on a field without a precision', () => {
    expect(errorsOf(formWith({ type: 'datetime', earliest: '2026-02-30T00:00:00Z' }, '5'))).toEqual([])
  })
})
