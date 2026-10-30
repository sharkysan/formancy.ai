import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A placeholder: an example of the answer, shown in the empty box and never instead of the
 * label (0196).
 */
const formWith = (field: Partial<FieldDef>, specVersion = '5'): FormSchema =>
  ({
    specVersion,
    id: 'contact',
    title: 'Contact',
    model: { fields: [{ key: 'phone', type: 'text', label: 'Phone', ...field }] },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('a placeholder', () => {
  test('is text, or a reference into the catalogue, on a field a person types into', () => {
    expect(errorsOf(formWith({ placeholder: '079 123 45 67' }))).toEqual([])
    expect(errorsOf(formWith({ type: 'textarea', placeholder: 'Anything we should know?' }))).toEqual([])
    expect(errorsOf(formWith({ type: 'number', placeholder: '12' }))).toEqual([])
    const referenced = {
      ...formWith({ placeholder: { $t: 'phone.example' } }),
      i18n: { defaultLocale: 'en', messages: { en: { 'phone.example': '079 123 45 67' } } },
    } as FormSchema
    expect(errorsOf(referenced)).toEqual([])
  })

  // A select, a date or a tick box draws no empty box to put an example in.
  test('is refused on a field nobody types into', () => {
    expect(errorsOf(formWith({ type: 'date', placeholder: '2026-01-01' }))).not.toEqual([])
    expect(errorsOf(formWith({ type: 'checkbox', placeholder: 'yes' }))).not.toEqual([])
  })

  test('in a version 4 document is refused, naming the property', () => {
    expect(errorsOf(formWith({ placeholder: '079 123 45 67' }, '4'))).toMatchObject([{ path: '/model/fields/0/placeholder', code: 'version.property' }])
  })
})
