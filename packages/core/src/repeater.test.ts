import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', required: true },
      {
        key: 'items',
        type: 'repeater',
        fields: [
          { key: 'name', type: 'text', required: true },
          { key: 'qty', type: 'number' },
        ],
      },
    ],
  },
}

describe('repeater rows', () => {
  test('instantiates template fields once per existing row', () => {
    const engine = createFormEngine({
      schema,
      initialValue: { items: [{ name: 'a' }, { name: 'b' }] },
    })

    expect(engine.fieldPaths()).toContain('items[0].name')
    expect(engine.fieldPaths()).toContain('items[1].qty')
    expect(engine.fieldPaths()).not.toContain('items[2].name')
  })

  test('a repeater with no rows contributes no field paths', () => {
    const engine = createFormEngine({ schema })
    expect(engine.fieldPaths().filter((p) => p.startsWith('items['))).toEqual([])
  })

  test('rowCount reports the current number of rows', () => {
    const engine = createFormEngine({ schema, initialValue: { items: [{}, {}, {}] } })
    expect(engine.rowCount(['items'])).toBe(3)
  })

  test('addRow appends an empty row whose fields immediately exist', () => {
    const engine = createFormEngine({ schema })

    engine.addRow(['items'])

    expect(engine.rowCount(['items'])).toBe(1)
    expect(engine.fieldPaths()).toContain('items[0].name')
    expect(engine.getFieldSnapshot(['items', 0, 'name']).value).toBeUndefined()
  })

  test('removeRow deletes exactly that row and reindexes the rest', () => {
    const engine = createFormEngine({
      schema,
      initialValue: { items: [{ name: 'a' }, { name: 'b' }] },
    })

    engine.removeRow(['items'], 0)

    expect(engine.rowCount(['items'])).toBe(1)
    expect(engine.getFieldSnapshot(['items', 0, 'name']).value).toBe('b')
  })

  test('validates template rules per row, at the row path', () => {
    const engine = createFormEngine({
      schema,
      initialValue: { customer: 'ACME', items: [{ name: 'filled' }, { qty: 2 }] },
    })

    const report = engine.validate()

    expect(report.errors['items[1].name']).toEqual(['required'])
    expect(report.errors['items[0].name']).toBeUndefined()
  })

  test('row field snapshots carry per-row ids', () => {
    const engine = createFormEngine({ schema, initialValue: { items: [{}] } })

    const ids = engine.getFieldSnapshot(['items', 0, 'name']).ids
    expect(ids.control).toContain('items[0].name')
  })

  test('row fields inherit the repeater page for wizard scoping', () => {
    const paged: FormSchema = {
      ...schema,
      model: {
        fields: [
          { key: 'first', type: 'page', fields: [{ key: 'customer', type: 'text' }] },
          { key: 'second', type: 'page', fields: [schema.model.fields[1]!] },
        ],
      },
    }
    const engine = createFormEngine({ schema: paged, initialValue: { items: [{}] } })

    expect(engine.pageOf(['items', 0, 'name'])).toBe(1)
    expect(engine.pageOf(['items'])).toBe(1)
  })

  test('addRow on a non-repeater path throws', () => {
    const engine = createFormEngine({ schema })
    expect(() => engine.addRow(['customer'])).toThrow()
  })
})

describe('repeater subscriptions', () => {
  test('a subscriber on the repeater path itself is woken by row changes', () => {
    const engine = createFormEngine({ schema, initialValue: { items: [{ name: 'a' }] } })
    let woken = 0
    engine.subscribeField(['items'], () => woken++)

    engine.addRow(['items'])
    expect(woken).toBe(1)

    engine.removeRow(['items'], 0)
    expect(woken).toBe(2)
  })

  test('a subscriber on the repeater path is woken by a write inside a row', () => {
    const engine = createFormEngine({ schema, initialValue: { items: [{ name: 'a' }] } })
    let woken = 0
    engine.subscribeField(['items'], () => woken++)

    engine.setValue(['items', 0, 'name'], 'b')

    expect(woken).toBe(1)
  })

  test('a subscriber on the repeater path stays quiet for unrelated writes', () => {
    const engine = createFormEngine({ schema, initialValue: { items: [{ name: 'a' }] } })
    let woken = 0
    engine.subscribeField(['items'], () => woken++)

    engine.setValue(['customer'], 'ACME')

    expect(woken).toBe(0)
  })
})

describe('repeaterPaths', () => {
  test('names every repeater wire, so renderers can give rows their own chrome', () => {
    const engine = createFormEngine({ schema })
    expect(engine.repeaterPaths()).toEqual(['items'])
  })
})

describe('repeaters accessor', () => {
  test('exposes each repeater with its definition, for renderer chrome', () => {
    const engine = createFormEngine({ schema })
    const repeaters = engine.repeaters()

    expect(repeaters).toHaveLength(1)
    expect(repeaters[0]!.wire).toBe('items')
    expect(repeaters[0]!.def.type).toBe('repeater')
  })
})

