import { describe, expect, test } from 'vitest'
import type { LogicRule } from './rules.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A `validate` rule's own message: what the person reads while the rule fails, written and
 * translated by the author, in place of its code said as itself (0198).
 */
const formWith = (rules: Array<Partial<LogicRule>>, specVersion = '5'): FormSchema =>
  ({
    specVersion,
    id: 'trip',
    title: 'Trip',
    i18n: { defaultLocale: 'en', messages: { en: { 'age.adult': 'Travellers must be 18 or older.' } } },
    model: { fields: [{ key: 'age', type: 'number', label: 'Age' }] },
    logic: { rules: rules.map((rule) => ({ target: 'age', kind: 'validate', cel: 'age >= 18', ...rule })) },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('a rule’s message', () => {
  test('is text, or a reference into the catalogue, on a validate rule with a code', () => {
    expect(errorsOf(formWith([{ code: 'adult', message: 'Travellers must be 18 or older.' }]))).toEqual([])
    expect(errorsOf(formWith([{ code: 'adult', message: { $t: 'age.adult' } }]))).toEqual([])
  })

  // The message is said for the code the field carries, so a message with no code of its own
  // would be said for `invalid` — which is also what a rule that cannot evaluate reports.
  test('needs a code to be said for', () => {
    expect(errorsOf(formWith([{ message: 'Travellers must be 18 or older.' }]))).not.toEqual([])
  })

  // Only a validate rule puts an error on a field; a message anywhere else would be read by nobody.
  test('is refused on any other kind of rule', () => {
    expect(errorsOf(formWith([{ kind: 'visible', cel: 'true', message: 'Shown.' }]))).not.toEqual([])
  })

  // One code on one field is said one way. Two rules sharing it, either with a message, would be
  // two sentences for one code and no saying which the person reads.
  test('is refused where another rule on the field has the same code', () => {
    expect(
      errorsOf(formWith([{ code: 'adult', message: 'Too young.' }, { code: 'adult', cel: 'age < 120' }])),
    ).toMatchObject([{ path: '/logic/rules/1/code', code: 'rule.codeShared' }])
    // On another field, the same code is another field's word.
    expect(
      errorsOf({
        ...formWith([{ code: 'adult', message: 'Too young.' }]),
        model: { fields: [{ key: 'age', type: 'number', label: 'Age' }, { key: 'other', type: 'number', label: 'Other' }] },
        logic: {
          rules: [
            { target: 'age', kind: 'validate', cel: 'age >= 18', code: 'adult', message: 'Too young.' },
            { target: 'other', kind: 'validate', cel: 'other >= 18', code: 'adult', message: 'Too young.' },
          ],
        },
      } as FormSchema),
    ).toEqual([])
  })

  test('in a version 4 document is refused, naming the property', () => {
    expect(errorsOf(formWith([{ code: 'adult', message: 'Too young.' }], '4'))).toMatchObject([
      { path: '/logic/rules/0/message', code: 'version.property' },
    ])
  })
})
