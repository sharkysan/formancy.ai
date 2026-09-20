import { layoutChildrenAt, layoutEncloses } from '@formancy/builder-core'
import type { LayoutLocation } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'

/**
 * Turning "dropped above this row" into a `LayoutLocation`.
 *
 * The same off-by-one as the model's version in `drop.ts`, and only that one:
 * a move index counts positions in the container AFTER the dragged node has
 * been lifted out, so computing it against the list as it stands is wrong for
 * every downward move within a container — the most common drag there is.
 *
 * The container path is NOT corrected here. `LayoutLocation.parent` addresses
 * the document the caller is looking at, and the session applies the lift
 * once, on the inside. Correcting it here too was a real bug: both shifts
 * applied, the node landed in a neighbouring container, and the document
 * stayed valid — so nothing complained.
 *
 * Returns undefined when the drop should not be offered at all: onto itself,
 * into its own subtree, or somewhere that would not move it. Refusing here
 * rather than letting the session refuse afterwards is what stops a row
 * snapping back with no explanation.
 */
export function layoutDropLocation(
  schema: FormSchema,
  layout: string,
  dragged: readonly number[],
  over: readonly number[],
  edge: 'before' | 'after',
): LayoutLocation | undefined {
  if (samePath(dragged, over)) return undefined
  // A container cannot be moved inside itself or its own descendants.
  if (layoutEncloses(dragged, over)) return undefined

  const parent = over.slice(0, -1)
  const siblings = layoutChildrenAt(schema, layout, parent)
  if (siblings === undefined) return undefined

  const overIndex = over[over.length - 1]!
  if (overIndex >= siblings.length) return undefined

  const fromSameContainer = samePath(dragged.slice(0, -1), parent)
  const draggedIndex = dragged[dragged.length - 1]!

  let index = edge === 'before' ? overIndex : overIndex + 1

  // Lift the dragged node out first. Everything below it in ITS container
  // shifts up by one.
  if (fromSameContainer && draggedIndex < index) index -= 1

  // A drop that leaves the node exactly where it is would push a no-op onto
  // the undo stack and announce a move that did not happen.
  if (fromSameContainer && index === draggedIndex) return undefined

  return { layout, parent, index }
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, at) => b[at] === step)
}
