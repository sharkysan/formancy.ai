import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { SIDE_ZONE_MINIMUM, arrangeDrop, gapNeighbour } from './arrange.js'
import type { Box, DrawnNode } from './arrange.js'

/**
 * What a drag over the rendered form would do, decided without a DOM.
 *
 * This is the geometry that was inside `builder-react`'s surface, where a
 * second builder could not reach it. The rule is
 * [0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)'s: what
 * decides anything belongs here, and a builder package is the part that reads a
 * pointer and draws a line.
 *
 * Framework-free and DOM-free, so the inputs are plain numbers. That is not a
 * purity exercise — it is what lets both builders agree about where a drop
 * lands, and what lets these cases be written without a layout engine, which
 * jsdom does not have. Every element there is zero-sized, so a surface tested
 * only through jsdom cannot see a side zone at all.
 */
const document_: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'first', type: 'text' },
      { key: 'last', type: 'text' },
      { key: 'email', type: 'text' },
    ],
  },
  layouts: [
    {
      name: 'default',
      nodes: [
        { kind: 'field', path: 'first' },
        { kind: 'field', path: 'last' },
        { kind: 'field', path: 'email' },
      ],
    },
  ],
} as unknown as FormSchema

/** A box 200 wide and 40 tall at the origin, which is wider than the side zone. */
const wide: Box = { left: 0, right: 200, top: 0, bottom: 40, width: 200, height: 40 }

const drop = (input: Partial<Parameters<typeof arrangeDrop>[0]>) =>
  arrangeDrop({
    document: document_,
    layout: 'default',
    dragged: [2],
    over: [0],
    box: wide,
    pointer: { x: 100, y: 10 },
    sideBySide: false,
    direction: 'ltr',
    ...input,
  })

describe('what a drag over the rendered form would do', () => {
  test('aiming at the middle moves the node, above or below', () => {
    // The commonest drag, and the one that must keep working whatever the side
    // zones do: the vertical half decides before or after.
    expect(drop({ pointer: { x: 100, y: 10 } })).toMatchObject({ kind: 'move', edge: 'before' })
    expect(drop({ pointer: { x: 100, y: 30 } })).toMatchObject({ kind: 'move', edge: 'after' })
  })

  test('aiming at a side makes a row, and the side decides the order', () => {
    expect(drop({ pointer: { x: 4, y: 20 } })).toMatchObject({ kind: 'wrap', side: 'start', over: [0] })
    expect(drop({ pointer: { x: 196, y: 20 } })).toMatchObject({ kind: 'wrap', side: 'end', over: [0] })
  })

  test('a narrow element offers no side zone, so the whole of it moves', () => {
    /*
     * Without this the sides of a short control are a target nobody can hit and
     * the element is *entirely* side zones — there is no middle left to aim at.
     * It is also what stops a zero-sized element being treated as all edge,
     * which matters because every element in jsdom is zero-sized.
     */
    const narrow: Box = { left: 0, right: 40, top: 0, bottom: 40, width: 40, height: 40 }
    expect(narrow.width).toBeLessThan(SIDE_ZONE_MINIMUM)

    expect(drop({ box: narrow, pointer: { x: 1, y: 20 } })).toMatchObject({ kind: 'move' })
    expect(drop({ box: narrow, pointer: { x: 39, y: 20 } })).toMatchObject({ kind: 'move' })
  })

  test('and a zero-sized element is a move rather than an edge', () => {
    const nothing: Box = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }

    expect(drop({ box: nothing, pointer: { x: 0, y: 0 } })).toMatchObject({ kind: 'move' })
  })

  test('the side zone is capped, so a very wide field keeps a middle', () => {
    // A quarter of 2000 would be a 500-pixel side zone, which swallows the
    // element. 64 is the cap, so 100 pixels in is still the middle.
    const huge: Box = { left: 0, right: 2000, top: 0, bottom: 40, width: 2000, height: 40 }

    expect(drop({ box: huge, pointer: { x: 100, y: 20 } })).toMatchObject({ kind: 'move' })
    expect(drop({ box: huge, pointer: { x: 10, y: 20 } })).toMatchObject({ kind: 'wrap' })
  })

  test('something already side by side has no side zones, and its halves run across', () => {
    /*
     * Inside a row or a table, left and right already mean before and after.
     * Giving them a second meaning would make the commonest drag in a row
     * ambiguous — and a drop on the side of a field in a two-column table used
     * to build a new row inside a half-width cell, where the field landed below
     * its target rather than beside it.
     */
    expect(drop({ sideBySide: true, pointer: { x: 4, y: 20 } })).toMatchObject({
      kind: 'move',
      edge: 'before',
      axis: 'inline',
    })
    expect(drop({ sideBySide: true, pointer: { x: 196, y: 20 } })).toMatchObject({
      kind: 'move',
      edge: 'after',
      axis: 'inline',
    })
  })

  test('read right to left, a line starts at its right edge, so that side is the start', () => {
    // Aiming at the right of a field in Arabic or Hebrew put the new neighbour on
    // its left: the zones were measured from the left whatever the page read.
    expect(drop({ direction: 'rtl', pointer: { x: 196, y: 20 } })).toMatchObject({
      kind: 'wrap',
      side: 'start',
    })
    expect(drop({ direction: 'rtl', pointer: { x: 4, y: 20 } })).toMatchObject({
      kind: 'wrap',
      side: 'end',
    })
  })

  test('and in a row read right to left, the right half is before', () => {
    // The sibling before a field in a right-to-left row is the one to its right.
    expect(drop({ direction: 'rtl', sideBySide: true, pointer: { x: 196, y: 20 } })).toMatchObject(
      { kind: 'move', edge: 'before', axis: 'inline' },
    )
    expect(drop({ direction: 'rtl', sideBySide: true, pointer: { x: 4, y: 20 } })).toMatchObject({
      kind: 'move',
      edge: 'after',
      axis: 'inline',
    })
  })

  test('and names its axis, so the indicator is drawn where the node will land', () => {
    // Left to the stylesheet to infer once, and a rule of equal weight drew the
    // line across the top of a field that was about to land beside another.
    expect(drop({})).toMatchObject({ axis: 'block' })
    expect(drop({ sideBySide: true })).toMatchObject({ axis: 'inline' })
  })

  test('offers nothing over the node being dragged', () => {
    // Refused here rather than by the session, so no indicator ever promises a
    // drop that would snap back with no explanation.
    expect(drop({ dragged: [0], over: [0], pointer: { x: 4, y: 20 } })).toBeUndefined()
    expect(drop({ dragged: [0], over: [0], pointer: { x: 100, y: 10 } })).toBeUndefined()
  })

  test('and nothing that would put a container inside itself', () => {
    const nested: FormSchema = {
      ...document_,
      layouts: [
        {
          name: 'default',
          nodes: [
            { kind: 'row', children: [{ kind: 'field', path: 'first' }] },
            { kind: 'field', path: 'email' },
          ],
        },
      ],
    } as unknown as FormSchema

    // The row is [0]; the field inside it is [0, 0]. Either direction is a
    // container swallowing itself.
    expect(arrangeDrop({
      document: nested,
      layout: 'default',
      dragged: [0],
      over: [0, 0],
      box: wide,
      pointer: { x: 4, y: 20 },
      sideBySide: false,
      direction: 'ltr',
    })).toBeUndefined()
  })
})

