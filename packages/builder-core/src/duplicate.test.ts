import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { duplicateAndSay, duplicateField } from './duplicate.js'
import { createBuilderSession } from './session.js'

/**
 * Duplicating a field: the copy sits straight after the original, with a key of its own and
 * the rules about the original aimed at it (0192).
 */
const form: FormSchema = {
  specVersion: '4',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'country', type: 'select', label: 'Country', options: [{ value: 'CH', label: 'Switzerland' }] },
      { key: 'canton', type: 'text', label: 'Canton', required: true, maxLength: 20 },
      {
        key: 'address',
        type: 'group',
        label: 'Address',
        fields: [
          { key: 'street', type: 'text', label: 'Street' },
          { key: 'zip', type: 'text', label: 'ZIP' },
        ],
      },
      { key: 'email', type: 'text', label: 'Email' },
    ],
  },
  logic: {
    rules: [
      // About the field, reading a field outside it: a duplicate in the same form keeps it.
      { kind: 'visible', target: 'canton', cel: 'country == "CH"' },
      // Inside the group, reading inside it: it follows the copy's own keys.
      { kind: 'required', target: 'address.zip', cel: 'address.street != ""' },
    ],
  },
}

const keys = (document: FormSchema): string[] => document.model.fields.map((field) => field.key)

describe('duplicating a field', () => {
  test('puts a copy straight after it, under a key of its own, with everything it says', () => {
    const session = createBuilderSession(form)
    expect(duplicateField(session, ['canton']).ok).toBe(true)

    const document = session.document()
    expect(keys(document)).toEqual(['country', 'canton', 'canton2', 'address', 'email'])
    expect(document.model.fields[2]).toEqual({ key: 'canton2', type: 'text', label: 'Canton', required: true, maxLength: 20 })
  })

  // A duplicate stays in the form it came from, so a rule reading a field outside it reads
  // the same field it always did — unlike a block, which leaves such a rule behind (0135).
  test('and the rules about it, aimed at the copy', () => {
    const session = createBuilderSession(form)
    duplicateField(session, ['canton'])
    expect(session.document().logic?.rules).toContainEqual({ kind: 'visible', target: 'canton2', cel: 'country == "CH"' })
  })

  // A group's copy has new keys inside it where the form already used them, and a rule
  // inside the group reads the copy's fields, not the original's.
  test('a group comes with its fields and its rules, re-keyed together', () => {
    const session = createBuilderSession(form)
    expect(duplicateField(session, ['address']).ok).toBe(true)

    const document = session.document()
    expect(keys(document)).toEqual(['country', 'canton', 'address', 'address2', 'email'])
    expect(document.model.fields[3]?.fields?.map((field) => field.key)).toEqual(['street2', 'zip2'])
    expect(document.logic?.rules).toContainEqual({ kind: 'required', target: 'address2.zip2', cel: 'address2.street2 != ""' })
  })

  // One edit, so one undo takes the copy and its rules back together.
  test('is one edit', () => {
    const session = createBuilderSession(form)
    duplicateField(session, ['address'])
    session.undo()
    expect(session.document()).toEqual(form)
  })

  test('a page is not a field to duplicate', () => {
    const paged = createBuilderSession({
      ...form,
      model: { fields: [{ key: 'one', type: 'page', label: 'One', fields: [{ key: 'name', type: 'text', label: 'Name' }] }] },
      logic: { rules: [] },
    })
    expect(duplicateField(paged, ['one']).ok).toBe(false)
  })

  test('says what it did, in the builder’s language', () => {
    const session = createBuilderSession(form)
    expect(duplicateAndSay(session, ['canton'])).toBe('Duplicated Canton.')
    expect(duplicateAndSay(session, ['nowhere'])).toMatch(/^Cannot duplicate/)
  })
})
