import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

/**
 * The matrix control (0139), beyond the conformance fixture: what makes it a radio group
 * per row rather than one long radio group that happens to be drawn in rows.
 */
afterEach(cleanup)

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
  return { engine, matrix: within(screen.getByRole('group', { name: 'How was it?' })) }
}

describe('the matrix control', () => {
  test('is a group per row, named by the row, of radios named by the column', () => {
    const { matrix } = mount()

    for (const row of ['Taste', 'Delivery']) {
      const group = within(matrix.getByRole('group', { name: row }))
      expect(group.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
        'poor',
        'great',
      ])
      expect(group.getByRole('radio', { name: 'Great' })).toBeTruthy()
    }
  })

  test('each row is its own radio group, so choosing in one keeps the other', () => {
    // One `name` for every radio would make the browser treat the matrix as ONE group:
    // choosing the delivery would untick the taste, and arrow keys would walk the lot.
    const { engine, matrix } = mount()
    const taste = within(matrix.getByRole('group', { name: 'Taste' }))
    const delivery = within(matrix.getByRole('group', { name: 'Delivery' }))

    fireEvent.click(taste.getByRole('radio', { name: 'Great' }))
    fireEvent.click(delivery.getByRole('radio', { name: 'Poor' }))

    expect(engine.value()).toEqual({ rating: { taste: 'great', delivery: 'poor' } })
    expect((taste.getByRole('radio', { name: 'Great' }) as HTMLInputElement).checked).toBe(true)
    const names = new Set(matrix.getAllByRole('radio').map((radio) => radio.getAttribute('name')))
    expect(names.size).toBe(2)
  })
})
