import { describe, expect, test } from 'vitest'
import { CURRENT_SPEC_VERSION, FIELD_TYPES, SPEC_2_FIELD_TYPES, SPEC_VERSIONS } from './types.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `signature`, and the version that carries it.
 *
 * A drawn mark is the last of the three components form.io and FormEngine both
 * charge for, and the only one still unbuilt. It is a **field type**, so it is a
 * spec version: a reader that has never heard of it renders nothing, collects
 * nothing and drops the answer, which looks exactly like a field somebody left
 * blank ([0051](../../../docs/decisions/0051-spec-2-adds-types.md)).
 *
 * So this file holds two things at once: that version 3 exists and gates what it
 * introduced, and that a signature field says what it collects.
 */
/** The problems, as a validator that refused reports them. */
const problemsIn = (document: FormSchema): Array<{ path: string; message: string }> => {
  const report = validateSchema(document)
  return report.valid ? [] : report.errors
}

const form = (specVersion: string, fields: unknown[]): FormSchema =>
  ({
    specVersion,
    id: 'sign',
    title: 'Sign here',
    model: { fields },
  }) as unknown as FormSchema

describe('spec version 3', () => {
  test('exists, is the current one, and adds rather than replaces', () => {
    expect(SPEC_VERSIONS).toContain('3')
    expect(CURRENT_SPEC_VERSION).toBe('3')
    // Every version 2 type is still a type. A version is a superset or it is a
    // different format wearing the same name.
    for (const type of SPEC_2_FIELD_TYPES) expect(FIELD_TYPES).toContain(type)
  })

  test('a signature in a version 2 document is refused, by name and with the fix', () => {
    // The failure this prevents is silent: a version 2 reader would drop the
    // answer, and a dropped answer looks like a question nobody filled in. The
    // author is the only person who can see this message, because they cannot
    // see the reader that will refuse their document.
    const problems = problemsIn(form('2', [{ key: 'mark', type: 'signature' }]))

    expect(problems.length).toBeGreaterThan(0)
    expect(problems[0]?.message).toMatch(/signature/)
    expect(problems[0]?.message).toMatch(/"3"/)
  })

  test('and in a version 3 document it is accepted', () => {
    expect(validateSchema(form('3', [{ key: 'mark', type: 'signature' }])).valid).toBe(true)
  })

  test('a version 2 construct still needs version 2, which version 3 did not loosen', () => {
    // The generalisation that version 3 forced: the gate used to be an
    // `if (specVersion !== '1') return []`, which would have waved a `richtext`
    // through in a version 1 document the moment a third version existed.
    const problems = problemsIn(form('1', [{ key: 'notes', type: 'richtext' }]))

    expect(problems.length).toBeGreaterThan(0)
    expect(problems[0]?.message).toMatch(/richtext/)
    expect(problems[0]?.message).toMatch(/"2"/)
  })
})

describe('what a signature field may declare', () => {
  test('a box, which is what makes the points mean anything', () => {
    // Points scale and a picture does not — that is the whole reason for storing
    // strokes. But a stroke at x=300 means nothing without the width it was
    // drawn in, so the box travels with the field rather than with each answer.
    expect(
      validateSchema(form('3', [{ key: 'mark', type: 'signature', box: [600, 200] }])).valid,
    ).toBe(true)
  })

  test('and refuses a box that is not two positive numbers', () => {
    const problems = problemsIn(form('3', [{ key: 'mark', type: 'signature', box: [600, 0] }]))
    expect(problems.length).toBeGreaterThan(0)
    // The PATH, which is what identifies the property to an author; the message
    // is the schema's own wording for the constraint it broke. Asserting the
    // message would be asserting ajv's phrasing.
    expect(problems[0]?.path).toMatch(/\/box(\/|$)/)
  })

  test('a cap on how much ink one answer may carry', () => {
    // Structural limits are not optional here: an unbounded point list is a
    // payload amplifier, and every other unbounded thing in this format has a
    // ceiling for the same reason.
    expect(
      validateSchema(form('3', [{ key: 'mark', type: 'signature', maxPoints: 4_000 }])).valid,
    ).toBe(true)
    expect(
      validateSchema(form('3', [{ key: 'mark', type: 'signature', maxPoints: 0 }])).valid,
    ).toBe(false)
  })

  test('nothing about how it looks, which belongs to the theme', () => {
    // The pen colour, the line weight and the box's border are appearance, and
    // appearance belongs to the consumer's design system in this product
    // ([0008](../../../docs/decisions/0008-layered-packages.md)).
    const report = validateSchema(
      form('3', [{ key: 'mark', type: 'signature', penColour: '#000' }]),
    )
    expect(report.valid).toBe(false)
  })
})
