import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The React binding's `autocomplete.test.tsx`, case for case (0195). */
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
  test('is on each control that takes typed or chosen input', async () => {
    const view = await render(FormancyForm, {
      providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema: form }))],
    })
    await view.fixture.whenStable()
    expect(screen.getByRole('textbox', { name: 'First name' }).getAttribute('autocomplete')).toBe('given-name')
    expect(screen.getByRole('textbox', { name: 'Street' }).getAttribute('autocomplete')).toBe('street-address')
    expect(screen.getByLabelText('Born').getAttribute('autocomplete')).toBe('bday')
    expect(screen.getByRole('spinbutton', { name: 'Age' }).getAttribute('autocomplete')).toBe('bday-year')
    expect(screen.getByRole('combobox', { name: 'Country' }).getAttribute('autocomplete')).toBe('country')
    expect(screen.getByRole('textbox', { name: 'Note' }).hasAttribute('autocomplete')).toBe(false)
  })
})
