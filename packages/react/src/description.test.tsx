import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * A field's description on screen (0194): under the question, read out with the control — its
 * accessible description, never part of its accessible name.
 */
const form: FormSchema = {
  specVersion: '5',
  id: 'passport',
  title: 'Passport',
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Full name', description: 'As on your passport.' },
      { key: 'pets', type: 'radio', label: 'Pets', description: 'Choose one.', options: [{ value: 'cat', label: 'Cat' }] },
      { key: 'plain', type: 'text', label: 'Nickname' },
    ],
  },
}

const mount = (schema: FormSchema = form) =>
  render(
    <FormancyProvider engine={createFormEngine({ schema })}>
      <FormancyForm />
    </FormancyProvider>,
  )

describe('a description', () => {
  // The label stays the name; the description is what a screen reader reads after it.
  test('describes the control, and does not name it', () => {
    mount()
    const box = screen.getByRole('textbox', { name: 'Full name' })
    expect(box.getAttribute('aria-describedby')).toBe(screen.getByText('As on your passport.').id)
  })

  test('describes a radio group as a whole', () => {
    mount()
    const group = screen.getByRole('group', { name: 'Pets' })
    expect(group.getAttribute('aria-describedby')?.split(' ')).toContain(screen.getByText('Choose one.').id)
  })

  // Nothing drawn, and nothing pointed at, for a field without one.
  test('is not there when the field has none', () => {
    mount()
    expect(screen.getByRole('textbox', { name: 'Nickname' }).getAttribute('aria-describedby')).toBeNull()
  })

  test('of a page is shown under the steps while the page is current', () => {
    mount({
      ...form,
      model: {
        fields: [
          { key: 'one', type: 'page', label: 'About you', description: 'We ask this once.', fields: [{ key: 'name', type: 'text', label: 'Name' }] },
          { key: 'two', type: 'page', label: 'Done', fields: [{ key: 'note', type: 'text', label: 'Note' }] },
        ],
      },
    })
    expect(screen.getByText('We ask this once.')).toBeTruthy()
  })
})
