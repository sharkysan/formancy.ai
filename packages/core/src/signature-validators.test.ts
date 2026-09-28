import { describe, expect, test } from 'vitest'
import type { FieldDef } from '@formancy/spec'
import { modelViolations } from './model-validators.js'

/**
 * What a `signature` answer has to be, checked in the one function the browser
 * and the server both run.
 *
 * The control cannot produce anything else — it writes what it drew — but a
 * payload posted straight at the endpoint never went through a control, which is
 * the whole reason these checks are here rather than in a renderer
 * ([0076](../../../docs/decisions/0076-an-answer-is-one-of-the-options.md)).
 *
 * A signature is a bigger target than most answers: it is the one field whose
 * value is an unbounded nested array, so "how much ink" is a payload question
 * before it is a drawing one.
 */
const field = (over: Partial<FieldDef> = {}): FieldDef =>
  ({ key: 'mark', type: 'signature', ...over }) as FieldDef

const strokes = (points: number): Array<Array<[number, number]>> => [
  Array.from({ length: points }, (_, at): [number, number] => [at, at]),
]

describe('a signature answer', () => {
  test('is drawn strokes or a typed name, and nothing else', () => {
    expect(modelViolations(field(), { drawn: strokes(3) })).toEqual([])
    expect(modelViolations(field(), { typed: 'Mara Lindqvist' })).toEqual([])

    // A string, a number, an array: all the shapes a hand-written payload
    // reaches for, none of them an answer to this question.
    expect(modelViolations(field(), 'Mara')).toContain('type')
    expect(modelViolations(field(), 42)).toContain('type')
    expect(modelViolations(field(), [[0, 0]])).toContain('type')
  })

  test('is never both at once', () => {
    // Which one would a reader show? A signed document that renders differently
    // depending on which branch somebody checks first is worse than a refusal.
    expect(modelViolations(field(), { drawn: strokes(2), typed: 'Mara' })).toContain('type')
  })

  test('carries integer points, because the hash must not depend on rounding', () => {
    // A submission is bound to a canonical hash. Floats make that hash depend on
    // how one browser rounded a pointer event, so the coordinate space is whole
    // numbers and a fractional point is not an answer.
    expect(modelViolations(field(), { drawn: [[[1.5, 2]]] })).toContain('type')
    expect(modelViolations(field(), { drawn: [[['1', 2]]] as never })).toContain('type')
  })

  test('stays inside the box it was drawn in', () => {
    const boxed = field({ box: [600, 200] })

    expect(modelViolations(boxed, { drawn: [[[599, 199]]] })).toEqual([])
    // Outside the box the point means nothing: the box is what makes a stored
    // point redrawable at any size, and a point beyond it draws over whatever is
    // next to the field.
    expect(modelViolations(boxed, { drawn: [[[601, 10]]] })).toContain('box')
    expect(modelViolations(boxed, { drawn: [[[10, -1]]] })).toContain('box')
  })

  test('is bounded, because an unbounded point list is a payload amplifier', () => {
    const capped = field({ maxPoints: 10 })

    expect(modelViolations(capped, { drawn: strokes(10) })).toEqual([])
    expect(modelViolations(capped, { drawn: strokes(11) })).toContain('maxPoints')
    // Across all strokes rather than per stroke: ten strokes of ten points is
    // the same hundred points as one stroke of a hundred.
    expect(modelViolations(capped, { drawn: [...strokes(6), ...strokes(6)] })).toContain('maxPoints')
  })

  test('leaves emptiness to `required`, like every other type here', () => {
    // This file's neighbour states the rule: an empty optional field trips
    // nothing here, so an author never has to write "unless it is empty" into a
    // bound. An empty mark is therefore not a violation of shape — what makes it
    // an unanswered question is the engine, and `signature.engine.test.ts` holds
    // that half.
    expect(modelViolations(field(), { drawn: [] })).toEqual([])
    expect(modelViolations(field(), { typed: '' })).toEqual([])
  })

  test('says nothing about a field nobody has signed', () => {
    // An optional signature left alone is not an error, and the absent value has
    // to travel the same path as every other absent answer.
    expect(modelViolations(field(), null)).toEqual([])
    expect(modelViolations(field(), undefined)).toEqual([])
  })
})
