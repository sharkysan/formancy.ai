import { describe, expect, test } from 'vitest'
import { layoutDropLocation } from './layout-drop.js'
import type { FormSchema } from '@formancy/spec'

/**
 * The index arithmetic, which is where a layout drag goes wrong silently.
 *
 * Both off-by-ones here produce a valid document: the node lands somewhere,
 * just not where the pointer was. That is why they are tested against stated
 * expectations rather than against "it did not throw".
 */
const schema = (): FormSchema => ({
  specVersion: '1',
  id: 'arranged',
  title: 'An arranged form',
  model: {
    fields: [
      { key: 'a', type: 'text', label: 'A' },
      { key: 'b', type: 'text', label: 'B' },
      { key: 'c', type: 'text', label: 'C' },
      { key: 'd', type: 'text', label: 'D' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        { kind: 'field', path: 'a' },
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'b' },
            { kind: 'field', path: 'c' },
          ],
        },
        { kind: 'field', path: 'd' },
      ],
    },
  ],
})

const drop = (
  dragged: readonly number[],
  over: readonly number[],
  edge: 'before' | 'after',
): ReturnType<typeof layoutDropLocation> => layoutDropLocation(schema(), 'web', dragged, over, edge)

describe('within one container', () => {
  test('dragging down counts the position AFTER the node is lifted out', () => {
    // Node 0 dropped after node 2. With it lifted, node 2 is at index 1, so
    // the landing index is 2 — the end. Counting against the list as it stands
    // would say 3 and clamp back to the end by luck rather than by reasoning.
    expect(drop([0], [2], 'after')).toEqual({ layout: 'web', parent: [], index: 2 })
  })

  test('dragging up does not shift, because nothing below it moved', () => {
    expect(drop([2], [0], 'before')).toEqual({ layout: 'web', parent: [], index: 0 })
  })

  test('the position it already occupies is refused, not returned as a no-op', () => {
    // Dropping node 1 just after node 0 leaves it exactly where it is. A
    // command for that would push a no-op onto the undo stack and announce a
    // move that did not happen.
    expect(drop([1], [0], 'after')).toBeUndefined()
    expect(drop([1], [2], 'before')).toBeUndefined()
  })

  test('onto itself is refused', () => {
    expect(drop([1], [1], 'before')).toBeUndefined()
    expect(drop([1], [1], 'after')).toBeUndefined()
  })
})

describe('across containers', () => {
  test('into a row, before its first child', () => {
    expect(drop([0], [1, 0], 'before')).toEqual({ layout: 'web', parent: [1], index: 0 })
  })

  test('out of a row, to the top level', () => {
    expect(drop([1, 0], [0], 'after')).toEqual({ layout: 'web', parent: [], index: 1 })
  })

  test('a container cannot be dropped into its own child', () => {
    expect(drop([1], [1, 0], 'before')).toBeUndefined()
    expect(drop([1], [1, 1], 'after')).toBeUndefined()
  })
})

describe('the container path is left as the caller sees it', () => {
  test('a row addressed after the lifted node keeps its current path', () => {
    // The row is at index 1 and stays [1] here, even though lifting node 0
    // will make it index 0. The session applies that correction once, on the
    // inside; doing it here as well applied it twice, landed the node in a
    // neighbouring container, and left a valid document behind.
    expect(drop([0], [1, 1], 'after')).toEqual({ layout: 'web', parent: [1], index: 2 })
  })

  test('a row addressed before the lifted node, likewise', () => {
    expect(drop([2], [1, 0], 'before')).toEqual({ layout: 'web', parent: [1], index: 0 })
  })
})

describe('refusals that are not arithmetic', () => {
  test('an unknown layout', () => {
    expect(layoutDropLocation(schema(), 'print', [0], [1], 'before')).toBeUndefined()
  })

  test('a target index nothing occupies', () => {
    expect(layoutDropLocation(schema(), 'web', [0], [9], 'before')).toBeUndefined()
  })
})
