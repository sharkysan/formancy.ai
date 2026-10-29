import { ROW_ID, ROW_ID_PREFIX } from '@formancy/spec'
import type { FieldDef } from '@formancy/spec'
import { filled } from './defaults.js'
import type { BuiltInErrorCode } from './error-codes.js'
import type { InteractionState } from './interaction.js'
import type { Path } from './path.js'
import type { ValueStore } from './store.js'

/** A repeater as the engine's walk finds it. */
export interface RepeaterNode {
  path: Path
  wire: string
  def: FieldDef
  page: number
}

/**
 * A repeater's rows: who each one is, how many there may be, and the commands that change
 * them.
 *
 * Apart from the engine because this is one reason to change — what a row is, and how the
 * list of them is bounded — and the graph never needs to know it. It left when `engine.ts`
 * had no line to give the bounds.
 *
 * **The bounds are the document's, enforced here and nowhere else.** `addRow` past
 * `maxItems` and `removeRow` below `minItems` are refused, as a row index that is not a row
 * is refused, and `canAdd`/`canRemove` say so first, so both renderers ask one question
 * rather than each comparing a count with a definition — the drift 0023 found when Angular
 * topped rows up in an effect and React did not.
 *
 * **A repeater a computed rule writes has the rule's rows and no others** (0218): none is topped
 * up, added, removed or moved, and `canAdd`/`canRemove` say so. A row that stood there while the
 * expression could not be evaluated was stored as computed, as a value typed into a computed
 * field was (0181).
 */
export interface Rows {
  /** The rows as stored, or none when what is stored is not a list. */
  of(repeater: RepeaterNode): readonly unknown[]
  count(repeater: RepeaterNode): number
  /** Give every row an id, keeping any that arrived with the data (0041) or a rule wrote (0218). */
  adopt(repeater: RepeaterNode): void
  /** Add empty rows up to `minItems`. True when it wrote any. */
  topUp(repeater: RepeaterNode): boolean
  /** Whether `add` would add a row rather than refuse: under `maxItems`, or unbounded. */
  canAdd(repeater: RepeaterNode): boolean
  /** Whether `remove` of a row that exists would remove it: above `minItems`. */
  canRemove(repeater: RepeaterNode): boolean
  add(repeater: RepeaterNode): void
  remove(repeater: RepeaterNode, index: number): void
  move(repeater: RepeaterNode, from: number, to: number): void
  id(repeater: RepeaterNode, index: number): string
}

