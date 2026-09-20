import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

const schema: FormSchema = {
  specVersion: '0',
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
    specVersion: '0',
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
