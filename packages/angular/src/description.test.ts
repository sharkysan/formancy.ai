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

/** The React binding's `description.test.tsx`, case for case (0194). */
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

async function mount(schema: FormSchema = form): Promise<void> {
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema }))],
  })
  await view.fixture.whenStable()
}

describe('a description', () => {
  test('describes the control, and does not name it', async () => {
    await mount()
    const box = screen.getByRole('textbox', { name: 'Full name' })
    expect(box.getAttribute('aria-describedby')).toBe(screen.getByText('As on your passport.').id)
  })

  test('describes a radio group as a whole', async () => {
    await mount()
    const group = screen.getByRole('group', { name: 'Pets' })
    expect(group.getAttribute('aria-describedby')?.split(' ')).toContain(screen.getByText('Choose one.').id)
  })

  test('is not there when the field has none', async () => {
    await mount()
    expect(screen.getByRole('textbox', { name: 'Nickname' }).getAttribute('aria-describedby')).toBeNull()
  })

  test('of a page is shown under the steps while the page is current', async () => {
    await mount({
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
