import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The React binding's `exclusive.test.tsx`, case for case (0199). */
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

async function mount(widget?: 'tagpicker') {
  const schema: FormSchema = { specVersion: '5', id: 'health', title: 'Health', model: { fields: [field(widget)] } }
  const engine = createFormEngine({ schema })
  const view = await render(FormancyForm, { providers: [provideZonelessChangeDetection(), provideFormancy(engine)] })
  await view.fixture.whenStable()
  const click = async (element: HTMLElement): Promise<void> => {
    fireEvent.click(element)
    await view.fixture.whenStable()
  }
  return { click, value: () => engine.getFieldSnapshot(['allergies']).value }
}

describe('an exclusive option', () => {
  test('ticked, clears the other ticks', async () => {
    const { click, value } = await mount()
    await click(screen.getByRole('checkbox', { name: 'Nuts' }))
    await click(screen.getByRole('checkbox', { name: 'Milk' }))
    await click(screen.getByRole('checkbox', { name: 'None of these' }))
    expect(value()).toEqual(['none'])
    expect((screen.getByRole('checkbox', { name: 'Nuts' }) as HTMLInputElement).checked).toBe(false)
  })

  test('is cleared when another is ticked', async () => {
    const { click, value } = await mount()
    await click(screen.getByRole('checkbox', { name: 'None of these' }))
    await click(screen.getByRole('checkbox', { name: 'Milk' }))
    expect(value()).toEqual(['milk'])
  })

  test('chosen in a tag picker, leaves only itself', async () => {
    const { click, value } = await mount('tagpicker')
    const box = screen.getByRole('combobox', { name: 'Allergies' })
    await click(box)
    await click(screen.getByRole('option', { name: 'Nuts' }))
    await click(box)
    await click(screen.getByRole('option', { name: 'None of these' }))
    expect(value()).toEqual(['none'])
  })
})
