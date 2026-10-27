import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A default: the answer a fresh form starts with (0197). The document says its JSON type per
 * field type; whether the field accepts it is the engine's question, asked with the same check
 * it asks of every answer, and pinned in `packages/core/src/default.test.ts`.
 */
const formWith = (field: Partial<FieldDef>, specVersion = '5'): FormSchema =>
  ({
    specVersion,
    id: 'trip',
    title: 'Trip',
    model: { fields: [{ key: 'answer', label: 'Answer', type: 'text', ...field } as FieldDef] },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

const options = [
  { value: 'CH', label: 'Switzerland' },
  { value: 'DE', label: 'Germany' },
]

describe('a default', () => {
  test('is an answer of the field’s own type, on every field that holds one answer or a list of ticks', () => {
    for (const field of [
      { type: 'text', default: 'Zürich' },
      { type: 'textarea', default: 'Nothing to add.' },
      { type: 'hidden', default: 'spring-campaign' },
      { type: 'number', default: 2 },
      { type: 'checkbox', default: true },
      { type: 'date', default: '2026-11-01' },
      { type: 'time', default: '09:00' },
      { type: 'datetime', default: '2026-11-01T09:00:00Z' },
      { type: 'select', options, default: 'CH' },
      { type: 'radio', options, default: 'DE' },
      { type: 'selectboxes', options, default: ['CH', 'DE'] },
    ] as Array<Partial<FieldDef>>) {
      expect(errorsOf(formWith(field)), field.type).toEqual([])
    }
  })

  // The JSON type is the document's to say, and the builder's panel reads it to choose the
  // editor: a number field's default typed into a text box would be stored as "2".
  test('is refused in another JSON type than the field’s answer', () => {
    expect(errorsOf(formWith({ type: 'number', default: '2' as never }))).not.toEqual([])
    expect(errorsOf(formWith({ type: 'checkbox', default: 'yes' as never }))).not.toEqual([])
    expect(errorsOf(formWith({ type: 'selectboxes', options, default: 'CH' as never }))).not.toEqual([])
    expect(errorsOf(formWith({ type: 'text', default: 3 as never }))).not.toEqual([])
  })

  // `''` is a text field unanswered: a default of it says nothing a missing one does not.
  test('is never empty', () => {
    expect(errorsOf(formWith({ default: '' }))).not.toEqual([])
    expect(errorsOf(formWith({ type: 'select', options, default: '' }))).not.toEqual([])
  })

  // A file is an upload, a signature a drawing and a ranking an order of every option: none
  // has an answer the author could write down for everybody. A group and a repeater hold
  // answers rather than being one, and their fields carry their own.
  test('is refused on a field whose answer cannot be written down in advance', () => {
    for (const type of ['file', 'signature', 'ranking', 'matrix', 'static', 'richtext', 'group', 'repeater']) {
      expect(errorsOf(formWith({ type, default: 'x' } as Partial<FieldDef>)), type).not.toEqual([])
    }
  })

  test('in a version 4 document is refused, naming the property', () => {
    expect(errorsOf(formWith({ default: 'Zürich' }, '4'))).toMatchObject([
      { path: '/model/fields/0/default', code: 'version.property' },
    ])
  })
})
