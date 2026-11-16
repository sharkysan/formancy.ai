import { describe, expect, test } from 'vitest'

import { temporalAnyShape, temporalAnyShapeRegExp, temporalDateExists, temporalExample, temporalShape, temporalShapeRegExp } from './temporal.js'
import { FIELD_TYPES, TEMPORAL_FIELD_TYPES, SPEC_1_FIELD_TYPES, TEMPORAL_SHAPES } from './types.js'
import type { TemporalFieldType } from './types.js'
import { validateSchema } from './validate.js'
import schema from '../formancy.schema.json' with { type: 'json' }

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
  test("the schema's bound patterns are the shape function's", () => {
    // Two closed descriptions of one rule is the drift this repository keeps finding, so
    // the JSON Schema's six bound patterns are compared with the function that owns them:
    // a hand-written one that stops matching it fails here instead of refusing a bound
    // the width check would have named.
    const patterns: Record<string, string[]> = { date: [], time: [], datetime: [] }
    type Branch = { if?: { properties?: { type?: { const?: string } } }; then?: { properties?: Record<string, { pattern?: string }> } }
    for (const branch of (schema.$defs.field as unknown as { allOf: Branch[] }).allOf) {
      const type = branch.if?.properties?.type?.const
      if (type === undefined || !(type in patterns)) continue
      for (const bound of ['earliest', 'latest']) {
        const pattern = branch.then?.properties?.[bound]?.pattern
        if (pattern !== undefined) patterns[type]!.push(pattern)
      }
    }
    for (const type of ['date', 'time', 'datetime'] as const) {
      expect(patterns[type], type).toEqual([temporalAnyShape(type), temporalAnyShape(type)])
    }
  })

  test("the schema's bound descriptions write each example at the precision they name", () => {
    // A bound is written at its field's width, or the document is refused (`bounds.width`), and
    // the description is where an author and the builder's property panel learn the width. Its
    // examples are prose, so they are read back and held to the shape function: "09:30" alone,
    // as each description said, is the one width a field with a precision refuses.
    type Branch = { if?: { properties?: { type?: { const?: string } } }; then?: { properties?: Record<string, { description?: string }> } }
    const named: string[] = []
    for (const branch of (schema.$defs.field as unknown as { allOf: Branch[] }).allOf) {
      const type = branch.if?.properties?.type?.const
      if (type !== 'time' && type !== 'datetime') continue
      for (const bound of ['earliest', 'latest']) {
        const description = branch.then?.properties?.[bound]?.description ?? ''
        const examples = [...description.matchAll(/(\S+?) (without a precision(?: or at precision (\d))?|at precision (\d))/g)]
        const precisions = examples.flatMap(([, example, phrase, orAt, at]) => {
          const levels = phrase!.startsWith('without') ? [undefined, ...(orAt === undefined ? [] : [Number(orAt)])] : [Number(at)]
          return levels.map((precision) => ({ example: example!, precision }))
        })
        for (const { example, precision } of precisions) {
          expect(new RegExp(temporalShape(type, precision)).test(example), `${type} ${bound}: ${example} at ${String(precision)}`).toBe(true)
        }
        // Both kinds named, or a description could keep its version-5 example alone and pass.
        expect(
          precisions.some(({ precision }) => precision === undefined) && precisions.some(({ precision }) => (precision ?? 0) > 0),
          `${type} ${bound}`,
        ).toBe(true)
        named.push(`${type} ${bound}`)
      }
    }
    expect(named).toHaveLength(4)
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
      ...(['time', 'datetime'] as const).flatMap((t) => Array.from({ length: 10 }, (_, p) => [t, p] satisfies [TemporalFieldType, number])),
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

describe('whether an answer in its shape names a day the calendar has', () => {
  // The shape is digits in places, so 2026-02-30 passes it. A field with a precision refuses
  // such a day on that check, or the control shows it empty, no error is raised, and the form
  // submits a day that does not exist.
  test.each(['2026-02-30', '2026-13-01', '2026-04-31', '2027-02-29', '2100-02-29', '2026-00-10', '2026-01-00'])('%s is no day', (date) => {
    expect(temporalDateExists('date', date)).toBe(false)
    expect(temporalDateExists('datetime', `${date}T10:00:00.415Z`)).toBe(false)
  })

  // 2028 is divisible by four and 2000 by 400; 2100, refused above, is divisible by 100 only.
  test.each(['2028-02-29', '2000-02-29', '2026-12-31', '2026-04-30'])('%s is a day', (date) => {
    expect(temporalDateExists('date', date)).toBe(true)
    expect(temporalDateExists('datetime', `${date}T10:00:00Z`)).toBe(true)
  })

  test('a year below 100 is that year, not 19xx', () => {
    // Date.UTC reads 0004 as 1904. Both are leap years, but the round trip then gives back
    // 1904, and the fourth of a leap year's 29 Februaries would be refused.
    expect(temporalDateExists('date', '0004-02-29')).toBe(true)
    expect(temporalDateExists('date', '0003-02-29')).toBe(false)
  })

  test('a time names no day, so it always exists', () => {
    // A time of day has no calendar to fail; refusing one here would refuse every time.
    expect(temporalDateExists('time', '10:34:56.789')).toBe(true)
  })
})

describe('the compiled shapes', () => {
  const precisions = [undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  // From the spec's own list, so a fourth temporal type without a table entry fails here.
  const types: readonly TemporalFieldType[] = TEMPORAL_FIELD_TYPES

  // A RegExp built per call from a document's precision is what CodeQL's regex-injection rule
  // flags; the table compiles only constants, and must say the same thing temporalShape does,
  // or two spellings of one shape would disagree without anybody finding out.
  test.each(types)('%s: every precision compiles to the string temporalShape gives', (type) => {
    for (const precision of precisions) {
      expect(temporalShapeRegExp(type, precision).source).toBe(new RegExp(temporalShape(type, precision)).source)
    }
    expect(temporalAnyShapeRegExp(type).source).toBe(new RegExp(temporalAnyShape(type)).source)
  })

  // A lookup that compiled again would be the per-call construction this table replaces.
  test('the same arguments give the same object', () => {
    expect(temporalShapeRegExp('time', 3)).toBe(temporalShapeRegExp('time', 3))
    expect(temporalAnyShapeRegExp('datetime')).toBe(temporalAnyShapeRegExp('datetime'))
  })

  // A shared expression with g or y keeps lastIndex between calls, and the second answer
  // checked would fail for the first one's position.
  test('a shared expression is stateless', () => {
    for (const type of types) {
      for (const precision of precisions) {
        const { global, sticky } = temporalShapeRegExp(type, precision)
        expect([global, sticky]).toEqual([false, false])
      }
    }
  })

  // The table has no entry for these; answering with one would validate documents no reader
  // can parse, as temporalShape refuses.
  test.each([-1, 10, 1.5, Number.NaN])('precision %s throws', (precision) => {
    expect(() => temporalShapeRegExp('time', precision)).toThrow(RangeError)
  })
})
