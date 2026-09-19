import type { Path } from './path.js'
import { getAt, setAt } from './value.js'

/**
 * Remove the values at the given paths, structurally sharing everything else.
 *
 * This is the enforcement half of clearOnHide: the server evaluates visibility
 * itself and strips whatever ITS evaluation says is hidden, so a client cannot
 * smuggle data into a hidden branch by lying about what was visible.
 *
 * Object keys are deleted outright — a hidden field must leave no trace in the
 * stored submission, and `key in data` must say no. An array slot is nulled
 * rather than spliced, because splicing would shift sibling rows into
 * different identities and silently reattach their data to other rows.
 */
export function stripPaths(root: unknown, paths: readonly Path[]): unknown {
  let current = root
  for (const path of paths) current = stripOne(current, path)
  return current
}

function stripOne(root: unknown, path: Path): unknown {
  if (path.length === 0) return root

  const parentPath = path.slice(0, -1)
  const target = path[path.length - 1]!
  const parent = getAt(root, parentPath)

  if (typeof target === 'number') {
    if (!Array.isArray(parent) || target >= parent.length || parent[target] === null) return root
    return setAt(root, path, null)
  }

  if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) return root
  if (!(target in parent)) return root

  const { [target]: _removed, ...remaining } = parent as Record<string, unknown>
  return setAt(root, parentPath, remaining)
}
