import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * A field's description, as the engine hands it to a renderer (0194): resolved in the form's
 * language like the label, and named in the control's `aria-describedby` so it is read out
 * with the control and not as its name.
 */
const form: FormSchema = {
  specVersion: '5',
  id: 'passport',
  title: 'Passport',
  i18n: { defaultLocale: 'en', messages: { en: { 'name.help': 'As on your passport.' }, de: { 'name.help': 'Wie im Pass.' } } },
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Full name', description: { $t: 'name.help' } },
      { key: 'plain', type: 'text', label: 'Nickname' },
      { key: 'pets', type: 'radio', label: 'Pets', required: true, description: 'Choose one.', options: [{ value: 'cat', label: 'Cat' }] },
    ],
  },
}

describe('a description', () => {
  // Resolved once, in the engine, for the reason the label is: two renderers resolving it
  // themselves would be two answers to which language it is in.
  test('is resolved in the form’s language', () => {
    expect(createFormEngine({ schema: form }).getFieldSnapshot(['name']).description).toBe('As on your passport.')
    expect(createFormEngine({ schema: form, locale: 'de' }).getFieldSnapshot(['name']).description).toBe('Wie im Pass.')
    expect(createFormEngine({ schema: form }).getFieldSnapshot(['plain']).description).toBeUndefined()
  })

  // Read out with the control, never as part of its name — and only when there is one, since
  // an id pointing at nothing is an accessibility error an auditor reports.
  test('is named in the control’s aria-describedby, and only when the field has one', () => {
    const engine = createFormEngine({ schema: form })
    const { props, ids } = engine.getFieldSnapshot(['name'])
    expect(props.control['aria-describedby']).toBe(ids.description)
    expect(engine.getFieldSnapshot(['plain']).props.control['aria-describedby']).toBeUndefined()
  })

  // A required group says so in its hint, then its description, in that order (props.ts).
  test('comes after a required group’s hint', () => {
    const { props, ids } = createFormEngine({ schema: form }).getFieldSnapshot(['pets'])
    expect(props.control['aria-describedby']).toBe(`${ids.hint} ${ids.description}`)
  })
})
