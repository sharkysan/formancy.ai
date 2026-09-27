import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * Rows keep their own state when the list around them changes.
 *
 * ── THE BUG THIS STARTED AS ─────────────────────────────────────────────────
 *
 * Touched-ness gates error presentation: `aria-invalid` and visible error text appear
 * only on a field that is both invalid AND touched, so a pristine form does not open
 * by shouting. It is stored as a set of wires — `items[1].name` — which means it is
 * keyed by a row's **position**, and a position is not an identity.
 *
 * So, measured before any of this was written:
 *
 * 1. Two rows, both required and empty.
 * 2. Visit the first, try to submit.
 * 3. Remove the first row.
 * 4. The surviving row — which nobody ever visited — reports `touched: true`,
 *    `errors: ['required']` and `aria-invalid="true"`.
 *
 * A person is shown an error on a field they have not reached, and a screen-reader
 * user is told the field is invalid before they arrive at it. `removeRow` had always
 * done this; nothing tested it, because the test that would have caught it is about
 * two rows and one removal rather than about one row.
 *
 * ── AND WHY IT HAD TO BE FIXED BEFORE `moveRow` EXISTED ─────────────────────
 *
 * Reordering is the same defect with a bigger blast radius. Removing a row shifts
 * everything after it by one; moving a row shifts a whole span, so every row between
 * the two positions would inherit a stranger's touched state. Adding `moveRow` on top
 * of position-keyed state would have made a rare confusion into a routine one.
 *
 * So state is remapped with the rows, in both operations, and the `remap` that does it
 * lives in `interaction.ts` where the set does — not in the engine, which should not
 * know how touched-ness is stored.
 */

const schema = {
  specVersion: '2',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      {
        key: 'items',
        type: 'repeater',
        label: 'Items',
        fields: [{ key: 'name', type: 'text', label: 'Name', required: true }],
      },
    ],
  },
} as FormSchema

const engineWith = (names: readonly string[]) =>
  createFormEngine({ schema, initialValue: { items: names.map((name) => ({ name })) } })

const nameAt = (engine: ReturnType<typeof engineWith>, index: number): unknown =>
  engine.getFieldSnapshot(['items', index, 'name']).value

const touchedAt = (engine: ReturnType<typeof engineWith>, index: number): boolean =>
  engine.getFieldSnapshot(['items', index, 'name']).touched

describe('removing a row', () => {
  test('does not leave a row nobody visited marked as touched', () => {
    // The reported shape, asserted. Before the fix this was `true`, and with a
    // required empty field it put `aria-invalid` and a "required" message on a field
    // the person had never reached.
    const engine = engineWith(['', ''])
    engine.touch(['items', 0, 'name'])
    engine.validate()
    engine.removeRow(['items'], 0)

    const surviving = engine.getFieldSnapshot(['items', 0, 'name'])
    expect(surviving.touched).toBe(false)
    expect(surviving.props.control['aria-invalid']).toBeUndefined()
  })

  test('carries the touched state of the rows after it down with them', () => {
    // The other half: state must not be dropped either. Row 2 was visited, so after
    // removing row 0 the row now at index 1 is still the visited one.
    const engine = engineWith(['a', 'b', 'c'])
    engine.touch(['items', 2, 'name'])
    engine.removeRow(['items'], 0)

    expect(nameAt(engine, 1)).toBe('c')
    expect(touchedAt(engine, 1)).toBe(true)
    expect(touchedAt(engine, 0)).toBe(false)
  })
})

describe('moveRow', () => {
  test('moves the row, and the value goes with it', () => {
    const engine = engineWith(['a', 'b', 'c'])
    engine.moveRow(['items'], 0, 2)
    expect([nameAt(engine, 0), nameAt(engine, 1), nameAt(engine, 2)]).toEqual(['b', 'c', 'a'])
  })

  test('moves backwards as well as forwards', () => {
    const engine = engineWith(['a', 'b', 'c'])
    engine.moveRow(['items'], 2, 0)
    expect([nameAt(engine, 0), nameAt(engine, 1), nameAt(engine, 2)]).toEqual(['c', 'a', 'b'])
  })

  test('takes each row’s touched state with it', () => {
    // The whole reason this is one change with the removal fix. Row 0 is the only one
    // visited; after moving it to the end, the row at the end is the visited one and
    // the two it passed are untouched.
    const engine = engineWith(['a', 'b', 'c'])
    engine.touch(['items', 0, 'name'])
    engine.moveRow(['items'], 0, 2)

    expect(touchedAt(engine, 2)).toBe(true)
    expect(touchedAt(engine, 0)).toBe(false)
    expect(touchedAt(engine, 1)).toBe(false)
  })

  test('keeps each row’s own id, so a renderer does not reuse the wrong DOM', () => {
    // Renderers key rows by identity rather than position precisely so that focus and
    // animation survive a reorder. If ids did not travel with rows, every reorder
    // would look to React like every row changing.
    const engine = engineWith(['a', 'b', 'c'])
    const before = [0, 1, 2].map((index) => engine.rowId(['items'], index))
    engine.moveRow(['items'], 0, 2)
    const after = [0, 1, 2].map((index) => engine.rowId(['items'], index))

    expect(after).toEqual([before[1], before[2], before[0]])
  })

  test('is a no-op when the row does not move, and says nothing happened', () => {
    // A notification for a move that moved nothing would re-render every row of every
    // subscriber for a gesture that was cancelled.
    const engine = engineWith(['a', 'b'])
    let notifications = 0
    engine.subscribe(() => {
      notifications += 1
    })
    engine.moveRow(['items'], 1, 1)
    expect(notifications).toBe(0)
    expect([nameAt(engine, 0), nameAt(engine, 1)]).toEqual(['a', 'b'])
  })

  test('refuses an index that is not a row', () => {
    // Loudly, like removeRow: a silent clamp would move a row somewhere the caller did
    // not ask for, and a drag that ends off the end of the list is exactly how that
    // gets called.
    const engine = engineWith(['a', 'b'])
    expect(() => engine.moveRow(['items'], 0, 2)).toThrow(RangeError)
    expect(() => engine.moveRow(['items'], -1, 0)).toThrow(RangeError)
    expect(() => engine.moveRow(['items'], 5, 0)).toThrow(RangeError)
  })

  test('is visible to a rule that reads a row by position', () => {
    // Reordering IS a value change, so anything derived from `items[0]` recomputes.
    // Asserted because the alternative — moving rows without notifying — would leave
    // a computed value describing the row that used to be first.
    const engine = engineWith(['a', 'b'])
    // `_id` is part of the value on purpose: it lives IN the row so that a stored
    // submission is self-describing years later, without the engine that wrote it.
    // Asserted here rather than stripped, because a move that renumbered the ids
    // would be a move that lost which row was which.
    const names = (): unknown =>
      (engine.value() as { items: Array<Record<string, unknown>> }).items.map(
        (row) => row['name'],
      )
    expect(names()).toEqual(['a', 'b'])
    engine.moveRow(['items'], 0, 1)
    expect(names()).toEqual(['b', 'a'])
  })
})
