import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * A `time` or `datetime` field can declare how many digits follow its seconds (spec 6), and the
 * engine checks and stores an answer at that width and no other. A bound is a string comparison,
 * which is only right between strings of one width, so a field that accepted two widths would
 * order its answers wrongly.
 */
const capabilities = { now: () => 0, today: () => '2026-01-01', random: () => 0.5 }

function schemaOf(field: Partial<FieldDef>, rules: NonNullable<FormSchema['logic']>['rules'] = []): FormSchema {
  return {
    specVersion: '6',
    id: 'precise',
    title: 'Precise',
    model: { fields: [{ key: 'at', type: 'datetime', ...field }] },
    ...(rules.length > 0 ? { logic: { rules } } : {}),
  }
}

function errorsFor(field: Partial<FieldDef>, value: unknown): string[] | undefined {
  const engine = createFormEngine({ schema: schemaOf(field), capabilities, initialValue: { at: value } })
  return engine.validate().errors['at']
}

describe('an answer at its field’s precision', () => {
  // A field that declares six digits and accepted the whole-second form would store two widths
  // side by side, and a bound would order them wrongly.
  test('a datetime with six digits is valid under precision 6 and a shape error without it', () => {
    expect(errorsFor({ precision: 6 }, '2026-10-08T10:34:56.789012Z')).toBeUndefined()
    expect(errorsFor({}, '2026-10-08T10:34:56.789012Z')).toEqual(['shape'])
  })

  // The width is the field's, in both directions: fewer digits fail as surely as more.
  test('a datetime of another width is a shape error', () => {
    expect(errorsFor({ precision: 6 }, '2026-10-08T10:34:56Z')).toEqual(['shape'])
    expect(errorsFor({ precision: 6 }, '2026-10-08T10:34:56.789Z')).toEqual(['shape'])
  })

  // Precision 0 is whole seconds, which is not the version 5 form: a field with no precision at
  // all still has no seconds on a time.
  test('a time with precision 0 has seconds and no fraction, and one without precision has neither', () => {
    expect(errorsFor({ type: 'time', precision: 0 }, '10:34:56')).toBeUndefined()
    expect(errorsFor({ type: 'time', precision: 0 }, '10:34')).toEqual(['shape'])
    expect(errorsFor({ type: 'time' }, '10:34')).toBeUndefined()
    expect(errorsFor({ type: 'time' }, '10:34:56')).toEqual(['shape'])
  })

  test('a time with seven digits is valid under precision 7', () => {
    expect(errorsFor({ type: 'time', precision: 7 }, '10:34:56.7890121')).toBeUndefined()
  })

  // Seven digits declared, milliseconds sent: the shorter answer must not pass as the longer.
  test('a time in milliseconds is a shape error under precision 7', () => {
    expect(errorsFor({ type: 'time', precision: 7 }, '10:34:56.789')).toEqual(['shape'])
  })

  // The bound still applies once the shape holds; a shape check that skipped it would unbound the field.
  test('an answer of the right width is still bounded', () => {
    const field = { precision: 3, earliest: '2026-10-08T10:00:00.000Z' }
    expect(errorsFor(field, '2026-10-08T09:59:59.999Z')).toEqual(['earliest'])
    expect(errorsFor(field, '2026-10-08T10:00:00.000Z')).toBeUndefined()
  })
})

describe('a computed datetime at its field’s precision', () => {
  const stored = (precision: number | undefined, cel: string): unknown =>
    createFormEngine({
      schema: schemaOf(precision === undefined ? {} : { precision }, [{ kind: 'computed', target: 'at', cel }]),
      capabilities,
    }).value()

  // The expressions package writes milliseconds or none, so a six-digit field would otherwise
  // hold an answer its own shape check refuses, and the respondent cannot type over it.
  test('is padded with zeros to the width', () => {
    expect(stored(6, 'timestamp("2026-10-08T10:34:56.789Z")')).toEqual({ at: '2026-10-08T10:34:56.789000Z' })
    expect(stored(3, 'timestamp("2026-10-08T10:34:56Z")')).toEqual({ at: '2026-10-08T10:34:56.000Z' })
    expect(stored(9, 'timestamp("2026-10-08T10:34:56Z")')).toEqual({ at: '2026-10-08T10:34:56.000000000Z' })
  })

  // Precision 0 keeps the whole seconds; a result with only zeros after the point loses nothing.
  test('with precision 0 keeps the whole seconds when the fraction is zero', () => {
    expect(stored(0, 'timestamp("2026-10-08T10:34:56Z")')).toEqual({ at: '2026-10-08T10:34:56Z' })
  })

  // Rounding .789 to .8 would store a different instant than the rule computed; not storing
  // leaves the field empty, which a `required` on it reports (0189).
  test('that has more non-zero digits than the field holds is not stored, never rounded or cut', () => {
    expect(stored(1, 'timestamp("2026-10-08T10:34:56.789Z")')).toEqual({})
    expect(stored(0, 'timestamp("2026-10-08T10:34:56.789Z")')).toEqual({})
  })

  // A field with no precision is version 5's: whole seconds, and a rule's milliseconds are not its shape.
  test('on a field with no precision is stored as the rule wrote it', () => {
    expect(stored(undefined, 'timestamp("2026-10-08T10:34:56Z")')).toEqual({ at: '2026-10-08T10:34:56Z' })
  })
})
