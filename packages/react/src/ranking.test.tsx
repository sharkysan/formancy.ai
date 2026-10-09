import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

/**
 * The ranking control (0138), beyond what the conformance fixture holds both renderers to:
 * that it is usable by keyboard alone without losing its place. Putting things in order is
 * a run of presses on the same few buttons, and a control that dropped focus on the page
 * after each one would be operable in principle and exhausting in practice.
 */
afterEach(cleanup)

const schema = {
  specVersion: '4',
  id: 'drinks',
  title: 'Drinks',
  model: {
    fields: [
      {
        key: 'drinks',
        type: 'ranking',
        label: 'Put these in order',
        options: [
          { value: 'coffee', label: 'Coffee' },
          { value: 'tea', label: 'Tea' },
          { value: 'water', label: 'Water' },
        ],
      },
    ],
  },
} as unknown as FormSchema

function mount() {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>,
  )
  const group = within(screen.getByRole('group', { name: 'Put these in order' }))
  return { engine, group, user: userEvent.setup() }
}

const focusedName = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null

describe('the ranking control', () => {
  test('starts with nothing ranked, and offers each option by name', () => {
    const { group } = mount()

    expect(group.queryByRole('list', { name: 'Put these in order: your order' })).toBeNull()
    expect(group.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(
      ['Rank Coffee', 'Rank Tea', 'Rank Water'],
    )
  })

  test('ranking them all is a run of Enter, focus moving to the next one each time', async () => {
    const { engine, group, user } = mount()
    group.getByRole('button', { name: 'Rank Coffee' }).focus()

    await user.keyboard('{Enter}')
    expect(focusedName()).toBe('Rank Tea')
    await user.keyboard('{Enter}')
    expect(focusedName()).toBe('Rank Water')
    await user.keyboard('{Enter}')
    // Nothing left to rank, so focus goes to the option just placed rather than the page.
    expect(focusedName()).toBe('Move Water up')

    expect(engine.value()).toEqual({ drinks: ['coffee', 'tea', 'water'] })
  })

  test('moving an option keeps focus on it, so three places is three presses', async () => {
    const { engine, group, user } = mount()
    engine.setValue(['drinks'], ['coffee', 'tea', 'water'])
    await user.click(await group.findByRole('button', { name: 'Move Water up' }))
    expect(focusedName()).toBe('Move Water up')
    await user.keyboard('{Enter}')

    expect(engine.value()).toEqual({ drinks: ['water', 'coffee', 'tea'] })
    expect(focusedName()).toBe('Move Water up')
  })

  test('the first cannot go higher, and says so without dropping focus', async () => {
    const { engine, group, user } = mount()
    engine.setValue(['drinks'], ['coffee', 'tea'])
    const up = await group.findByRole('button', { name: 'Move Coffee up' })

    expect(up.getAttribute('aria-disabled')).toBe('true')
    await user.click(up)
    expect(engine.value()).toEqual({ drinks: ['coffee', 'tea'] })
    expect(focusedName()).toBe('Move Coffee up')
  })

  test('taking one out puts it back among the unranked, with focus on it there', async () => {
    const { engine, group, user } = mount()
    engine.setValue(['drinks'], ['coffee', 'tea'])

    await user.click(await group.findByRole('button', { name: 'Take Tea out of the order' }))

    expect(engine.value()).toEqual({ drinks: ['coffee'] })
    expect(focusedName()).toBe('Rank Tea')
  })
})
