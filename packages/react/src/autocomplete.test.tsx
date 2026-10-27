import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * The autofill hint on the control (0195): what WCAG 1.3.5 asks a field collecting information
 * about the person to say, on the element a browser and a person's own tools read it from.
 */
const form: FormSchema = {
  specVersion: '5',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'given', type: 'text', label: 'First name', autocomplete: 'given-name' },
      { key: 'street', type: 'textarea', label: 'Street', autocomplete: 'street-address' },
      { key: 'born', type: 'date', label: 'Born', autocomplete: 'bday' },
      { key: 'age', type: 'number', label: 'Age', autocomplete: 'bday-year' },
      { key: 'country', type: 'select', label: 'Country', autocomplete: 'country', options: [{ value: 'CH', label: 'Switzerland' }] },
      { key: 'note', type: 'text', label: 'Note' },
    ],
  },
}

describe('an autofill hint', () => {
  test('is on each control that takes typed or chosen input', () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema: form })}>
        <FormancyForm />
      </FormancyProvider>,
    )
    expect(screen.getByRole('textbox', { name: 'First name' }).getAttribute('autocomplete')).toBe('given-name')
    expect(screen.getByRole('textbox', { name: 'Street' }).getAttribute('autocomplete')).toBe('street-address')
    expect(screen.getByLabelText('Born').getAttribute('autocomplete')).toBe('bday')
    expect(screen.getByRole('spinbutton', { name: 'Age' }).getAttribute('autocomplete')).toBe('bday-year')
    expect(screen.getByRole('combobox', { name: 'Country' }).getAttribute('autocomplete')).toBe('country')
    // None asked for, none drawn: a browser's own guess is better than a wrong word.
    expect(screen.getByRole('textbox', { name: 'Note' }).hasAttribute('autocomplete')).toBe(false)
  })
})
