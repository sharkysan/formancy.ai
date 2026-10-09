import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * The ranking control (0138) in the Angular renderer, held to the keyboard behaviour the
 * React one is: putting things in order is a run of presses on the same few buttons, and
 * a control that dropped focus on the page after each one would be operable in principle
 * and exhausting in practice. The same cases as `packages/react/src/ranking.test.tsx`.
 */
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

async function mount(initial?: string[]) {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
    ...(initial === undefined ? {} : { initialValue: { drinks: initial } }),
  })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await view.fixture.whenStable()
  }
  const group = within(screen.getByRole('group', { name: 'Put these in order' }))
  return {
    engine,
    group,
    // Enter on a focused button is a click on it; this package has no user-event, and the
    // activation is the browser's, not the control's.
    press: async () => {
      fireEvent.click(document.activeElement as HTMLElement)
      await settle()
    },
    click: async (element: HTMLElement) => {
      element.focus()
      fireEvent.click(element)
      await settle()
    },
  }
}

const focusedName = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null

describe('the ranking control', () => {
  test('starts with nothing ranked, and offers each option by name', async () => {
    const { group } = await mount()

    expect(group.queryByRole('list', { name: 'Put these in order: your order' })).toBeNull()
    expect(group.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(
      ['Rank Coffee', 'Rank Tea', 'Rank Water'],
    )
  })

  test('ranking them all is a run of Enter, focus moving to the next one each time', async () => {
    const { engine, group, press } = await mount()
    group.getByRole('button', { name: 'Rank Coffee' }).focus()

    await press()
    expect(focusedName()).toBe('Rank Tea')
    await press()
    expect(focusedName()).toBe('Rank Water')
    await press()
    expect(focusedName()).toBe('Move Water up')

    expect(engine.value()).toEqual({ drinks: ['coffee', 'tea', 'water'] })
  })

  test('moving an option keeps focus on it, so three places is three presses', async () => {
    const { engine, group, click, press } = await mount(['coffee', 'tea', 'water'])

    await click(group.getByRole('button', { name: 'Move Water up' }))
    expect(focusedName()).toBe('Move Water up')
    await press()

    expect(engine.value()).toEqual({ drinks: ['water', 'coffee', 'tea'] })
    expect(focusedName()).toBe('Move Water up')
  })

  test('the first cannot go higher, and says so without dropping focus', async () => {
    const { engine, group, click } = await mount(['coffee', 'tea'])
    const up = group.getByRole('button', { name: 'Move Coffee up' })

    expect(up.getAttribute('aria-disabled')).toBe('true')
    await click(up)
    expect(engine.value()).toEqual({ drinks: ['coffee', 'tea'] })
    expect(focusedName()).toBe('Move Coffee up')
  })

  test('taking one out puts it back among the unranked, with focus on it there', async () => {
    const { engine, group, click } = await mount(['coffee', 'tea'])

    await click(group.getByRole('button', { name: 'Take Tea out of the order' }))

    expect(engine.value()).toEqual({ drinks: ['coffee'] })
    expect(focusedName()).toBe('Rank Tea')
  })
})
