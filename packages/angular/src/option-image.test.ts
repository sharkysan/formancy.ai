import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FieldOption, FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.replaceChildren()
})

/**
 * Options with pictures in Angular — the cases React's binding is held to, near-copied
 * on purpose, as the toggle's tests explain (0126).
 */
async function mount(type: 'radio' | 'selectboxes', options: FieldOption[]): Promise<void> {
  const schema: FormSchema = {
    specVersion: '4',
    id: 'pets',
    title: 'Pets',
    model: { fields: [{ key: 'pet', type, label: 'Pet', options }] },
  }
  await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema }))],
  })
}

const CAT: FieldOption = {
  value: 'cat',
  label: 'Cat',
  image: { src: '/cat.png', alt: 'A tabby asleep in the sun' },
}

describe('an option with a picture', () => {
  test('shows it inside the label, so pressing the picture chooses the option', async () => {
    await mount('radio', [CAT])

    const picture = screen.getByRole('img', { name: 'A tabby asleep in the sun' })
    expect(picture.closest('label')?.htmlFor).toBe(
      (screen.getByRole('radio') as HTMLInputElement).id,
    )
    expect(picture.getAttribute('data-formancy-part')).toBe('option-image')
  })

  test('and its text alternative joins the option’s name, a space apart', async () => {
    await mount('selectboxes', [CAT])

    expect(screen.getByRole('checkbox', { name: 'A tabby asleep in the sun Cat' })).toBeTruthy()
  })

  test('and with no alternative the picture is decoration, and the name is the label alone', async () => {
    await mount('radio', [{ value: 'dog', label: 'Dog', image: { src: '/dog.png' } }])

    expect(screen.getByRole('radio', { name: 'Dog' })).toBeTruthy()
    expect(document.querySelector('[data-formancy-part="option-image"]')?.getAttribute('alt')).toBe(
      '',
    )
  })

  test('and a picture from an address the format does not allow is not loaded', async () => {
    await mount('radio', [
      { value: 'cat', label: 'Cat', image: { src: 'http://tracker.example/x.png' } },
    ])

    expect(document.querySelector('[data-formancy-part="option-image"]')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Cat' })).toBeTruthy()
  })
})
