import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/** A placeholder in the empty box, in the form's language, and never as the name (0196). */
const form: FormSchema = {
  specVersion: '5',
  id: 'contact',
  title: 'Contact',
  i18n: { defaultLocale: 'en', messages: { en: { 'phone.example': '79 123 45 67' }, de: { 'phone.example': '79 123 45 67 (Mobil)' } } },
  model: {
    fields: [
      { key: 'phone', type: 'text', label: 'Phone', placeholder: { $t: 'phone.example' } },
      { key: 'masked', type: 'text', label: 'Masked', mask: '+41 99 999 99 99' },
      { key: 'example', type: 'text', label: 'Example', mask: '+41 99 999 99 99', placeholder: '+41 79 123 45 67' },
      { key: 'note', type: 'textarea', label: 'Note', placeholder: 'Anything else?' },
      { key: 'qty', type: 'number', label: 'Quantity', placeholder: '12' },
    ],
  },
}

const mount = (locale?: string) =>
  render(
    <FormancyProvider engine={createFormEngine({ schema: form, ...(locale === undefined ? {} : { locale }) })}>
      <FormancyForm />
    </FormancyProvider>,
  )

describe('a placeholder', () => {
  test('is in the empty box of a text, long text and number field, and the label still names it', () => {
    mount()
    expect(screen.getByRole('textbox', { name: 'Phone' }).getAttribute('placeholder')).toBe('79 123 45 67')
    expect(screen.getByRole('textbox', { name: 'Note' }).getAttribute('placeholder')).toBe('Anything else?')
    expect(screen.getByRole('spinbutton', { name: 'Quantity' }).getAttribute('placeholder')).toBe('12')
  })

  test('is read in the form’s language', () => {
    mount('de')
    expect(screen.getByRole('textbox', { name: 'Phone' }).getAttribute('placeholder')).toBe('79 123 45 67 (Mobil)')
  })

  // A masked field shows its shape until the author gives an example of their own.
  test('on a masked field replaces the shape, which shows when there is none', () => {
    mount()
    expect(screen.getByRole('textbox', { name: 'Masked' }).getAttribute('placeholder')).toBe('+41 __ ___ __ __')
    expect(screen.getByRole('textbox', { name: 'Example' }).getAttribute('placeholder')).toBe('+41 79 123 45 67')
  })
})