describe('minItems', () => {
  const seeded: FormSchema = {
    specVersion: '1',
    id: 'crm',
    title: 'CRM',
    model: {
      fields: [
        {
          key: 'contacts',
          type: 'repeater',
          minItems: 2,
          fields: [{ key: 'name', type: 'text' }],
        },
      ],
    },
  }

  test('the engine opens with the minimum number of rows', () => {
    const engine = createFormEngine({ schema: seeded })

    expect(engine.rowCount(['contacts'])).toBe(2)
    expect(engine.fieldPaths()).toContain('contacts[1].name')
  })

  test('seeding tops up a short initial value rather than replacing it', () => {
    const engine = createFormEngine({
      schema: seeded,
      initialValue: { contacts: [{ name: 'Ada' }] },
    })

    expect(engine.rowCount(['contacts'])).toBe(2)
    expect(engine.getFieldSnapshot(['contacts', 0, 'name']).value).toBe('Ada')
  })

  test('an initial value above the minimum is left alone', () => {
    const engine = createFormEngine({
      schema: seeded,
      initialValue: { contacts: [{}, {}, {}] },
    })

    expect(engine.rowCount(['contacts'])).toBe(3)
  })

  test('seeding is idempotent — building twice yields the same shape', () => {
    const once = createFormEngine({ schema: seeded }).value()
    const twice = createFormEngine({ schema: seeded, initialValue: once }).value()

    expect(twice).toEqual(once)
  })

  test('a repeater without minItems still opens empty', () => {
    const engine = createFormEngine({ schema })
    expect(engine.rowCount(['items'])).toBe(0)
  })
})

/**
 * A row needs an identity that is not its position, because its position is not
 * stable: removing row 0 renumbers every row after it. Renderers keyed by index
 * therefore move focus to the wrong control and animate the wrong element, and
 * — the reason this belongs in the DATA rather than in a renderer — a stored
 * submission has no way to say which row an answer belonged to.
 *
 * See docs/decisions/0041-repeater-row-identity.md.
 */
describe('row identity', () => {
  const ids = (engine: ReturnType<typeof createFormEngine>): unknown[] =>
    (engine.value() as { items?: Array<{ _id?: unknown }> }).items?.map((row) => row._id) ?? []

  test('a new row is born with an id', () => {
    const engine = createFormEngine({ schema })
    engine.addRow(['items'])

    expect(engine.rowId(['items'], 0)).toMatch(/^r\d+$/)
    expect(ids(engine)).toEqual([engine.rowId(['items'], 0)])
  })

  test('ids are distinct within a repeater', () => {
    const engine = createFormEngine({ schema })
    engine.addRow(['items'])
    engine.addRow(['items'])
    engine.addRow(['items'])

    expect(new Set(ids(engine)).size).toBe(3)
  })

  test('removing a row does not renumber the rows after it', () => {
    const engine = createFormEngine({ schema })
    engine.addRow(['items'])
    engine.addRow(['items'])
    engine.addRow(['items'])
    const [, second, third] = ids(engine)

    engine.removeRow(['items'], 0)

    // The whole point: the surviving rows keep the identity they had, even
    // though both have moved down one position.
    expect(ids(engine)).toEqual([second, third])
    expect(engine.rowId(['items'], 0)).toBe(second)
  })

  test('a removed row never has its id reissued', () => {
    const engine = createFormEngine({ schema })
    engine.addRow(['items'])
    const first = engine.rowId(['items'], 0)
    engine.removeRow(['items'], 0)
    engine.addRow(['items'])

    // Reusing it would make a new row indistinguishable from a deleted one in
    // any log, export or audit trail that recorded the first.
    expect(engine.rowId(['items'], 0)).not.toBe(first)
  })

  test('rows seeded to satisfy minItems get ids too', () => {
    const seeded = createFormEngine({
      schema: {
        ...schema,
        model: {
          fields: [
            { key: 'customer', type: 'text' },
            {
              key: 'items',
              type: 'repeater',
              minItems: 2,
              fields: [{ key: 'name', type: 'text' }],
            },
          ],
        },
      },
    })

    expect(ids(seeded)).toHaveLength(2)
    expect(new Set(ids(seeded)).size).toBe(2)
  })

  test('rows that arrive without an id are given one, so old data is not stranded', () => {
    const engine = createFormEngine({
      schema,
      initialValue: { items: [{ name: 'a' }, { name: 'b' }] },
    })

    expect(new Set(ids(engine)).size).toBe(2)
  })

  test('an id that arrives with the data is kept, because something may reference it', () => {
    const engine = createFormEngine({
      schema,
      initialValue: { items: [{ _id: 'r7', name: 'a' }] },
    })
    engine.addRow(['items'])

    expect(engine.rowId(['items'], 0)).toBe('r7')
    // And the next id must clear the one already in the data rather than
    // starting from scratch and colliding with it.
    expect(engine.rowId(['items'], 1)).not.toBe('r7')
  })

  test('_id is not a field, so it is neither validated nor rendered', () => {
    const engine = createFormEngine({ schema })
    engine.addRow(['items'])

    expect(engine.fieldPaths()).not.toContain('items[0]._id')
    expect(engine.validate().errors).not.toHaveProperty('items[0]._id')
    // The row's own field still validates, so the row is not being skipped.
    expect(Object.keys(engine.validate().errors)).toContain('items[0].name')
  })
})
