import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * Where focus goes once a person adds, removes or moves a row (0219): the cases of
 * `packages/react/src/row-focus.test.tsx`, by the same names. A removed row's button goes with
 * its row, and the Add button goes once the repeater holds its maximum, so focus was left on
 * nothing and the next Tab started from the top of the page.
 */
function guests(repeater: Record<string, unknown> = {}) {
  return {
    specVersion: '4',
    id: 'party',
    title: 'Party',
    model: {
      fields: [
        {
          key: 'guests',
          type: 'repeater',
          label: 'Guests',
          addLabel: 'Add guest',
          removeLabel: 'Remove guest',
          ...repeater,
          fields: [{ key: 'name', type: 'text', label: 'Name' }],
        },
      ],
    },
  } as unknown as FormSchema
}

async function mount(schema: FormSchema, names: readonly string[] = []) {
  const engine = createFormEngine({
    schema,
    initialValue: { guests: names.map((name) => ({ name })) },
    capabilities: { now: () => 0, today: () => '2026-10-29', random: () => 0.5 },
  })
  const view = await render(FormancyForm, { providers: [provideZonelessChangeDetection(), provideFormancy(engine)] })
  await view.fixture.whenStable()
  /** Press a button as a person would — focus on it first — and let the change be drawn. */
  return async (name: string): Promise<void> => {
    const button = screen.getByRole('button', { name })
    button.focus()
    fireEvent.click(button)
    await view.fixture.whenStable()
  }
}

const focused = (): string | null => {
  const active = document.activeElement
  return active instanceof HTMLInputElement ? `Name: ${active.value}` : (active?.textContent?.trim() ?? null)
}
const names = () => screen.getAllByLabelText('Name') as HTMLInputElement[]

describe('focus after a row command', () => {
  // A person adds a row to answer it.
  test('adding a row takes focus into its first question', async () => {
    const press = await mount(guests(), ['Ada'])
    await press('Add guest')

    expect(document.activeElement).toBe(names()[1])
  })

  // The Add button is not drawn at the maximum (0184), so the button pressed was gone.
  test('adding the last row the maximum allows takes focus into it, not to the page', async () => {
    const press = await mount(guests({ maxItems: 2 }), ['Ada'])
    await press('Add guest')

    expect(screen.queryByRole('button', { name: 'Add guest' })).toBeNull()
    expect(document.activeElement).toBe(names()[1])
  })

  test('removing a row takes focus into the row now in its place', async () => {
    const press = await mount(guests(), ['Ada', 'Bo', 'Cy'])
    await press('Remove guest 2 of 3')

    expect(focused()).toBe('Name: Cy')
  })

  test('removing the last row takes focus into the row before it', async () => {
    const press = await mount(guests(), ['Ada', 'Bo'])
    await press('Remove guest 2 of 2')

    expect(focused()).toBe('Name: Ada')
  })

  test('removing the only row takes focus to the Add button', async () => {
    const press = await mount(guests(), ['Ada'])
    await press('Remove guest 1 of 1')

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add guest' }))
  })

  // Pressing it again moves the row on, which is how a keyboard reorders; at an end, where that
  // button is not drawn, the other one.
  test('moving a row keeps focus on its button, and on the other one at an end', async () => {
    const press = await mount(guests(), ['Ada', 'Bo', 'Cy'])
    await press('Move Guests 1 of 3 down')
    expect(focused()).toBe('Move Guests 2 of 3 down')

    await press('Move Guests 2 of 3 down')
    expect(focused()).toBe('Move Guests 3 of 3 up')
    expect(names().map((input) => input.value)).toEqual(['Bo', 'Cy', 'Ada'])
  })

  test('in a data grid as in rows', async () => {
    const press = await mount(guests({ widget: 'datagrid' }), ['Ada', 'Bo'])
    await press('Remove guest 1 of 2')
    expect(focused()).toBe('Name: Bo')

    await press('Add guest')
    expect(document.activeElement).toBe(names()[1])
  })
})
