import type { BuilderSession, Location } from './session.js'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { describeTarget, flatten } from './tree.js'
import type { TreeNode } from './tree.js'

export interface MoveTarget {
  location: Location
  /** What a screen reader reads out. See describeTarget. */
  label: string
}

export interface BuilderView {
  document: FormSchema
  nodes: TreeNode[]
  canUndo: boolean
  canRedo: boolean
  /** The validator's verdict, so a Publish control can explain itself. */
  publishable: { valid: boolean; errors: ReturnType<BuilderSession['canPublish']>['errors'] }
  /** Every legal destination for a field, already described in words. */
  moveTargetsFor(keyPath: readonly string[]): MoveTarget[]
  /** The same, for a field that does not exist yet. */
  insertTargetsFor(def: FieldDef): MoveTarget[]
}

/** Two key paths share a parent when everything but the last key matches. */
function sameParent(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.slice(0, -1).every((key, at) => key === b[at])
}

/**
 * Everything a builder's interface reads off a session, in one plain object.
 *
 * Framework-free on purpose, and it is the piece that decides whether a second
 * builder is a binding or a rewrite. React subscribes to `revision()` with
 * `useSyncExternalStore` and Angular sets a signal from the same callback; what
 * each of them then *shows* is this, computed identically. A destination list
 * that offered different choices in the two builders would be two products.
 *
 * Called fresh per revision rather than memoised here: the session increments
 * `revision()` once per accepted command, so the binding knows exactly when this
 * is stale and there is nothing for this layer to cache.
 */
export function builderView(session: BuilderSession): BuilderView {
  const document = session.document()
  return {
    document,
    nodes: flatten(document),
    canUndo: session.canUndo(),
    canRedo: session.canRedo(),
    publishable: session.canPublish(),
    insertTargetsFor: (def) =>
      session
        .validTargets(def)
        // No `moving` argument: nothing is being lifted out, so every existing
        // field is a real neighbour.
        .map((location) => ({ location, label: describeTarget(document, location) })),
    moveTargetsFor: (keyPath) => {
      // Where the field already is. `builder-core` offers it because it is a
      // legal destination, which is true and useless: a list whose first entry
      // does nothing makes the person read it to find that out.
      const parent = keyPath.slice(0, -1)
      const siblings = flatten(document).filter(
        (node) => node.keyPath.length === keyPath.length && sameParent(node.keyPath, keyPath),
      )
      const currentIndex = siblings.findIndex(
        (node) => node.keyPath[node.keyPath.length - 1] === keyPath[keyPath.length - 1],
      )

      return session
        .validTargets(keyPath)
        .filter(
          (location) =>
            !(
              sameParent([...location.parent, 'x'], [...parent, 'x']) &&
              location.index === currentIndex
            ),
        )
        .map((location) => ({ location, label: describeTarget(document, location, keyPath) }))
    },
  }
}
