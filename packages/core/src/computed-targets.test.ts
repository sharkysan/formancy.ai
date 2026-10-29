import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * A field a `computed` rule writes holds what the rule wrote, and nothing else.
 *
 * The spec says nobody can type over a computed value. The engine overwrote one only when
 * the expression could be evaluated: while an input it reads was still empty the rule
 * wrote nothing (0054), so a value typed, set or sent into the field stood — on the
 * screen, and on the server, whose replay stored it as the computed value (0181).
 */
const FIXED_CLOCK = { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 }

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'price', type: 'number' },
      { key: 'qty', type: 'number' },
      { key: 'total', type: 'number' },
      {
        key: 'items',
        type: 'repeater',
        fields: [
          { key: 'amount', type: 'number' },
          { key: 'lineTotal', type: 'number' },
        ],
      },
    ],
  },
  logic: {
    rules: [
      { target: 'total', kind: 'computed', cel: 'price * qty' },
      { target: 'items[].lineTotal', kind: 'computed', cel: 'item.amount * 2.0' },
    ],
  },
}

const build = (initialValue?: unknown, mode?: 'client' | 'server') =>
  createFormEngine({
    schema,
    capabilities: FIXED_CLOCK,
    ...(initialValue === undefined ? {} : { initialValue }),
    ...(mode === undefined ? {} : { mode }),
  })

describe('the snapshot says which fields a rule writes', () => {
  // One decision both renderers read. Each deriving it from the rules itself is two
  // implementations of one decision, and the day they disagree a person can type into a
  // total in one of them and not the other (0091).
  test('a computed field is read-only, and the fields it reads are not', () => {
    const engine = build()

    expect(engine.getFieldSnapshot(['total']).readOnly).toBe(true)
    expect(engine.getFieldSnapshot(['price']).readOnly).toBe(false)
  })

  // A row rule names the member once for every row, so a member of the third row is as
  // read-only as one of the first — and a row added later is born that way.
  test('and so is a computed member of every row, a row added later included', () => {
    const engine = build({ items: [{ amount: 1.0 }] })
    engine.addRow(['items'])

    expect(engine.getFieldSnapshot(['items', 0, 'lineTotal']).readOnly).toBe(true)
    expect(engine.getFieldSnapshot(['items', 1, 'lineTotal']).readOnly).toBe(true)
    expect(engine.getFieldSnapshot(['items', 1, 'amount']).readOnly).toBe(false)
  })
})

describe('a value set on a computed field does not take', () => {
  // The case that stood: `price * qty` cannot be evaluated while `qty` is empty, so the
  // rule wrote nothing and the typed 999 was the field's value until `qty` was answered.
  test('while the expression cannot be evaluated', () => {
    const engine = build()

    engine.setValue(['total'], 999)

    expect(engine.getFieldSnapshot(['total']).value).toBeUndefined()
  })

  // What the rule wrote stands while its inputs stop making sense (0054); a value set on
  // the field in that state must not replace it either.
  test('and the value the rule wrote last stays', () => {
    const engine = build()
    engine.setValue(['price'], 2.0)
    engine.setValue(['qty'], 3.0)
    engine.setValue(['qty'], null)

    engine.setValue(['total'], 999)

    expect(engine.getFieldSnapshot(['total']).value).toBe(6)
  })

  test('in a row as well', () => {
    const engine = build({ items: [{}] })

    engine.setValue(['items', 0, 'lineTotal'], 999)

    expect(engine.getFieldSnapshot(['items', 0, 'lineTotal']).value).toBeUndefined()
  })
})

describe('a value handed in for a computed field is not its value', () => {
  // The initial value is a draft being resumed, a host's prefill or — on the server — the
  // request body. A computed field's value in it was either recomputed, or kept as sent
  // when the expression could not be evaluated: a total nobody computed, stored as one.
  test('it is dropped, and the rule computes from the answers it reads', () => {
    expect(build({ total: 999 }).value()).toEqual({})
    expect(build({ price: 2.0, qty: 3.0, total: 999 }).value()).toEqual({ price: 2, qty: 3, total: 6 })
  })

  test('in every row', () => {
    const engine = build({ items: [{ lineTotal: 999 }, { amount: 1.0, lineTotal: 999 }] })

    expect(engine.getFieldSnapshot(['items', 0, 'lineTotal']).value).toBeUndefined()
    expect(engine.getFieldSnapshot(['items', 1, 'lineTotal']).value).toBe(2)
  })

  // The replay a submission goes through: what arrived for a computed field is not what is
  // stored, whether or not its expression can be evaluated (SAFETY-ANALYSIS A3).
  test('on the server, which stores no computed value it did not compute', async () => {
    const engine = build({ price: 2.0, total: 999 }, 'server')
    await engine.settle()

    expect(engine.submit().ok).toBe(true)
    expect(engine.value()).toEqual({ price: 2 })
  })
})

