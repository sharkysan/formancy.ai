import { encloses as layoutEncloses, samePath } from './layout.js'
import { layoutDropLocation } from './layout-drop.js'
import type { LayoutLocation } from './layout.js'
import type { FormSchema } from '@formancy/spec'

/**
 * A rectangle on screen, as plain numbers.
 *
 * `DOMRect`-shaped and deliberately not a `DOMRect`: this package compiles with
 * no DOM library ([0008](../../../docs/decisions/0008-layered-packages.md)), and
 * the caller already has the rectangle. Structural rather than nominal, so
 * passing a real `DOMRect` works without a cast.
 */
export interface Box {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

/**
 * What a drop would do: move the dragged node, or put it in a new row beside
 * the node it was dropped on.
 */
export type ArrangeDrop =
  | {
      readonly kind: 'move'
      readonly location: LayoutLocation
      readonly edge: 'before' | 'after'
      /** Which way the siblings run, so the indicator is drawn on the side the drop lands. */
      readonly axis: 'block' | 'inline'
    }
  | { readonly kind: 'wrap'; readonly side: 'start' | 'end'; readonly over: readonly number[] }

/**
 * How wide an element has to be before its sides are worth aiming at.
 *
 * A side zone on a narrow control is one nobody can hit, and the whole element
 * would be side zones with no middle left to aim at.
 *
 * The comment this inherited also claimed it was what kept a **zero-sized**
 * element from being treated as all edge. It is not: with a width of zero the
 * zone is zero too, and neither `<` nor `>` holds at the edges, so the drop is a
 * move whatever this constant says. Measured by removing the check and watching
 * the zero-size case stay green. Said here because that element is every element
 * under jsdom, and believing the wrong guard protects it is how the real one gets
 * removed as redundant.
 */
export const SIDE_ZONE_MINIMUM = 80

/**
 * A quarter of the element, capped: a very wide field should not have a
 * 500-pixel side zone swallowing its middle.
 */
const SIDE_ZONE_MAXIMUM = 64

/**
 * Where a drag over the rendered form would land, decided from geometry and the
 * document alone.
 *
 * Shared by both builders, which is the whole reason it is here rather than in
 * the React package where it was written: the rendered form is a drop target in
 * each of them, going through the same session commands, and two implementations
 * of *where a drop lands* would be two answers to a question the user asks by
 * pointing at one place ([0050](../../../docs/decisions/0050-arrange-in-two-places.md)
 * is why the surface exists at all,
 * [0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md) is why it
 * is not duplicated).
 *
 * Returns undefined when no drop should be offered. Refused here rather than by
 * the session, so an indicator never promises a move that would snap back with
 * no explanation.
 */
export function arrangeDrop(input: {
  document: FormSchema
  layout: string
  /** Layout path of the node being dragged. */
  dragged: readonly number[]
  /** Layout path of the node under the pointer. */
  over: readonly number[]
  box: Box
  pointer: { readonly x: number; readonly y: number }
  /**
   * Whether the node under the pointer already sits side by side with its
   * siblings — a child of a row, or of a table.
   *
   * Asked of the caller rather than derived from the document, because it is a
   * fact about what the renderer DID: a layout node can be laid out side by side
   * by a container this function would have to re-implement the renderer to
   * predict.
   */
  sideBySide: boolean
}): ArrangeDrop | undefined {
  const { document, layout, dragged, over, box, pointer, sideBySide } = input

  // ── Making a row, by aiming at a side ──────────────────────────────────────
  //
  // Only for something NOT already side by side with its siblings. There, left
  // and right already mean "before" and "after", and giving them a second
  // meaning would make the commonest drag in a row ambiguous.
  if (!sideBySide && box.width >= SIDE_ZONE_MINIMUM) {
    const zone = Math.min(box.width / 4, SIDE_ZONE_MAXIMUM)
    const side =
      pointer.x < box.left + zone
        ? 'start'
        : pointer.x > box.right - zone
          ? 'end'
          : undefined

    if (side !== undefined) {
      if (samePath(dragged, over)) return undefined
      if (layoutEncloses(dragged, over) || layoutEncloses(over, dragged)) return undefined
      return { kind: 'wrap', side, over }
    }
  }

  // ── Moving ─────────────────────────────────────────────────────────────────
  //
  // Horizontal for a node already inside a row: the two halves a person aims at
  // there are left and right, not top and bottom.
  const edge = sideBySide
    ? pointer.x < box.left + box.width / 2
      ? 'before'
      : 'after'
    : pointer.y < box.top + box.height / 2
      ? 'before'
      : 'after'

  const location = layoutDropLocation(document, layout, dragged, over, edge)
  return location === undefined
    ? undefined
    : { kind: 'move', location, edge, axis: sideBySide ? 'inline' : 'block' }
}
