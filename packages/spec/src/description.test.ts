import { describe, expect, test } from 'vitest'
import { upgradeSpecVersion } from './upgrade.js'
import { CURRENT_SPEC_VERSION, SPEC_VERSIONS } from './types.js'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A field's description: help text under its question, read out with it (0194).
 *
 * The first construct of version 5. Every other form product a person has used has one, and
 * formancy had nowhere to put "as on your passport" but the label itself — which made the
 * label, and so every control's accessible name, a paragraph.
 */
const formWith = (field: Partial<FieldDef>, specVersion = '5'): FormSchema =>
  ({
    specVersion,
    id: 'passport',
    title: 'Passport',
    model: { fields: [{ key: 'name', type: 'text', label: 'Full name', ...field }] },
  }) as FormSchema

describe('a description', () => {
  test('is version 5, which is open and the version a document is written in', () => {
    expect([...SPEC_VERSIONS]).toContain('5')
    expect(CURRENT_SPEC_VERSION).toBe('5')
  })

  test('is text, or a reference into the document’s catalogue', () => {
    expect(validateSchema(formWith({ description: 'As on your passport.' })).valid).toBe(true)
    const referenced = {
      ...formWith({ description: { $t: 'name.help' } }),
      i18n: { defaultLocale: 'en', messages: { en: { 'name.help': 'As on your passport.' } } },
    } as FormSchema
    expect(validateSchema(referenced).valid).toBe(true)
  })

  // A version 4 reader has never heard of it, and ignoring it would drop words the author
  // meant every respondent to read — so a version 4 document carrying one is refused, by name.
  test('in a version 4 document is refused, naming the property', () => {
    const result = validateSchema(formWith({ description: 'As on your passport.' }, '4'))
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errors).toMatchObject([{ path: '/model/fields/0/description', code: 'version.property' }])
  })

  test('on any field that asks something, a group and a page included', () => {
    const form = {
      specVersion: '5',
      id: 'f',
      title: 'F',
      model: {
        fields: [
          {
            key: 'one',
            type: 'page',
            label: 'One',
            description: 'About you.',
            fields: [{ key: 'address', type: 'group', label: 'Address', description: 'Where we write to.', fields: [{ key: 'city', type: 'text', label: 'City' }] }],
          },
        ],
      },
    } as FormSchema
    expect(validateSchema(form).valid).toBe(true)
  })

  // Upgrading moves the version line and nothing else, as every step has.
  test('a version 4 document upgrades to 5 unchanged but for its version', () => {
    const four = formWith({}, '4')
    expect(upgradeSpecVersion(four, '5')).toEqual({ ...four, specVersion: '5' })
  })
})
