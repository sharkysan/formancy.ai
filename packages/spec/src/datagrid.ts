import type { DataGridColumn, FieldDef } from './types.js'

/**
 * Which columns a `widget: "datagrid"` repeater shows, and in what order.
 *
 * It sits in the spec package rather than in each renderer for the reason
 * `narrowOptionsByLabel` does: a grid that put the columns in one order in React
 * and another in Angular would be two different forms from one document, and
 * nothing would fail — each renderer's tests would be green against its own
 * ordering.
 *
 * Two things it reconciles, and both were measured rather than assumed.
 *
 * **A column names a direct child; the renderers place leaves.** `validateSchema`
 * builds the allowed set from `field.fields`, so a column may only name a child of
 * the repeater. A renderer, though, is handed the row's *leaves*, because a `group`
 * child is flattened into the fields inside it. So a column's cell holds every leaf
 * whose first segment inside the row is that key — one control for a plain child,
 * and the whole group for a grouped one.
 *
 * **A child no column names still gets a column.** `columns` orders and sizes what
 * is there; it does not choose what is there
 * ([0066](../../../docs/decisions/0066-a-widget-may-be-configured.md) puts it as "a
 * column list is an ordering, not a choice of which answers to keep"). A child left
 * out of the grid would be an answer nobody can give, which is the failure
 * `unreferencedPaths` exists for. Unnamed children are appended in declaration
 * order, after every configured column.
 */
export interface DataGridColumnPlan {
  /** The child field's key, which is also the column's identity. */
  key: string
  /** The column entry that configured it, or `undefined` for an appended child. */
  column: DataGridColumn | undefined
  /** The child field itself, or `undefined` if a column names one that is gone. */
  child: FieldDef | undefined
}

export function datagridColumns(
  def: FieldDef | undefined,
  columns: readonly DataGridColumn[],
): readonly DataGridColumnPlan[] {
  const children = def?.fields ?? []
  const named = new Set(columns.map((column) => column.field))
  return [
    ...columns.map((column) => ({
      key: column.field,
      column,
      child: children.find((candidate) => candidate.key === column.field),
    })),
    ...children
      .filter((child) => !named.has(child.key))
      .map((child) => ({ key: child.key, column: undefined, child })),
  ]
}

/**
 * The leaves inside one row that belong to one column.
 *
 * Matched on a segment boundary and never with a bare `startsWith`: a child called
 * `name` must not swallow `nameOnCard`, and a grouped child owns everything beneath
 * it. The renderers share this for the same reason they share the plan above.
 */
export function belongsToColumn(leaf: string, rowPrefix: string, key: string): boolean {
  const prefix = `${rowPrefix}.${key}`
  return leaf === prefix || leaf.startsWith(`${prefix}.`) || leaf.startsWith(`${prefix}[`)
}
