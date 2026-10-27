import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { inOptionOrder } from './option-order.js'
import { ticked } from './ticked.js'

/**
 * Options shown in a shuffled order (0200): chosen by the engine once, from the random() it is
 * given, with the options that keep their place left where they are — and never anything but
 * presentation, so what is stored is in the order the options are written.
 */
const channel: FieldDef = {
  key: 'channel',
  type: 'selectboxes',
  label: 'How did you hear of us?',
  shuffle: true,
  options: [
    { value: 'friend', label: 'A friend' },
    { value: 'press', label: 'The press' },
    { value: 'search', label: 'A search' },
    { value: 'none', label: 'None of these', exclusive: true, keepPlace: true },
  ],
}

const form = (fields: FieldDef[]): FormSchema => ({ specVersion: '5', id: 'survey', title: 'Survey', model: { fields } })

/** A random() that answers from a list, so an order is predictable. */
const answering = (...values: number[]) => {
  let at = 0
  return { now: () => 0, today: () => '2026-10-27', random: () => values[at++ % values.length]! }
}

describe('a shuffled order', () => {
  test('is every option once, with the ones that keep their place where they are written', () => {
    const order = createFormEngine({ schema: form([channel]), capabilities: answering(0, 0) }).getFieldSnapshot(['channel']).optionOrder
    // Fisher–Yates over the three that move, with random() answering 0: press, search, friend.
    expect(order).toEqual(['press', 'search', 'friend', 'none'])
  })

  // An order that moved while somebody read it would move the option under their pointer.
  test('is chosen once, and stays while the form is filled in', () => {
    const engine = createFormEngine({ schema: form([channel]), capabilities: answering(0.9, 0.1, 0.5) })
    const before = engine.getFieldSnapshot(['channel']).optionOrder
    engine.setValue(['channel'], ['press'])
    expect(engine.getFieldSnapshot(['channel']).optionOrder).toBe(before)
  })

  test('is not there for a field shown as written', () => {
    const { shuffle: _, ...plain } = channel
    expect(createFormEngine({ schema: form([plain]) }).getFieldSnapshot(['channel']).optionOrder).toBeUndefined()
  })

  // A row's options are the template's, so every row shows them in the one order.
  test('is the same in every row of a repeater', () => {
    const rows: FieldDef = { key: 'people', type: 'repeater', label: 'People', minItems: 2, fields: [{ ...channel }] }
    const engine = createFormEngine({ schema: form([rows]), capabilities: answering(0.3, 0.7) })
    expect(engine.getFieldSnapshot(['people', 1, 'channel']).optionOrder).toEqual(engine.getFieldSnapshot(['people', 0, 'channel']).optionOrder)
  })

  // The engine reads no ambient randomness, as it reads no ambient clock: a form whose order
  // came from Math.random() could not be reproduced by anybody asking why it looked as it did.
  test('needs random() to be given', () => {
    expect(() => createFormEngine({ schema: form([channel]) })).toThrow(/random\(\)/)
  })

  test('orders what a renderer draws, and nothing else', () => {
    const drawn = inOptionOrder([{ value: 'friend' }, { value: 'press' }, { value: 'none' }], ['press', 'none', 'friend'])
    expect(drawn.map((option) => option.value)).toEqual(['press', 'none', 'friend'])
    expect(inOptionOrder([{ value: 'a' }], undefined)).toEqual([{ value: 'a' }])
  })
})

describe('a tick on a shuffled list', () => {
  // Stored in the written order whatever order it was shown in, so two people choosing the
  // same answers store the same array.
  test('is stored in the options’ written order', () => {
    expect(ticked(channel, ['search'], 'friend', true)).toEqual(['friend', 'search'])
  })
})
