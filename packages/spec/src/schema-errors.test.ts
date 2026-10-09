import { describe, expect, test } from 'vitest'
import { SCHEMA_ERRORS, renderSchemaError } from './schema-errors.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A validator error says which sentence it is.
 *
 * Every reason a document is refused was an English sentence and nothing else, so
 * a builder speaking German could only show it in English, or match the English to
 * guess which reason it was — and a reworded sentence would have broken the guess
 * silently ([0122](../../../docs/decisions/0122-a-validator-error-has-a-code.md)).
 * That every call names exactly the values its sentence needs is the compiler's to
 * check, not a test's: `schemaError` reads the placeholders off the sentence's type.
 */
const twoEmails: FormSchema = {
  specVersion: '1',
  id: 'contact-us',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text' },
      { key: 'email', type: 'textarea' },
    ],
  },
}

function onlyError(document: unknown) {
  const result = validateSchema(document)
  if (result.valid) throw new Error('expected the document to be refused')
  expect(result.errors).toHaveLength(1)
  return result.errors[0]!
}

describe('a validator error', () => {
  test('carries its code and the values its sentence names, so it can be said in another language', () => {
    // Without the code a caller translating it has only the English to go on.
    expect(onlyError(twoEmails)).toMatchObject({
      path: '/model/fields/1/key',
      code: 'key.taken',
      values: { key: 'email' },
    })
  })

  test('and its English is that sentence with those values, so nothing that read it before reads anything else', () => {
    const error = onlyError(twoEmails)

    expect(error.message).toBe(renderSchemaError(SCHEMA_ERRORS['key.taken'], { key: 'email' }))
    expect(error.message).toBe(
      'Another field already uses the key "email". A key identifies one answer, so two fields cannot share one.',
    )
  })

  test('from the JSON Schema too, which ajv words and this repository rewords', () => {
    // The structural half: a reason ajv found has a code as well, not only the
    // semantic checks written by hand.
    const { title: _title, ...untitled } = twoEmails

    expect(onlyError({ ...untitled, model: { fields: [] } })).toMatchObject({
      code: 'shape.required',
      values: { property: 'title' },
    })
  })

  test('and the version a construct needs is a value, so a translation says the same number', () => {
    const rating = {
      ...twoEmails,
      model: { fields: [{ key: 'stars', type: 'number', widget: 'rating' }] },
    }

    expect(onlyError(rating)).toMatchObject({
      code: 'version.widget',
      values: { widget: 'rating', version: '4', declared: '1' },
    })
  })
})

describe('a sentence with a value missing', () => {
  test('shows the placeholder rather than closing up around nothing', () => {
    // "the key ." reads as a sentence and hides that a value never came;
    // "the key {key}." is obviously wrong.
    expect(renderSchemaError('Another field already uses the key "{key}".', {})).toBe(
      'Another field already uses the key "{key}".',
    )
  })
})
