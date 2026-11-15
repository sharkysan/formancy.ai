import { describe, expect, test } from 'vitest'

import { temporalAnyShape, temporalExample, temporalShape } from './temporal.js'
import { FIELD_TYPES, SPEC_1_FIELD_TYPES, TEMPORAL_SHAPES } from './types.js'
import type { TemporalFieldType } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `time` and `datetime`, and the `earliest`/`latest` bounds.
 *
 * CEL has no time type, so a temporal answer binds as a **string** and the only
 * ordering available is lexicographic. That equals chronological ordering only
 * while the form is fixed-width, zero-padded and big-endian — which makes the
 * shape load-bearing rather than tidy. Measured, not assumed:
 *
 * | comparison | as strings | chronologically |
 * |---|---|---|
 * | `"9:30" < "10:00"` | false | — (wrong order) |
 * | `"09:30" < "10:00"` | true | correct |
 * | `"2026-09-19T10:00:00+03:00" < "2026-09-19T08:00:00Z"` | false | **true** |
 *
 * The first two say an unpadded hour turns every bound into a coin toss. The third
 * is why `datetime` stores `Z` and never a numeric offset: the first instant is
 * 07:00Z and therefore earlier, and no amount of care in a comparison recovers that
 * from the strings.
 *
 * The engine is isomorphic and `now()` is frozen per transaction, so a value whose
 * meaning depends on who is reading it cannot be compared with the clock on both
 * sides and agree. This repository had already decided that for expressions:
 * `bindTimestamp` in `packages/expressions/src/values.ts` refuses a zoneless string
 * outright, because "a submission that evaluated in the browser must replay
 * byte-identically on a server whose zone the browser never knew".
 *
 * `time` carries no zone and is therefore NOT an instant. It cannot be compared with
 * `now()`, and that is a property of what a time of day is rather than a gap. When
 * the wall clock is the commitment, a `date` and a `time` say it; a zone *name* would
 * put the host's IANA data into the replay contract, and two runtimes with different
 * ICU versions would disagree about the same answer.
 *
 * **So there is no per-field `timezone` property**, and the absence is deliberate.
 *
 * They are `number` and gated to `type: "number"`. Widening them to `number |
 * string` would let TypeScript accept `min: "5"` on a number field the schema
 * refuses — the types-versus-schema drift this repository keeps finding. One pair
 * per meaning is the existing habit: `min`/`max`, `minLength`/`maxLength`,
 * `minItems`/`maxItems`. So temporal bounds are `earliest`/`latest`.
 *
 * A bound is a **literal**, never an expression and never the clock. `now()` inside
 * one would let the same submission pass in the browser and fail on the server by
 * the width of the trip. "Must be in the future" stays a `validate` rule, where the
 * race belongs to the author and is visible to them.
 */

function documentWith(field: Record<string, unknown>, specVersion = '2'): Record<string, unknown> {
  return {
    specVersion,
    id: 'temporal',
    title: 'Temporal',
    model: { fields: [{ key: 'at', label: 'At', ...field }] },
  }
}

const errorsFor = (document: Record<string, unknown>): readonly string[] => {
  const result = validateSchema(document)
  return result.valid ? [] : result.errors.map((error) => `${error.path} ${error.message}`)
}

describe('the two types', () => {
  test('exist, and are not version 1 types', () => {
    // A guard on everything below, and on the version gate: both assertions fail
    // vacuously against types that do not exist.
    expect(FIELD_TYPES).toContain('time')
    expect(FIELD_TYPES).toContain('datetime')
    expect(SPEC_1_FIELD_TYPES).not.toContain('time')
    expect(SPEC_1_FIELD_TYPES).not.toContain('datetime')
  })

  test.each(['time', 'datetime'])('%s in a version 1 document is refused by name', (type) => {
    const errors = errorsFor(documentWith({ type }, '1'))
    expect(errors.join('\n')).toMatch(new RegExp(type))
    expect(errors.join('\n')).toMatch(/specVersion "2"/)
  })
})

