/**
 * Which model path a read names, from inside a rule on a repeater's row or outside one.
 *
 * One answer for every reader of a rule's reads: the engine's computed order
 * (`computed-order.ts`), the check of a path no field provides (`unknown-paths.ts`) and the
 * checks of a temporal comparison (`temporal-literals.ts`, `temporal-widths.ts`). Apart from the
 * check of unknown paths, where it was written, because every form loads the engine and only an
 * author's tools load that check (0217): imported from there, it took the check into the engine's
 * bundle with it.
 */

/**
 * The row variables a rule inside a repeater sees, which are not fields.
 *
 * `item` stands for the row being evaluated, so `item.qty` is the model's
 * `items[].qty` and has to be rewritten before it can be looked up. `index` is a
 * number and names nothing.
 */
export const ROW_ITEM = 'item'

/** `items[0].qty` and `items[].qty` are the same field; the model writes the second. */
function withoutRowNumbers(path: string): string {
  return path.replaceAll(/\[\d+\]/g, '[]')
}

/**
 * The repeater a row rule belongs to, so `item.x` can be resolved: `items[]` for a rule on
 * `items[].total`, nothing for a rule outside a row.
 *
 * Taken from the TARGET rather than guessed: a rule on `items[].total` is evaluated per row
 * of `items`, and that is the only repeater its `item` can mean. Shared with the check of a
 * temporal literal (0236), so the two cannot resolve one row read differently.
 */
export function rowScopeOf(target: string): string | undefined {
  return target.includes('[]') ? `${target.slice(0, target.indexOf('[]'))}[]` : undefined
}

/**
 * The model path a read names in a rule whose row, if any, is `rowScope`. Outside a row, `item`
 * is a name like any other. Shared by the checks of a temporal comparison (0236, 0238), so they
 * resolve one row read one way, and by the computed order (0240), so the engine does too.
 */
export function inModel(read: string, rowScope: string | undefined): string {
  const path = withoutRowNumbers(read)
  if (rowScope === undefined || (path !== ROW_ITEM && !path.startsWith(`${ROW_ITEM}.`))) return path
  return `${rowScope}${path.slice(ROW_ITEM.length)}`
}