describe('a drag over the space between two nodes', () => {
  /**
   * The pointer is over a container and none of its children: the gap between two
   * fields, which the browser reports as the container itself. That used to be aimed
   * at the container, so a field dropped between two others inside a section landed
   * above or below the whole section; between two top-level fields, where nothing on
   * screen carries a layout path, no drop was offered at all.
   */
  const at = (top: number, bottom: number, left = 0, right = 200): Box => ({
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  })

  /** The three top-level fields, stacked with a 20-pixel gap between each. */
  const stacked: DrawnNode[] = [
    { path: [0], box: at(0, 40) },
    { path: [1], box: at(60, 100) },
    { path: [2], box: at(120, 160) },
  ]

  /** What `arrangeDrop` makes of the neighbour, the way both surfaces ask it. */
  const dropBetween = (pointer: { x: number; y: number }, children = stacked, sideBySide = false) => {
    const neighbour = gapNeighbour([], children, pointer)
    return neighbour === undefined
      ? undefined
      : arrangeDrop({
          document: document_,
          layout: 'default',
          dragged: [2],
          over: neighbour.path,
          box: neighbour.box,
          pointer,
          sideBySide,
          direction: 'ltr',
        })
  }

  test('lands between the two, whichever of them the pointer is nearer', () => {
    // Just below the first field and just above the second are one place: the
    // gap between them. Both must say so, or the line jumps as the pointer
    // crosses the middle of a gap it never left.
    const between = { kind: 'move', location: { layout: 'default', parent: [], index: 1 } }

    expect(dropBetween({ x: 100, y: 45 })).toMatchObject({ ...between, edge: 'after' })
    expect(dropBetween({ x: 100, y: 55 })).toMatchObject({ ...between, edge: 'before' })
    expect(gapNeighbour([], stacked, { x: 100, y: 45 })?.path).toEqual([0])
    expect(gapNeighbour([], stacked, { x: 100, y: 55 })?.path).toEqual([1])
  })

  test('never makes a row, even where a side zone would be', () => {
    // A side zone is part of the element. Four pixels from the left of a gap is
    // still the gap, and reading it as the side of the field above built a row
    // out of a drop aimed between two fields.
    expect(dropBetween({ x: 4, y: 50 })).toMatchObject({ kind: 'move' })
    expect(dropBetween({ x: 196, y: 50 })).toMatchObject({ kind: 'move' })
  })

  test('is not a gap on a child, or outside the children altogether', () => {
    // On a child, that child is aimed at the ordinary way. Above the first child
    // is a container's own heading, and aiming there still means the container.
    expect(gapNeighbour([], stacked, { x: 100, y: 20 })).toBeUndefined()
    expect(gapNeighbour([], stacked, { x: 100, y: -10 })).toBeUndefined()
    expect(gapNeighbour([], stacked, { x: 100, y: 170 })).toBeUndefined()
    expect(gapNeighbour([], stacked, { x: 210, y: 50 })).toBeUndefined()
    expect(gapNeighbour([], [], { x: 100, y: 50 })).toBeUndefined()
  })

  test('side by side, the gap runs across and its halves are before and after', () => {
    const inRow: DrawnNode[] = [
      { path: [0], box: at(0, 40, 0, 100) },
      { path: [1], box: at(0, 40, 120, 220) },
    ]

    expect(gapNeighbour([], inRow, { x: 105, y: 20 })?.path).toEqual([0])
    expect(dropBetween({ x: 105, y: 20 }, inRow, true)).toMatchObject({
      kind: 'move',
      edge: 'after',
      axis: 'inline',
      location: { parent: [], index: 1 },
    })
  })

  test('read right to left, the gap after a field is on its left', () => {
    // The first field is on the right. A pointer just to its left is after it,
    // measured from the side a line starts on, which is the right.
    const rightToLeft: DrawnNode[] = [
      { path: [0], box: at(0, 40, 120, 220) },
      { path: [1], box: at(0, 40, 0, 100) },
    ]
    const neighbour = gapNeighbour([], rightToLeft, { x: 115, y: 20 })

    expect(neighbour?.path).toEqual([0])
    expect(
      arrangeDrop({
        document: document_,
        layout: 'default',
        dragged: [2],
        over: [0],
        box: rightToLeft[0]!.box,
        pointer: { x: 115, y: 20 },
        sideBySide: true,
        direction: 'rtl',
      }),
    ).toMatchObject({ kind: 'move', edge: 'after', location: { parent: [], index: 1 } })
  })

  test("only the container's own children are its neighbours", () => {
    // A surface hands over everything drawn where the pointer is. Inside a section at
    // [0], its fields are [0, 0] and [0, 1]; the section itself and a field in a row
    // inside it are not between them, and a top-level node is in another container.
    const inSection: DrawnNode[] = [
      { path: [0], box: at(0, 200) },
      { path: [0, 0], box: at(40, 80) },
      { path: [0, 1], box: at(100, 140) },
      { path: [0, 1, 0], box: at(100, 140, 0, 100) },
      { path: [1], box: at(220, 260) },
    ]

    expect(gapNeighbour([0], inSection, { x: 100, y: 95 })?.path).toEqual([0, 1])
    expect(gapNeighbour([0], inSection, { x: 100, y: 85 })?.path).toEqual([0, 0])
    expect(gapNeighbour([0], inSection, { x: 100, y: 180 })).toBeUndefined()
  })

  test('a node that is not drawn stretches nothing', () => {
    // A hidden tab's panel reports a zero box at the origin. Counted, it pulled the
    // children's extent up over the container's heading, and a pointer there was
    // read as a gap.
    const belowAHeading: DrawnNode[] = [
      { path: [0], box: at(0, 0, 0, 0) },
      { path: [1], box: at(100, 140) },
      { path: [2], box: at(160, 200) },
    ]

    expect(gapNeighbour([], belowAHeading, { x: 100, y: 50 })).toBeUndefined()
    expect(gapNeighbour([], belowAHeading, { x: 100, y: 150 })?.path).toEqual([1])
  })

  test('a node drawn twice means two drawings of the form, and between them is no gap', () => {
    // The playground draws one document in React and in Angular, side by side, and
    // one surface holds both. Between the two panes every top-level node is found
    // twice, and the nearest of them belongs to whichever pane is closer.
    const twoPanes: DrawnNode[] = [
      { path: [0], box: at(0, 40, 0, 200) },
      { path: [1], box: at(60, 100, 0, 200) },
      { path: [0], box: at(0, 40, 300, 500) },
      { path: [1], box: at(60, 100, 300, 500) },
    ]

    expect(gapNeighbour([], twoPanes, { x: 250, y: 20 })).toBeUndefined()
  })
})
