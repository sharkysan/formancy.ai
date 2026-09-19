import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { formatPath, parsePath } from '@formancy/core'
import type { FieldSnapshot, Path } from '@formancy/core'
import { useFormEngine } from './context.js'

export interface FieldBinding extends FieldSnapshot {
  setValue(value: unknown): void
  touch(): void
}

/**
 * One field's live state, re-rendering exactly when that field's snapshot
 * changes and never for its siblings.
 *
 * useSyncExternalStore is the honest way to bind an external store in React:
 * the engine's snapshots are identity-stable, so getSnapshot needs no
 * memoisation and concurrent rendering gets a consistent tearing guard for
 * free. The third argument makes SSR render from the same snapshot the client
 * will hydrate with — ids are deterministic, so markup matches.
 */
export function useField(path: string | Path): FieldBinding {
  const engine = useFormEngine()

  const wire = typeof path === 'string' ? path : formatPath(path)
  const parsed = useMemo(() => parsePath(wire), [wire])

  const subscribe = useCallback(
    (onChange: () => void) => engine.subscribeField(parsed, onChange),
    [engine, parsed],
  )
  const getSnapshot = useCallback(() => engine.getFieldSnapshot(parsed), [engine, parsed])

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setValue = useCallback((value: unknown) => engine.setValue(parsed, value), [engine, parsed])
  const touch = useCallback(() => engine.touch(parsed), [engine, parsed])

  return useMemo(() => ({ ...snapshot, setValue, touch }), [snapshot, setValue, touch])
}
