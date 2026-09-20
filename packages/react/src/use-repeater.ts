import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { formatPath, parsePath } from '@formancy/core'
import type { Path } from '@formancy/core'
import { useFormEngine } from './context.js'

export interface RepeaterBinding {
  rowCount: number
  /** Stable per-row keys, in row order. Never key a row by its index. */
  rowIds: readonly string[]
  addRow(): void
  removeRow(index: number): void
}

/**
 * A repeater's live row list. Renders exactly when rows are added, removed or
 * edited — the engine treats the repeater path as subscribable in its own
 * right, so this hook needs no polling and no array identity tricks.
 */
export function useRepeater(path: string | Path): RepeaterBinding {
  const engine = useFormEngine()

  const wire = typeof path === 'string' ? path : formatPath(path)
  const parsed = useMemo(() => parsePath(wire), [wire])

  const subscribe = useCallback(
    (onChange: () => void) => engine.subscribeField(parsed, onChange),
    [engine, parsed],
  )
  const getRowCount = useCallback(() => engine.rowCount(parsed), [engine, parsed])
  const rowCount = useSyncExternalStore(subscribe, getRowCount, getRowCount)

  const addRow = useCallback(() => engine.addRow(parsed), [engine, parsed])
  const removeRow = useCallback((index: number) => engine.removeRow(parsed, index), [engine, parsed])

  // Derived from rowCount rather than subscribed separately: the engine mints
  // an id when a row is created, so the count changing is exactly when the ids
  // change.
  const rowIds = useMemo(
    () => Array.from({ length: rowCount }, (_, index) => engine.rowId(parsed, index)),
    [engine, parsed, rowCount],
  )

  return useMemo(
    () => ({ rowCount, rowIds, addRow, removeRow }),
    [rowCount, rowIds, addRow, removeRow],
  )
}
