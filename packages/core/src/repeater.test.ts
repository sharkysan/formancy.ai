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
  })

  test('addRow on a non-repeater path throws', () => {
    const engine = createFormEngine({ schema })
    expect(() => engine.addRow(['customer'])).toThrow()
  })
})
