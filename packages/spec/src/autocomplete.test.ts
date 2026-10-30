import { describe, expect, test } from 'vitest'
import schema from '../formancy.schema.json' with { type: 'json' }
import { AUTOCOMPLETE_TOKENS } from './autocomplete.js'
import type { FieldDef, FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * A field's autofill hint: the input purpose WCAG 1.3.5 asks a form to say, so a browser can
 * fill it and assistive technology can mark it (0195).
 */
const formWith = (field: Partial<FieldDef>, specVersion = '5'): FormSchema =>
  ({
    specVersion,
    id: 'contact',
    title: 'Contact',
    model: { fields: [{ key: 'email', type: 'text', label: 'Email', ...field }] },
  }) as FormSchema

const errorsOf = (schema: FormSchema) => {
  const result = validateSchema(schema)
  return result.valid ? [] : result.errors
}

describe('an autofill hint', () => {
  test('is one of the input purposes, on a field that takes typed or chosen input', () => {
    expect(errorsOf(formWith({ autocomplete: 'email' }))).toEqual([])
    expect(errorsOf(formWith({ type: 'textarea', autocomplete: 'street-address' }))).toEqual([])
    expect(errorsOf(formWith({ type: 'date', autocomplete: 'bday' }))).toEqual([])
    expect(errorsOf(formWith({ type: 'select', autocomplete: 'country', options: [{ value: 'CH', label: 'CH' }] }))).toEqual([])
  })

  // A closed list, as a widget is: `"emial"` is an authoring error rather than a hint the
  // browser silently ignores.
  test('is refused when it is not an input purpose', () => {
    expect(errorsOf(formWith({ autocomplete: 'emial' as never }))).not.toEqual([])
  })

  // A form platform keeps its answers. A card number or a password stored in a submission is
  // a liability nobody adopting this should take on by accident, so the hint that would invite
  // a browser to put one there is not offered.
  test('never names a password or a payment card', () => {
    expect(AUTOCOMPLETE_TOKENS.filter((token) => /password|^cc-/.test(token))).toEqual([])
    expect(errorsOf(formWith({ autocomplete: 'cc-number' as never }))).not.toEqual([])
  })

  // A tick box, a list of ticks or a file has no purpose a browser could fill.
  test('is refused on a field that takes no typed or chosen input', () => {
    expect(errorsOf(formWith({ type: 'checkbox', autocomplete: 'email' }))).not.toEqual([])
  })

  // Two lists of one thing: the type the code compiles against, and what the document schema
  // accepts. Compared, so neither can gain a token the other lacks.
  test('offers in the schema exactly the tokens the code knows', () => {
    const offered = (schema.$defs.field.allOf as Array<{ then?: { properties?: Record<string, { enum?: string[] }> } }>).flatMap(
      (branch) => branch.then?.properties?.['autocomplete']?.enum ?? [],
    )
    expect([...offered].sort()).toEqual([...AUTOCOMPLETE_TOKENS].sort())
  })

  test('in a version 4 document is refused, naming the property', () => {
    expect(errorsOf(formWith({ autocomplete: 'email' }, '4'))).toMatchObject([{ path: '/model/fields/0/autocomplete', code: 'version.property' }])
  })
})
