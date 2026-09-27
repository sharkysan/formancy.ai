import { describe, expect, test } from 'vitest'

import { FIELD_TYPES, SPEC_1_FIELD_TYPES, TEMPORAL_SHAPES } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `time` and `datetime`, and the `earliest`/`latest` bounds.
 *
 * ── ONE CANONICAL FORM, AT ONE FIXED WIDTH ──────────────────────────────────
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
 * ── `datetime` IS AN INSTANT; `time` IS A WALL CLOCK ────────────────────────
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
 * ── WHY NOT `min`/`max` ─────────────────────────────────────────────────────
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
  const result = validateSchema(document as never)
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

  test('string order is chronological order, which is the point of the shapes', () => {
    // The property the whole design exists to buy. Asserted so that widening a
    // pattern later fails here rather than silently making a bound wrong.
    const times = ['23:59', '09:30', '00:00', '10:00']
    expect([...times].sort()).toEqual(['00:00', '09:30', '10:00', '23:59'])

    const instants = [
      '2026-09-19T08:00:00Z',
      '2025-12-31T23:59:59Z',
      '2026-09-19T07:59:59Z',
    ]
    expect([...instants].sort()).toEqual([
      '2025-12-31T23:59:59Z',
      '2026-09-19T07:59:59Z',
      '2026-09-19T08:00:00Z',
    ])
  })
})

describe('the bounds', () => {
  test.each(['date', 'time', 'datetime'])('%s accepts earliest and latest', (type) => {
    const sample = { date: '2026-09-19', time: '09:30', datetime: '2026-09-19T08:00:00Z' }[
      type as 'date' | 'time' | 'datetime'
    ]
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
    expect(
      errorsFor(documentWith({ type: 'time', earliest: '09:00', latest: '09:00' })),
    ).toEqual([])
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
