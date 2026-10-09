import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FieldOption, FormSchema } from '@formancy/spec'
import { FormancyForm } from './form.js'
import { FormancyProvider } from './context.js'

/**
 * Options with pictures, in React (0126).
 *
 * The picture is presentation: the answer is still the option's value. What can go
 * wrong is how it reaches a person — a picture outside the label is one that pressing
 * does not choose, a text alternative that does not reach the option's name is one a
 * screen reader never hears, and an address the format does not allow is one a page
 * should not load.
 */
afterEach(cleanup)

const mount = (type: 'radio' | 'selectboxes', options: FieldOption[]) => {
  const schema: FormSchema = {
    specVersion: '4',
    id: 'pets',
    title: 'Pets',
    model: { fields: [{ key: 'pet', type, label: 'Pet', options }] },
  }
  render(
    <FormancyProvider engine={createFormEngine({ schema })}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
}

const CAT: FieldOption = {
  value: 'cat',
  label: 'Cat',
  image: { src: '/cat.png', alt: 'A tabby asleep in the sun' },
}

describe('an option with a picture', () => {
  test('shows it inside the label, so pressing the picture chooses the option', () => {
    mount('radio', [CAT])

    const picture = screen.getByRole('img', { name: 'A tabby asleep in the sun' })
    expect(picture.closest('label')?.htmlFor).toBe(
      (screen.getByRole('radio') as HTMLInputElement).id,
    )
    expect(picture.getAttribute('data-formancy-part')).toBe('option-image')
  })

  test('and its text alternative joins the option’s name', () => {
    mount('selectboxes', [CAT])

    expect(screen.getByRole('checkbox', { name: 'A tabby asleep in the sun Cat' })).toBeTruthy()
  })

  test('and with no alternative the picture is decoration, and the name is the label alone', () => {
    // An empty alt rather than none: an image with no alt at all is announced by its
    // file name, which is noise in the middle of an option's name.
    mount('radio', [{ value: 'dog', label: 'Dog', image: { src: '/dog.png' } }])

    expect(screen.getByRole('radio', { name: 'Dog' })).toBeTruthy()
    expect(document.querySelector('[data-formancy-part="option-image"]')?.getAttribute('alt')).toBe(
      '',
    )
  })

  test('and a picture from an address the format does not allow is not loaded', () => {
    // A document that never met the validator can carry one; the renderers agree on
    // which to draw by asking the format's own rule.
    mount('radio', [{ value: 'cat', label: 'Cat', image: { src: 'http://tracker.example/x.png' } }])

    expect(document.querySelector('[data-formancy-part="option-image"]')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Cat' })).toBeTruthy()
  })
})
