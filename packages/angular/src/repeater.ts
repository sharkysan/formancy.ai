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
  /** Move a row. The keyboard route to reordering; a drag is a second route to this. */
  moveRow(from: number, to: number): void
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

  // A counter bumped on every notification, not only when the LENGTH changes.
  //
  // `rowCount.set` with an equal value notifies nothing, which is correct and was also
  // why reordering did not redraw: a move leaves the count alone, so the ids computed
  // from it kept their old order and Angular tracked rows by them -- reusing the wrong
  // DOM, which is the failure tracking by identity exists to prevent.
  const version = signal(0)

  const unsubscribe = engine.subscribeField(parsed, () => {
    rowCount.set(engine.rowCount(parsed))
    version.update((previous) => previous + 1)
  })
  inject(DestroyRef).onDestroy(unsubscribe)

  return {
    rowCount: rowCount.asReadonly(),
    // Read through `version` as well as `rowCount`. The comment here used to say the
    // count changing is exactly when the ids change, which was true until rows could be
    // reordered.
    rowIds: computed(() => {
      version()
      return Array.from({ length: rowCount() }, (_, index) => engine.rowId(parsed, index))
    }),
    addRow: () => engine.addRow(parsed),
    removeRow: (index) => engine.removeRow(parsed, index),
    moveRow: (from, to) => engine.moveRow(parsed, from, to),
  }
}