describe('the canonical shapes', () => {
  test('are published as patterns, so the schema and the engine cannot disagree', () => {
    // Two closed descriptions of one rule is the drift this repository keeps
    // finding, so the pattern is declared once and read by both.
    expect(Object.keys(TEMPORAL_SHAPES).sort()).toEqual(['date', 'datetime', 'time'])
  })

  test.each([
    ['time', '09:30', true],
    ['time', '23:59', true],
    ['time', '00:00', true],
    // Unpadded is the one that makes a bound a coin toss: '9:30' < '10:00' is false.
    ['time', '9:30', false],
    ['time', '24:00', false],
    ['time', '23:60', false],
    // No seconds: a second width is a second ordering, and nothing asks for them.
    ['time', '09:30:00', false],
    ['datetime', '2026-09-19T08:00:00Z', true],
    // An offset breaks ordering against Z, measured above.
    ['datetime', '2026-09-19T10:00:00+03:00', false],
    // Zoneless cannot be compared with a frozen clock and agree on both sides.
    ['datetime', '2026-09-19T08:00:00', false],
    // Seconds are mandatory so the width is fixed.
    ['datetime', '2026-09-19T08:00Z', false],
    // A fractional part is a second width again.
    ['datetime', '2026-09-19T08:00:00.000Z', false],
  ])('%s accepts %s: %s', (type, value, ok) => {
    const pattern = new RegExp(TEMPORAL_SHAPES[type as 'time' | 'datetime'])
    expect(pattern.test(value)).toBe(ok)
  })

  test('each type and precision accepts its own width and refuses its neighbours', () => {
    // A shape that also accepted the next width would let a bound at one width through on a
    // field of another, and the text comparison would be wrong with no error.
    const widths = [undefined, ...Array.from({ length: 10 }, (_, i) => i)]
    for (const type of ['time', 'datetime'] as const) {
      widths.forEach((p, i) => {
        const shape = new RegExp(temporalShape(type, p))
        expect(temporalExample(type, p)).toMatch(shape)
        for (const q of [widths[i - 1], widths[i + 1]]) {
          if (i === 0 && q === undefined) continue
          const neighbour = temporalExample(type, q)
          // On a datetime, absent and 0 are one shape, so neither refuses the other.
          if (neighbour === temporalExample(type, p)) continue
          expect(neighbour).not.toMatch(shape)
        }
      })
    }
  })

  test('answers of one width sort as text in the order they happen', () => {
    // The property the whole design exists to buy, asserted for every width: widening a
    // pattern later fails here rather than silently making a bound wrong. Instants cross
    // 09:xx to 10:xx, a day, a year and a millisecond, so an unpadded field misorders.
    const base = Date.UTC(2025, 11, 31, 8, 59, 59, 0)
    const steps = [0, 1, 7, 999, 1000, 61_000, 3_600_000, 3_661_001, 7_200_000, 86_400_000]
    const instants = [...steps, ...steps.map((s) => s + 400 * 86_400_000 + 3)].map((s) => new Date(base + s))
    expect(instants).toHaveLength(20)
    const widths: [TemporalFieldType, number | undefined][] = [
      ['time', undefined],
      ['datetime', undefined],
      ...(['time', 'datetime'] as const).flatMap((t) => Array.from({ length: 10 }, (_, p) => [t, p] as const)),
    ]
    for (const [type, precision] of widths) {
      const shape = new RegExp(temporalShape(type, precision))
      const texts = instants.map((d) => format(d, type, precision))
      // A time wraps at midnight, so only the instants within one day are ordered by it.
      const ordered = type === 'time' ? texts.slice(0, 8) : texts
      for (const t of ordered) expect(t).toMatch(shape)
      expect([...ordered].reverse().sort()).toEqual(ordered)
    }
  })

  test('answers of two widths do not', () => {
    // The same instant at two widths is two strings, and the longer one sorts first because
    // '.' < 'Z'. A bound at one width compared with an answer at another is therefore wrong,
    // which is why a bound must be written at its field's width.
    expect('2026-10-08T10:34:56.000Z' < '2026-10-08T10:34:56Z').toBe(true)
  })

  test('the version-5 shapes are the absent case', () => {
    // TEMPORAL_SHAPES is public API; if the function drifts from it, version-5 documents
    // are validated against a pattern nobody published.
    for (const type of ['date', 'time', 'datetime'] as const) expect(TEMPORAL_SHAPES[type]).toBe(temporalShape(type))
  })

  test('date ignores precision', () => {
    // A date has no time of day; a precision on it must not change its shape.
    expect(temporalShape('date', 5)).toBe(temporalShape('date'))
    expect(temporalExample('date', 5)).toBe('2026-10-08')
  })

  test.each([-1, 10, 1.5, Number.NaN])('precision %s is refused', (precision) => {
    // Outside 0..9 there is no shape; returning one would validate documents no reader can parse.
    expect(() => temporalShape('time', precision)).toThrow(RangeError)
    expect(() => temporalExample('datetime', precision)).toThrow(RangeError)
  })

  test.each([
    ['time', undefined, '09:30'],
    ['time', 0, '09:30:00'],
    ['time', 3, '09:30:00.000'],
    ['datetime', undefined, '2026-10-08T09:30:00Z'],
    ['datetime', 0, '2026-10-08T09:30:00Z'],
    ['datetime', 9, '2026-10-08T09:30:00.000000000Z'],
  ] as const)('the example for %s at %s is %s', (type, precision, example) => {
    // The sentences quote these; a wrong example teaches the author a shape that is refused.
    expect(temporalExample(type, precision)).toBe(example)
  })

  test('the any-width shape admits every width of its type and nothing else', () => {
    // A bound is checked against this before its field is known; too narrow refuses a valid
    // bound, too wide admits another type's value.
    for (const type of ['time', 'datetime'] as const) {
      const any = new RegExp(temporalAnyShape(type))
      for (const p of [undefined, ...Array.from({ length: 10 }, (_, i) => i)]) expect(temporalExample(type, p)).toMatch(any)
    }
    expect('09:30').not.toMatch(new RegExp(temporalAnyShape('datetime')))
    expect('2026-10-08T09:30:00Z').not.toMatch(new RegExp(temporalAnyShape('time')))
    expect('09:30:00.0000000000').not.toMatch(new RegExp(temporalAnyShape('time')))
  })
})

