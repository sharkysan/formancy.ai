import { formatPath } from './path.js'
import type { Path } from './path.js'

/**
 * Reads and path-based structural-sharing writes over the submission value
 * tree.
 *
 * setAt clones only the spine from the root to the written leaf; every subtree
 * off that spine keeps its identity. Downstream, "did this field change" is a
 * reference comparison, which is what keeps change detection O(changed paths)
 * on a five-thousand-field form. Hand-rolled rather than Immer for the same
 * reason: this is the hot path, and it is sixty lines.
 *
 * Both read only what a value holds as its OWN: `constructor` is a key an author
 * may choose, and read through inheritance an unanswered one held `function
 * Object` and counted as answered (0185). And a key only out of an object, an
 * index only out of a list, as `write` writes them: a list's own `length` is no
 * answer to a field keyed `length`.
 */
export function getAt(root: unknown, path: Path): unknown {
  let current = root
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = ownAt(current, segment)
  }
  return current
}

/* What a container holds at a segment, never what it inherits there, nor a key a list has. */
function ownAt(container: object, segment: string | number): unknown {
  if (Array.isArray(container) !== (typeof segment === 'number')) return undefined
  return Object.hasOwn(container, segment) ? (container as Record<string | number, unknown>)[segment] : undefined
}

export function setAt(root: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value

  // A write that changes nothing returns the same root, so subscribers are
  // never notified for a keystroke that re-asserts the current value.
  if (Object.is(getAt(root, path), value)) return root

  return write(root, path, 0, value)
}

function write(container: unknown, path: Path, depth: number, value: unknown): unknown {
  const segment = path[depth]!
  const isLeaf = depth === path.length - 1

  if (typeof segment === 'number') {
    // A numeric segment means an array, whatever was there before: writing
    // rows[0] into a slot that held a scalar replaces it with a fresh array.
    const next = Array.isArray(container) ? container.slice() : []
    return own(next, segment, isLeaf ? value : write(ownAt(next, segment), path, depth + 1, value))
  }

  const isPlainObject = container !== null && typeof container === 'object' && !Array.isArray(container)
  const next: Record<string, unknown> = isPlainObject ? { ...(container as Record<string, unknown>) } : {}
  return own(next, segment, isLeaf ? value : write(ownAt(next, segment), path, depth + 1, value))
}

/*
 * `copy` holding `value` at `segment` as its own member: defined, not assigned, so
 * that no key reaches a setter the copy inherits. Assigned, `__proto__` replaced the
 * copy's prototype and dropped the answer; parsePath refuses that key, but a Path
 * reaches setAt without it (0185). On a list it is an index, as an assignment is.
 */
function own<T extends object>(copy: T, segment: string | number, value: unknown): T {
  return Object.defineProperty(copy, segment, { value, writable: true, enumerable: true, configurable: true })
}

/**
 * Repeating-group row operations. All three go through setAt, so they inherit
 * spine cloning and structural sharing; rows themselves are never cloned,
 * which is why renderers can key rows by identity across reorders.
 *
 * Out-of-range indices throw rather than silently producing sparse arrays: a
 * bad index here is always an engine or caller bug, and a sparse row array
 * would serialise nulls into the submission.
 */
export function arrayInsert(root: unknown, path: Path, index: number, value: unknown): unknown {
  const existing = getAt(root, path)
  const rows = existing === undefined ? [] : asArray(existing, path)
  assertInRange(index, rows.length + 1, 'insert')
  const next = rows.slice()
  next.splice(index, 0, value)
  return setAt(root, path, next)
}

export function arrayRemove(root: unknown, path: Path, index: number): unknown {
  const rows = asArray(getAt(root, path), path)
  assertInRange(index, rows.length, 'remove')
  const next = rows.slice()
  next.splice(index, 1)
  return setAt(root, path, next)
}

export function arrayMove(root: unknown, path: Path, from: number, to: number): unknown {
  const rows = asArray(getAt(root, path), path)
  assertInRange(from, rows.length, 'move from')
  assertInRange(to, rows.length, 'move to')
  if (from === to) return root
  const next = rows.slice()
  const [row] = next.splice(from, 1)
  next.splice(to, 0, row)
  return setAt(root, path, next)
}

function asArray(value: unknown, path: Path): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected an array at "${formatPath(path)}", found ${value === null ? 'null' : typeof value}`)
  }
  return value
}

function assertInRange(index: number, bound: number, operation: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= bound) {
    throw new RangeError(`Cannot ${operation} at index ${index}: valid range is 0..${bound - 1}`)
  }
}
