import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { BuilderSession, Location } from '@formancy/builder-core'
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

/**
 * The builder session as a React value.
 *
 * `revision()` is the whole subscription: the session increments it once per
 * accepted command, undo or redo, so a number comparison is enough and there
 * is no need to diff documents. `getSnapshot` must return something stable
 * between changes or useSyncExternalStore loops, which is why the view is
 * memoised on the revision rather than rebuilt per render.
 */
/** Two key paths share a parent when everything but the last key matches. */
function sameParent(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.slice(0, -1).every((key, at) => key === b[at])
}

export function useBuilder(session: BuilderSession): BuilderView {
  const subscribe = useCallback(
    (onChange: () => void) => session.subscribe(onChange),
    [session],
  )
  const revision = useSyncExternalStore(
    subscribe,
    () => session.revision(),
    () => session.revision(),
  )

  return useMemo(() => {
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
          // No `moving` argument: nothing is being lifted out, so every
          // existing field is a real neighbour.
          .map((location) => ({ location, label: describeTarget(document, location) })),
      moveTargetsFor: (keyPath) => {
        // Where the field already is. builder-core offers it because it is a
        // legal destination, which is true and useless: a list whose first
        // entry does nothing makes the person read it to find that out.
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
              !(sameParent([...location.parent, 'x'], [...parent, 'x']) &&
                location.index === currentIndex),
          )
          .map((location) => ({ location, label: describeTarget(document, location, keyPath) }))
      },
    }
    // revision is the dependency that matters; session is stable for its life.
  }, [session, revision])
}