/** One instant in the shape of a type and precision, written independently of the code under test. */
function format(d: Date, type: TemporalFieldType, precision: number | undefined): string {
  const iso = d.toISOString() // 2026-10-08T09:30:00.123Z
  const clock = iso.slice(11, 16)
  if (type === 'time') {
    if (precision === undefined) return clock
    return precision === 0 ? iso.slice(11, 19) : `${iso.slice(11, 19)}.${iso.slice(20, 23).padEnd(precision, '0').slice(0, precision)}`
  }
  const head = iso.slice(0, 19)
  return precision === undefined || precision === 0 ? `${head}Z` : `${head}.${iso.slice(20, 23).padEnd(precision, '0').slice(0, precision)}Z`
}

describe('the bounds', () => {
  test.each(['date', 'time', 'datetime'])('%s accepts earliest and latest', (type) => {
    const sample = { date: '2026-09-19', time: '09:30', datetime: '2026-09-19T08:00:00Z' }[type as 'date' | 'time' | 'datetime']
    expect(errorsFor(documentWith({ type, earliest: sample, latest: sample }))).toEqual([])
  })

  test('are refused in the shape of a different type', () => {
    // A bound in the wrong form is not a near miss: compared as a string against an
    // answer of the right form, it is an ordering nobody predicted.
    expect(errorsFor(documentWith({ type: 'time', earliest: '2026-09-19' }))).not.toEqual([])
    expect(errorsFor(documentWith({ type: 'datetime', earliest: '09:30' }))).not.toEqual([])
  })

  test('are refused on a type that has no temporal answer', () => {
    expect(errorsFor(documentWith({ type: 'text', earliest: '09:30' }))).not.toEqual([])
  })

  test('are refused when earliest is after latest, which no answer can satisfy', () => {
    // A field nobody can fill in, published. The repository refuses the same shape
    // of impossibility elsewhere rather than letting an author discover it from a
    // form that rejects everything.
    const errors = errorsFor(documentWith({ type: 'time', earliest: '17:00', latest: '09:00' }))
    expect(errors.join('\n')).toMatch(/earliest|latest/)
  })

  test('accept earliest equal to latest, which is one permitted answer', () => {
    expect(errorsFor(documentWith({ type: 'time', earliest: '09:00', latest: '09:00' }))).toEqual([])
  })

  test('are refused in a version 1 document, even on the version 1 date type', () => {
    // `date` is a version 1 type and the freeze promises a version 1 document keeps
    // validating -- which this keeps, because an optional property only a version 2
    // document may carry takes nothing from any version 1 document. It is NOT
    // additive within version 1: the schema is closed, so a version 1 reader answers
    // `Unknown property "earliest"` and refuses the whole document.
    const errors = errorsFor(documentWith({ type: 'date', earliest: '2026-09-19' }, '1'))
    expect(errors.join('\n')).toMatch(/earliest/)
    expect(errors.join('\n')).toMatch(/specVersion "2"/)
  })
})
