import { formatPath } from './path.js'
import type { Path } from './path.js'
import { getAt, setAt } from './value.js'

/**
 * The transactional value store underneath the engine.
 *
 * Writes commit either singly or as one transaction; subscribers hear exactly
 * one notification per commit, carrying the set of written wire paths. Field
 * subscribers are checked by value identity instead — structural sharing makes
 * `getAt` identity comparison exactly "did my value change", which is how a
 * keystroke on a five-thousand-field form wakes only the fields it touched.
 *
 * A failed transaction body rolls the store back and notifies nobody: partial
 * form state is worse than no write, because downstream computed values would
 * observe a state the user never produced.
 */
export interface ValueStore {
  root(): unknown
  get(path: Path): unknown
  set(path: Path, value: unknown): void
  transact(body: () => void): void
  subscribe(listener: (changedPaths: ReadonlySet<string>) => void): () => void
  subscribeField(path: Path, listener: () => void): () => void
  /** Monotonic commit counter — the tearing guard for useSyncExternalStore. */
  version(): number
}

interface FieldSubscription {
  path: Path
  lastSeen: unknown
  listener: () => void
}

export function createValueStore(initial: unknown): ValueStore {
  let root: unknown = initial
  let commitCount = 0

  let transactionDepth = 0
  let rootBeforeTransaction: unknown
  let writtenInTransaction: Set<string> | null = null

  const listeners = new Set<(changedPaths: ReadonlySet<string>) => void>()
  const fieldSubscriptions = new Set<FieldSubscription>()

  function commit(written: ReadonlySet<string>, before: unknown): void {
    if (root === before) return
    commitCount++

    // Iterate over copies: a listener that subscribes or unsubscribes during
    // notification must not affect this commit's delivery.
    for (const listener of [...listeners]) listener(written)
    for (const field of [...fieldSubscriptions]) {
      const current = getAt(root, field.path)
      if (!Object.is(current, field.lastSeen)) {
        field.lastSeen = current
        field.listener()
      }
    }
  }

  return {
    root: () => root,
    get: (path) => getAt(root, path),
    version: () => commitCount,

    set(path, value) {
      const next = setAt(root, path, value)
      if (next === root) return

      if (transactionDepth > 0) {
        root = next
        writtenInTransaction!.add(formatPath(path))
        return
      }

      const before = root
      root = next
      commit(new Set([formatPath(path)]), before)
    },

    transact(body) {
      if (transactionDepth > 0) {
        // A nested transact joins the outer transaction; its writes commit,
        // and its failures roll back, with the outermost one.
        body()
        return
      }

      transactionDepth = 1
      rootBeforeTransaction = root
      writtenInTransaction = new Set()

      let written: Set<string>
      const before = rootBeforeTransaction
      try {
        body()
      } catch (error) {
        root = rootBeforeTransaction
        throw error
      } finally {
        written = writtenInTransaction
        transactionDepth = 0
        rootBeforeTransaction = undefined
        writtenInTransaction = null
      }

      commit(written, before)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    subscribeField(path, listener) {
      const subscription: FieldSubscription = { path, lastSeen: getAt(root, path), listener }
      fieldSubscriptions.add(subscription)
      return () => fieldSubscriptions.delete(subscription)
    },
  }
}