describe('a repeater a computed rule writes is the rule’s, row by row', () => {
  // A rule may compute a whole repeater's rows. The engine kept its value as it keeps a computed
  // field's, but asked nothing of what lies inside it: its rows' fields said they were not
  // read-only, a row could be added, removed or moved, and a value could be set in one. While
  // the expression could not be evaluated, the rule wrote nothing back, so a row a person added
  // and typed into stood in the browser — and the server, which drops what arrives for a
  // computed field, stored none of it (SAFETY-ANALYSIS A3).
  const rows: FormSchema = {
    specVersion: '1',
    id: 'lines',
    title: 'Lines',
    model: {
      fields: [
        { key: 'count', type: 'number' },
        { key: 'lines', type: 'repeater', fields: [{ key: 'name', type: 'text' }] },
      ],
    },
    logic: { rules: [{ target: 'lines', kind: 'computed', cel: "count > 1.0 ? [{'name': 'computed'}] : []" }] },
  }
  const written = () => createFormEngine({ schema: rows, capabilities: FIXED_CLOCK })

  test('each field in its rows is read-only', () => {
    const engine = written()
    engine.setValue(['count'], 2.0)

    expect(engine.getFieldSnapshot(['lines', 0, 'name']).readOnly).toBe(true)
  })

  // A renderer keys each row by its id, and the rows a rule wrote had none: drawing one threw,
  // `Row 0 of "lines" has no _id`, in both renderers. The same id each run, so a row is kept.
  test('its rows have ids, the same each time the rule runs', () => {
    const engine = written()
    engine.setValue(['count'], 2.0)
    const id = engine.rowId(['lines'], 0)

    engine.setValue(['count'], 3.0)

    expect(engine.rowId(['lines'], 0)).toBe(id)
    expect(engine.value()).toEqual({ count: 3, lines: [{ _id: id, name: 'computed' }] })
  })

  test('it offers no row to add or remove', () => {
    const engine = written()
    engine.setValue(['count'], 2.0)

    expect(engine.canAddRow(['lines'])).toBe(false)
    expect(engine.canRemoveRow(['lines'])).toBe(false)
  })

  // The case that stood: `count > 1.0` cannot be evaluated while `count` is empty.
  test('a row added and typed into does not take, while the expression cannot be evaluated', () => {
    const engine = written()

    engine.addRow(['lines'])
    engine.setValue(['lines', 0, 'name'], 'typed')

    expect(engine.value()).toEqual({})
  })

  // A repeater's minimum is met by adding empty rows as the form opens (0184). For one a rule
  // writes, those rows were nobody's: the server's replay stored `[{}]` for a submission that
  // sent nothing, while the expression could not be evaluated.
  test('and none is added to meet its minimum, so the server stores no row the rule did not write', async () => {
    const least: FormSchema = {
      ...rows,
      model: {
        fields: rows.model.fields.map((field) => (field.key === 'lines' ? { ...field, minItems: 1 } : field)),
      },
    }
    const engine = createFormEngine({ schema: least, capabilities: FIXED_CLOCK, initialValue: {}, mode: 'server' })
    await engine.settle()

    expect(engine.value()).toEqual({})
  })

  test('nor once it can', () => {
    const engine = written()
    engine.setValue(['count'], 2.0)

    engine.setValue(['lines', 0, 'name'], 'typed')
    engine.addRow(['lines'])
    engine.moveRow(['lines'], 0, 0)
    engine.removeRow(['lines'], 0)

    expect(engine.getFieldSnapshot(['lines', 0, 'name']).value).toBe('computed')
    expect(engine.rowCount(['lines'])).toBe(1)
  })
})
