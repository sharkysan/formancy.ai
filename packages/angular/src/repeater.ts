import { DestroyRef, computed, inject, signal } from '@angular/core'
import type { Signal } from '@angular/core'
import { parsePath } from '@formancy/core'
import type { Path } from '@formancy/core'
import { injectEngine } from './provide.js'

export interface RepeaterBinding {
  /** The live row list length. The engine treats the repeater path as
   *  subscribable in its own right, so no polling and no array identity tricks. */
  rowCount: Signal<number>
  /** Stable per-row keys, in row order. Never track a row by its index. */
  rowIds: Signal<readonly string[]>
  addRow(): void
  removeRow(index: number): void
}

/**
 * A repeater's live row count as a signal — the Angular half of React's
 * useRepeater. Reading rowCount eagerly doubles as validation: the engine
 * throws on a non-repeater path here, at wiring time, not at first render.
 *
 * Call from an injection context (field member initialiser or constructor).
 */
export function injectRepeater(path: string | Path): RepeaterBinding {
  const engine = injectEngine()
  const parsed = typeof path === 'string' ? parsePath(path) : path

  const rowCount = signal(engine.rowCount(parsed))
  const unsubscribe = engine.subscribeField(parsed, () => {
    rowCount.set(engine.rowCount(parsed))
  })
  inject(DestroyRef).onDestroy(unsubscribe)

  return {
    rowCount: rowCount.asReadonly(),
    // Computed from rowCount: the engine mints an id when a row is created, so
    // the count changing is exactly when the ids change.
    rowIds: computed(() =>
      Array.from({ length: rowCount() }, (_, index) => engine.rowId(parsed, index)),
    ),
    addRow: () => engine.addRow(parsed),
    removeRow: (index) => engine.removeRow(parsed, index),
  }
}
