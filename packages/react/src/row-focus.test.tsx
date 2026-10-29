import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * Where focus goes once a person adds, removes or moves a row (0219).
 *
 * Each of those is a button, and the row it acts on is drawn anew. A removed row's button goes
 * with its row, and the Add button goes once the repeater holds its maximum, so focus was left
 * on nothing: the next Tab started from the top of the page. The Angular renderer is held to the
 * same cases by `packages/angular/src/row-focus.test.ts`.
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

function mount(schema: FormSchema, names: readonly string[] = []) {
  const engine = createFormEngine({
    schema,
    initialValue: { guests: names.map((name) => ({ name })) },
    capabilities: { now: () => 0, today: () => '2026-10-29', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>,
  )
}

const focused = (): string | null => {
  const active = document.activeElement
  return active instanceof HTMLInputElement ? `Name: ${active.value}` : (active?.textContent?.trim() ?? null)
}
const names = () => screen.getAllByLabelText('Name') as HTMLInputElement[]

describe('focus after a row command', () => {
  // A person adds a row to answer it.
  test('adding a row takes focus into its first question', async () => {
    mount(guests(), ['Ada'])
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))

    expect(document.activeElement).toBe(names()[1])
  })

  // The Add button is not drawn at the maximum (0184), so the button pressed was gone.
  test('adding the last row the maximum allows takes focus into it, not to the page', async () => {
    mount(guests({ maxItems: 2 }), ['Ada'])
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))

    expect(screen.queryByRole('button', { name: 'Add guest' })).toBeNull()
    expect(document.activeElement).toBe(names()[1])
  })

  test('removing a row takes focus into the row now in its place', async () => {
    mount(guests(), ['Ada', 'Bo', 'Cy'])
    await userEvent.click(screen.getByRole('button', { name: 'Remove guest 2 of 3' }))

    expect(focused()).toBe('Name: Cy')
  })

  test('removing the last row takes focus into the row before it', async () => {
    mount(guests(), ['Ada', 'Bo'])
    await userEvent.click(screen.getByRole('button', { name: 'Remove guest 2 of 2' }))

    expect(focused()).toBe('Name: Ada')
  })

  test('removing the only row takes focus to the Add button', async () => {
    mount(guests(), ['Ada'])
    await userEvent.click(screen.getByRole('button', { name: 'Remove guest 1 of 1' }))

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add guest' }))
  })

  // Pressing it again moves the row on, which is how a keyboard reorders; at an end, where that
  // button is not drawn, the other one.
  test('moving a row keeps focus on its button, and on the other one at an end', async () => {
    mount(guests(), ['Ada', 'Bo', 'Cy'])
    await userEvent.click(screen.getByRole('button', { name: 'Move Guests 1 of 3 down' }))
    expect(focused()).toBe('Move Guests 2 of 3 down')

    await userEvent.click(screen.getByRole('button', { name: 'Move Guests 2 of 3 down' }))
    expect(focused()).toBe('Move Guests 3 of 3 up')
    expect(names().map((input) => input.value)).toEqual(['Bo', 'Cy', 'Ada'])
  })

  test('in a data grid as in rows', async () => {
    mount(guests({ widget: 'datagrid' }), ['Ada', 'Bo'])
    await userEvent.click(screen.getByRole('button', { name: 'Remove guest 1 of 2' }))
    expect(focused()).toBe('Name: Bo')

    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))
    expect(document.activeElement).toBe(names()[1])
  })
})
