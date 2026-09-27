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
  /** Move a row. The keyboard route to reordering; a drag is a second route to this. */
  moveRow(from: number, to: number): void
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
  const moveRow = useCallback(
    (from: number, to: number) => engine.moveRow(parsed, from, to),
    [engine, parsed],
  )

  // Subscribed, not derived from rowCount.
  //
  // This read `useMemo(..., [rowCount])`, on the reasoning that "the engine mints an id
  // when a row is created, so the count changing is exactly when the ids change". That
  // was true until rows could be REORDERED: a move leaves the count alone and changes
  // the order, so the memo held stale ids and React would key rows by them -- reusing
  // the wrong DOM nodes, which is the exact failure keying by identity exists to
  // prevent, and worse than keying by index because it looks correct.
  //
  // Joined into one string for the snapshot because `useSyncExternalStore` compares by
  // identity and a fresh array every read would loop for ever.
  const getRowIdList = useCallback(
    () => Array.from({ length: engine.rowCount(parsed) }, (_, index) => engine.rowId(parsed, index)).join(' '),
    [engine, parsed],
  )
  const rowIdList = useSyncExternalStore(subscribe, getRowIdList, getRowIdList)
  const rowIds = useMemo(() => (rowIdList === '' ? [] : rowIdList.split(' ')), [rowIdList])

  return useMemo(
    () => ({ rowCount, rowIds, addRow, removeRow, moveRow }),
    [rowCount, rowIds, addRow, removeRow, moveRow],
  )
}
