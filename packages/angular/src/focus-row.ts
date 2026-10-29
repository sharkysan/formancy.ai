import { focusControl } from './focus-control.js'

/**
 * Where focus goes once a person adds, removes or moves a row (0219): a row by its position, at
 * the first of `parts` it draws, else at its first control; or the repeater's Add button. Both
 * renderers decide the same targets, and `row-focus.test` holds each to them by name.
 */
export type RowFocus = { readonly row: number; readonly parts: readonly string[] } | 'add'

/**
 * Focus `target` inside `repeater`, drawn after the change. Rows are found by position because a
 * row's controls are drawn anew when it moves (0068): the element pressed may be gone, and the
 * row's place is what the person meant.
 */
export function focusRow(repeater: Element, target: RowFocus, add: HTMLElement | null): void {
  if (target === 'add') return focusControl(add)
  const rows = repeater.querySelectorAll<HTMLElement>('[data-formancy-part="row"], [data-formancy-part="datagrid-row"]')
  const row = rows[target.row]
  if (row === undefined) return
  const part = target.parts
    .map((name) => row.querySelector<HTMLElement>(`[data-formancy-part="${name}"]`))
    .find((found) => found !== null)
  // Else what a person can operate first in the row: a field a rule disables is passed over.
  const first = row.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [contenteditable="true"], [tabindex="0"]',
  )
  focusControl(part ?? first)
}
