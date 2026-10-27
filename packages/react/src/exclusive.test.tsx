import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * An exclusive option on screen (0199): ticking it clears the rest and ticking another clears it,
 * so a control never stores the answer the engine refuses.
 */
const field = (widget?: 'tagpicker'): FieldDef => ({
  key: 'allergies',
  type: 'selectboxes',
  label: 'Allergies',
  ...(widget === undefined ? {} : { widget }),
  options: [
    { value: 'nuts', label: 'Nuts' },
    { value: 'milk', label: 'Milk' },
    { value: 'none', label: 'None of these', exclusive: true },
  ],
})

const mount = (widget?: 'tagpicker') => {
  const schema: FormSchema = { specVersion: '5', id: 'health', title: 'Health', model: { fields: [field(widget)] } }
  const engine = createFormEngine({ schema })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>,
  )
  return () => engine.getFieldSnapshot(['allergies']).value
}

describe('an exclusive option', () => {
  test('ticked, clears the other ticks', () => {
    const value = mount()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nuts' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'None of these' }))
    expect(value()).toEqual(['none'])
    expect((screen.getByRole('checkbox', { name: 'Nuts' }) as HTMLInputElement).checked).toBe(false)
  })

  test('is cleared when another is ticked', () => {
    const value = mount()
    fireEvent.click(screen.getByRole('checkbox', { name: 'None of these' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
    expect(value()).toEqual(['milk'])
  })

  // The tag picker adds by choosing from its list, and is held to the same answer.
  test('chosen in a tag picker, leaves only itself', () => {
    const value = mount('tagpicker')
    const box = screen.getByRole('combobox', { name: 'Allergies' })
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('option', { name: 'Nuts' }))
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('option', { name: 'None of these' }))
    expect(value()).toEqual(['none'])
  })
})
