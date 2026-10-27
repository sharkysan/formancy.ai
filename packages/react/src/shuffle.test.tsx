import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * A shuffled order on screen (0200): the options drawn in the engine's order, the ones that keep
 * their place where they are written, and what is ticked stored in the written order.
 */
const options = [
  { value: 'friend', label: 'A friend' },
  { value: 'press', label: 'The press' },
  { value: 'search', label: 'A search' },
  { value: 'none', label: 'None of these', keepPlace: true },
]

/** random() answering 0 every time: Fisher–Yates then gives press, search, friend. */
const ZERO = { now: () => 0, today: () => '2026-10-27', random: () => 0 }

const mount = (type: 'radio' | 'selectboxes') => {
  const field = { key: 'channel', type, label: 'How did you hear of us?', shuffle: true, options } as FieldDef
  const schema: FormSchema = { specVersion: '5', id: 'survey', title: 'Survey', model: { fields: [field] } }
  const engine = createFormEngine({ schema, capabilities: ZERO })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>,
  )
  return engine
}

describe('a shuffled order', () => {
  test('draws a radio group’s options in the engine’s order, with the one that keeps its place last', () => {
    mount('radio')
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['press', 'search', 'friend', 'none'])
  })

  test('draws a list of ticks the same way, and stores what is ticked in the written order', () => {
    const engine = mount('selectboxes')
    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('value') ?? (box as HTMLInputElement).id.split(':').pop())).toEqual([
      'press',
      'search',
      'friend',
      'none',
    ])
    fireEvent.click(screen.getByRole('checkbox', { name: 'The press' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'A friend' }))
    expect(engine.getFieldSnapshot(['channel']).value).toEqual(['friend', 'press'])
  })
})
