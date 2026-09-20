import type { Location } from '@formancy/builder-core'
import type { FieldDef, FormSchema } from '@formancy/spec'

/**
 * Turning "dropped above this field" into a `Location`.
 *
 * The subtlety is the same one that made the keyboard palette describe the
 * wrong neighbours: a move index counts positions in the container AFTER the
 * dragged field has been lifted out. Computing it against the list as it
 * stands is off by one for every downward move within a container — which is
 * the most common drag there is, and the error puts the field one place past
 * where the person pointed.
 *
 * Returns undefined when the drop should not be offered at all: onto itself,
 * into its own subtree, or somewhere that would not move it. Refusing here
 * rather than letting the session refuse afterwards is what stops a field
 * snapping back with no explanation.
 */
export function dropLocation(
  schema: FormSchema,
  dragged: readonly string[],
  over: readonly string[],
  edge: 'before' | 'after',
): Location | undefined {
  if (samePath(dragged, over)) return undefined
  // A container cannot be moved inside itself or its own descendants.
  if (isPrefix(dragged, over)) return undefined

  const parent = over.slice(0, -1)
  const siblings = childrenAt(schema, parent)
  const overKey = over[over.length - 1]
  const overIndex = siblings.findIndex((field) => field.key === overKey)
  if (overIndex === -1) return undefined

  const draggedKey = dragged[dragged.length - 1]
  const fromSameContainer = samePath(dragged.slice(0, -1), parent)
  const draggedIndex = fromSameContainer
    ? siblings.findIndex((field) => field.key === draggedKey)
    : -1

  let index = edge === 'before' ? overIndex : overIndex + 1

  // Lift the dragged field out first. Everything below it shifts up by one.
  if (fromSameContainer && draggedIndex !== -1 && draggedIndex < index) index -= 1

  // A drop that leaves the field exactly where it is would push a no-op onto
  // the undo stack and announce a move that did not happen.
  if (fromSameContainer && index === draggedIndex) return undefined

  return { parent, index }
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, at) => key === b[at])
}

/** Whether `maybeParent` is `path` itself or an ancestor of it. */
function isPrefix(maybeParent: readonly string[], path: readonly string[]): boolean {
  if (maybeParent.length > path.length) return false
  return maybeParent.every((key, at) => key === path[at])
}

function childrenAt(schema: FormSchema, parent: readonly string[]): readonly FieldDef[] {
  let fields: readonly FieldDef[] = schema.model.fields
  for (const key of parent) {
    const found = fields.find((field) => field.key === key)
    if (found === undefined) return []
    fields = found.fields ?? []
  }
  return fields
}
