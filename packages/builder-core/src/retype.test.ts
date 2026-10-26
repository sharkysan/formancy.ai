import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { changeFieldType, retypeAndSay, retypeTargets } from './retype.js'
import { createBuilderSession } from './session.js'

/**
 * Changing what kind of question a field asks, keeping what still applies (0192).
 */
const form: FormSchema = {
  specVersion: '4',
  id: 'survey',
  title: 'Survey',
  model: {
    fields: [
      { key: 'colour', type: 'select', label: 'Colour', required: true, widget: 'typeahead', options: [{ value: 'red', label: 'Red' }] },
      { key: 'note', type: 'text', label: 'Note', minLength: 2, maxLength: 40, pattern: '[a-z]+' },
      { key: 'items', type: 'repeater', label: 'Items', fields: [{ key: 'qty', type: 'number', label: 'Qty' }] },
    ],
  },
}

describe('changing a field’s type', () => {
  // A select becoming radio buttons is the commonest change of mind, and its options, its
  // label and its `required` are exactly what the author would have to type again.
  test('keeps every property the new type takes', () => {
    const session = createBuilderSession(form)
    expect(changeFieldType(session, ['colour'], 'radio').ok).toBe(true)
    expect(session.document().model.fields[0]).toEqual({
      key: 'colour',
      type: 'radio',
      label: 'Colour',
      required: true,
      options: [{ value: 'red', label: 'Red' }],
    })
  })

  // A typeahead is a select's widget; on radio buttons it would be a widget the format
  // refuses, and keeping it would make the change itself refused.
  test('drops a widget the new type does not take, and a property it does not have', () => {
    const session = createBuilderSession(form)
    changeFieldType(session, ['note'], 'number')
    expect(session.document().model.fields[1]).toEqual({ key: 'note', type: 'number', label: 'Note' })
  })

  // A choice needs something to choose; a text field becoming radio buttons gets the first
  // option a radio from the palette has, rather than a form the validator refuses.
  test('gives a choice an option to start from when it had none', () => {
    const session = createBuilderSession(form)
    expect(changeFieldType(session, ['note'], 'radio').ok).toBe(true)
    expect(session.document().model.fields[1]?.options?.length).toBe(1)
  })

  // A group, a page or a repeater holds other fields: turning one into a question would
  // throw its fields away, and turning a question into one would invent fields.
  test('is refused for anything that holds fields, either way', () => {
    const session = createBuilderSession(form)
    expect(changeFieldType(session, ['items'], 'text').ok).toBe(false)
    expect(changeFieldType(session, ['note'], 'group').ok).toBe(false)
    expect(session.document()).toEqual(form)
  })

  test('is one edit', () => {
    const session = createBuilderSession(form)
    changeFieldType(session, ['colour'], 'radio')
    session.undo()
    expect(session.document()).toEqual(form)
  })

  // What a person is offered: every single-answer type the document's version allows, and
  // not the one it already is.
  test('offers the types a field may become', () => {
    const offered = retypeTargets(createBuilderSession(form), ['note']).map((entry) => entry.type)
    expect(offered).toContain('textarea')
    expect(offered).toContain('radio')
    expect(offered).not.toContain('text')
    expect(offered).not.toContain('group')
    expect(offered).not.toContain('repeater')
    expect(retypeTargets(createBuilderSession(form), ['items'])).toEqual([])
  })

  test('says what it did, in the builder’s language', () => {
    const session = createBuilderSession(form)
    expect(retypeAndSay(session, ['note'], 'textarea')).toBe('Changed Note to Multi-line text.')
    expect(retypeAndSay(session, ['items'], 'text')).toMatch(/^Cannot change Items/)
  })
})
