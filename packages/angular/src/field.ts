import { DestroyRef, inject, signal } from '@angular/core'
import type { Signal } from '@angular/core'
import { parsePath } from '@formancy/core'
import type { FieldSnapshot, Path } from '@formancy/core'
import { injectEngine } from './provide.js'

export interface FieldBinding {
  /** The live field state. One signal per field: a keystroke elsewhere never
   *  recomputes this, because the engine wakes only the fields it touched. */
  snapshot: Signal<FieldSnapshot>
  setValue(value: unknown): void
  touch(): void
}

/**
 * One field's live state as a signal — the Angular half of the same protocol
 * React binds with useSyncExternalStore. The engine's snapshots are
 * identity-stable, so `set` is a real change exactly when the field changed,
 * which is what zoneless OnPush change detection needs: no zone, no
 * ChangeDetectorRef, no whole-form re-render.
 *
 * Call from an injection context (field member initialiser or constructor).
 */
export function injectField(path: string | Path): FieldBinding {
  const engine = injectEngine()
  const parsed = typeof path === 'string' ? parsePath(path) : path

  const snapshot = signal(engine.getFieldSnapshot(parsed))
  const unsubscribe = engine.subscribeField(parsed, () => {
    snapshot.set(engine.getFieldSnapshot(parsed))
  })
  inject(DestroyRef).onDestroy(unsubscribe)

  return {
    snapshot: snapshot.asReadonly(),
    setValue: (value) => engine.setValue(parsed, value),
    touch: () => engine.touch(parsed),
  }
}
