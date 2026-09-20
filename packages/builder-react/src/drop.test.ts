import { describe, expect, test } from 'vitest'
import { createBuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { dropLocation } from './drop.js'

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'a', type: 'text', label: 'A' },
      { key: 'b', type: 'text', label: 'B' },
      { key: 'c', type: 'text', label: 'C' },
      {
        key: 'bag',
        type: 'group',
        label: 'Bag',
        fields: [
          { key: 'x', type: 'text', label: 'X' },
          { key: 'y', type: 'text', label: 'Y' },
        ],
      },
    ],
  },
}

const at = (dragged: string[], over: string[], edge: 'before' | 'after'): string => {
  const location = dropLocation(schema, dragged, over, edge)
  return location === undefined ? 'refused' : `${location.parent.join('/')}#${String(location.index)}`
}

/**
 * A drop index counts positions in the container AFTER the dragged field has
 * been lifted out — the same subtlety that made the keyboard palette describe
 * the wrong neighbours. Computing it from the list as it stands is off by one
 * for every move downward within a container, which is the most common drag
 * there is.
 */
describe('dropLocation', () => {
  test('dropping above a field in another container', () => {
    expect(at(['a'], ['bag', 'x'], 'before')).toBe('bag#0')
    expect(at(['a'], ['bag', 'x'], 'after')).toBe('bag#1')
    expect(at(['a'], ['bag', 'y'], 'after')).toBe('bag#2')
  })

  test('moving DOWN within a container accounts for the gap left behind', () => {
    // a b c, drag A after B. Lift A out and the list is b c; landing after B
    // is index 1, not 2. Counting against the original list moves it one too
    // far — and the field ends up somewhere the person did not point at.
    expect(at(['a'], ['b'], 'after')).toBe('#1')
    expect(at(['a'], ['c'], 'after')).toBe('#2')
  })

  test('moving UP within a container does not', () => {
    // c before a. Lifting C out does not disturb anything above it.
    expect(at(['c'], ['a'], 'before')).toBe('#0')
    expect(at(['c'], ['b'], 'before')).toBe('#1')
  })

  test('dropping onto itself is refused rather than being a no-op move', () => {
    expect(at(['b'], ['b'], 'before')).toBe('refused')
    expect(at(['b'], ['b'], 'after')).toBe('refused')
  })

  test('a drop that would not move anything is refused', () => {
    // a b c: dropping A after nothing above it, or before B, both leave it
    // exactly where it is. Committing them would push a no-op onto the undo
    // stack and announce a move that did not happen.
    expect(at(['a'], ['b'], 'before')).toBe('refused')
    expect(at(['b'], ['a'], 'after')).toBe('refused')
  })

  test('a container cannot be dropped inside itself', () => {
    expect(at(['bag'], ['bag', 'x'], 'before')).toBe('refused')
    expect(at(['bag'], ['bag', 'y'], 'after')).toBe('refused')
  })

  test('every location it produces is one the session accepts', () => {
    // The point of computing rather than guessing: a drop the UI allows must
    // not be refused after the fact, or the field snaps back with no
    // explanation.
    const cases: Array<[string[], string[], 'before' | 'after']> = [
      [['a'], ['c'], 'after'],
      [['a'], ['bag', 'x'], 'before'],
      [['bag', 'x'], ['a'], 'before'],
      [['c'], ['a'], 'before'],
    ]

    for (const [dragged, over, edge] of cases) {
      const location = dropLocation(schema, dragged, over, edge)
      expect(location, `${dragged.join('.')} ${edge} ${over.join('.')}`).toBeDefined()

      const session = createBuilderSession(schema)
      expect(session.moveField(dragged, location!).ok, `${dragged.join('.')} ${edge} ${over.join('.')}`).toBe(true)
    }
  })
})