// The comments on code below are block comments rather than JSDoc: this module is the
// package's own, and nothing outside it reads them.
export function createRows(
  store: ValueStore,
  interaction: InteractionState,
  written: (repeater: RepeaterNode) => boolean,
): Rows {
  /*
   * One counter per repeater, monotonic for the engine's lifetime. It is never
   * decremented on removal, so a deleted row's id is never reissued — a new row
   * wearing a dead row's id would be indistinguishable from it in any export or
   * audit trail that recorded the first.
   *
   * A counter rather than a random id because the engine has no ambient
   * randomness to draw on (see docs/decisions/0019-injected-capabilities.md),
   * and uniqueness is only ever needed within one repeater of one submission.
   */
  const counters = new Map<string, number>()

  function mint(repeater: RepeaterNode): string {
    const next = (counters.get(repeater.wire) ?? 0) + 1
    counters.set(repeater.wire, next)
    return `${ROW_ID_PREFIX}${String(next)}`
  }

  function of(repeater: RepeaterNode): readonly unknown[] {
    const value = store.get(repeater.path)
    return Array.isArray(value) ? value : []
  }

  const count = (repeater: RepeaterNode): number => of(repeater).length
  const canAdd = (repeater: RepeaterNode): boolean =>
    !written(repeater) && (repeater.def.maxItems === undefined || count(repeater) < repeater.def.maxItems)
  const canRemove = (repeater: RepeaterNode): boolean =>
    !written(repeater) && count(repeater) > (repeater.def.minItems ?? 0)

  /*
   * Rewrite the row index in every piece of position-keyed state under one repeater.
   *
   * Touched-ness is the only such state today: errors are recomputed from values, so a
   * row that moved is re-validated where it lands. If a second wire-keyed store is ever
   * added, it belongs here rather than in each caller.
   *
   * `newIndexOf` returns the row's new index, or undefined when the row is gone.
   */
  function remapRowState(repeater: RepeaterNode, newIndexOf: (index: number) => number | undefined): void {
    // `items[3].name` under `items`, and only directly under it: a nested repeater's
    // wires carry their own bracket and are remapped by their own call. The repeater's
    // own wire has no bracket after it and is left where it is.
    const rowOf = new RegExp(`^${escapeForPattern(repeater.wire)}\\[(\\d+)\\]`)
    interaction.remap((wire) => {
      const match = rowOf.exec(wire)
      if (match === null) return wire
      const moved = newIndexOf(Number(match[1]))
      if (moved === undefined) return undefined
      return `${repeater.wire}[${String(moved)}]${wire.slice(match[0].length)}`
    })
  }

  return {
    of,
    count,
    canAdd,
    canRemove,

    /*
     * Data written before rows had identity is not stranded: it is adopted on load, as the rows a
     * rule writes are after each run. An id that IS present is kept, because a draft, a log or an
     * export may already refer to it — and the counter is advanced past it so the next row cannot
     * collide with it.
     */
    adopt(repeater) {
      const rows = of(repeater)
      if (rows.length === 0) return

      let highest = counters.get(repeater.wire) ?? 0
      for (const row of rows) {
        const existing = isRowObject(row) ? row[ROW_ID] : undefined
        if (typeof existing !== 'string') continue
        const suffix = existing.startsWith(ROW_ID_PREFIX)
          ? Number.parseInt(existing.slice(ROW_ID_PREFIX.length), 10)
          : Number.NaN
        if (Number.isInteger(suffix) && suffix > highest) highest = suffix
      }
      counters.set(repeater.wire, highest)

      const adopted = rows.map((row, index) => {
        const base = isRowObject(row) ? row : {}
        if (typeof base[ROW_ID] === 'string') return row
        // A rule writes its rows afresh each time it runs, and nobody moves one, so a row's
        // position is who it is: the same id each time, and a renderer keeps the row (0218).
        return { ...base, [ROW_ID]: written(repeater) ? `${ROW_ID_PREFIX}${String(index + 1)}` : mint(repeater) }
      })
      if (adopted.some((row, index) => row !== rows[index])) store.set(repeater.path, adopted)
    },

    topUp(repeater) {
      const minimum = repeater.def.minItems ?? 0
      if (written(repeater) || count(repeater) >= minimum) return false
      const rows = [...of(repeater)]
      while (rows.length < minimum) rows.push(filled(repeater.def.fields ?? [], { [ROW_ID]: mint(repeater) }))
      store.set(repeater.path, rows)
      return true
    },

    add(repeater) {
      if (written(repeater)) return
      if (!canAdd(repeater)) {
        throw new RangeError(`"${repeater.wire}" already holds the most rows it allows, ${String(repeater.def.maxItems)}`)
      }
      store.set(repeater.path, [...of(repeater), filled(repeater.def.fields ?? [], { [ROW_ID]: mint(repeater) })])
    },

    id(repeater, index) {
      const row = of(repeater)[index]
      if (row === undefined) throw new RangeError(`No row ${String(index)} in "${repeater.wire}"`)
      const id = isRowObject(row) ? row[ROW_ID] : undefined
      if (typeof id !== 'string') {
        // `adopt` runs for every repeater at construction and `add` mints one, so a row
        // without an id means something wrote the array directly.
        throw new Error(`Row ${String(index)} of "${repeater.wire}" has no ${ROW_ID}`)
      }
      return id
    },

    remove(repeater, index) {
      if (written(repeater)) return
      const rows = store.get(repeater.path)
      if (!Array.isArray(rows) || index < 0 || index >= rows.length) {
        throw new RangeError(`Cannot remove row ${index} of "${repeater.wire}"`)
      }
      if (!canRemove(repeater)) {
        throw new RangeError(`"${repeater.wire}" already holds the fewest rows it allows, ${String(repeater.def.minItems)}`)
      }
      store.set(
        repeater.path,
        rows.filter((_, i) => i !== index),
      )
      // The row's own touched-ness goes with it, and everything after it shifts down.
      // Without this the state stays with the POSITION: measured, visiting the first of
      // two required empty rows and removing it left the surviving row -- which nobody
      // had visited -- reporting touched, invalid, and "required".
      remapRowState(repeater, (row) => (row === index ? undefined : row > index ? row - 1 : row))
    },

    move(repeater, from, to) {
      if (written(repeater)) return
      const rows = store.get(repeater.path)
      if (!Array.isArray(rows)) throw new RangeError(`"${repeater.wire}" holds no rows`)
      for (const index of [from, to]) {
        if (index < 0 || index >= rows.length) {
          throw new RangeError(`Cannot move row ${index} of "${repeater.wire}"`)
        }
      }
      if (from === to) return

      const moved = [...rows]
      const [row] = moved.splice(from, 1)
      moved.splice(to, 0, row)
      store.set(repeater.path, moved)

      // Each row's touched-ness follows the row. Removing shifts a suffix by one;
      // moving shifts the whole span between the two positions, so every row it passes
      // would otherwise inherit a stranger's state.
      remapRowState(repeater, (index) => {
        if (index === from) return to
        if (from < to) return index > from && index <= to ? index - 1 : index
        return index >= to && index < from ? index + 1 : index
      })
    },
  }
}

/*
 * What is wrong with a repeater's rows as a whole: the questions a field answers about its
 * value, asked of the list of rows. What each row must hold is asked of the fields in it.
 *
 * - `type` unless the rows are a list of objects. A string posted where the rows belong was
 *   walked as no rows and stored verbatim.
 * - `required` for no rows at all. Required on a repeater means a row — not a row with
 *   something typed in it, which is what `required` on the fields inside says
 *   ([0184](../../../docs/decisions/0184-a-repeater-is-validated-as-a-field-is.md)).
 * - `minItems` and `maxItems`, the codes a `selectboxes` reports for the same question,
 *   because "how many" is one question however it is asked and a catalogue words it once.
 */
export function repeaterViolations(def: FieldDef, value: unknown, required: boolean): BuiltInErrorCode[] {
  if (value !== undefined && value !== null && !(Array.isArray(value) && value.every(isRowObject))) return ['type']
  const count = Array.isArray(value) ? value.length : 0
  const codes: BuiltInErrorCode[] = []
  if (required && count === 0) codes.push('required')
  if (def.minItems !== undefined && count < def.minItems) codes.push('minItems')
  if (def.maxItems !== undefined && count > def.maxItems) codes.push('maxItems')
  return codes
}

/* A row is an object unless something wrote the array by hand. */
function isRowObject(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}

/* A wire is a literal here, not a pattern: `items[0].name` has brackets and a dot. */
function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
