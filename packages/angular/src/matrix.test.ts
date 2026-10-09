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
 * The matrix control (0139) in the Angular renderer: a radio group per row rather than one
 * long radio group drawn in rows. The same cases as `packages/react/src/matrix.test.tsx`.
 */
const schema = {
  specVersion: '4',
  id: 'meal',
  title: 'Meal',
  model: {
    fields: [
      {
        key: 'rating',
        type: 'matrix',
        label: 'How was it?',
        rows: [
          { value: 'taste', label: 'Taste' },
          { value: 'delivery', label: 'Delivery' },
        ],
        options: [
          { value: 'poor', label: 'Poor' },
          { value: 'great', label: 'Great' },
        ],
      },
    ],
  },
} as unknown as FormSchema

async function mount() {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
  })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await view.fixture.whenStable()
  }
  return { engine, settle, matrix: within(screen.getByRole('group', { name: 'How was it?' })) }
}

describe('the matrix control', () => {
  test('is a group per row, named by the row, of radios named by the column', async () => {
    const { matrix } = await mount()

    for (const row of ['Taste', 'Delivery']) {
      const group = within(matrix.getByRole('group', { name: row }))
      expect(group.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
        'poor',
        'great',
      ])
      expect(group.getByRole('radio', { name: 'Great' })).toBeTruthy()
    }
  })

  test('each row is its own radio group, so choosing in one keeps the other', async () => {
    const { engine, matrix, settle } = await mount()
    const taste = within(matrix.getByRole('group', { name: 'Taste' }))
    const delivery = within(matrix.getByRole('group', { name: 'Delivery' }))

    fireEvent.click(taste.getByRole('radio', { name: 'Great' }))
    await settle()
    fireEvent.click(delivery.getByRole('radio', { name: 'Poor' }))
    await settle()

    expect(engine.value()).toEqual({ rating: { taste: 'great', delivery: 'poor' } })
    expect((taste.getByRole('radio', { name: 'Great' }) as HTMLInputElement).checked).toBe(true)
    const names = new Set(matrix.getAllByRole('radio').map((radio) => radio.getAttribute('name')))
    expect(names.size).toBe(2)
  })
})
