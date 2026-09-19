import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

const FIXED_CLOCK = { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 }

const schema: FormSchema = {
  specVersion: '0',
  id: 'invoice',
  title: 'Invoice',
  model: {
    fields: [
      { key: 'currency', type: 'select' },
      { key: 'grand', type: 'number' },
      {
        key: 'items',
        type: 'repeater',
        fields: [
          { key: 'price', type: 'number' },
          { key: 'qty', type: 'number' },
          { key: 'lineTotal', type: 'number' },
          { key: 'discount', type: 'number', clearOnHide: false },
          { key: 'reason', type: 'text' },
        ],
      },
    ],
  },
  logic: {
    rules: [
      { target: 'items[].lineTotal', kind: 'computed', cel: 'item.price * item.qty' },
      { target: 'items[].reason', kind: 'required', cel: 'item.qty != null && item.qty > 10.0' },
      { target: 'items[].discount', kind: 'visible', cel: 'currency == "CHF"' },
      { target: 'items[].qty', kind: 'validate', cel: 'item.qty == null || item.qty > 0.0', code: 'notPositive' },
      { target: 'grand', kind: 'computed', cel: 'size(items) == 0 ? 0.0 : items[0].lineTotal + 0.0' },
    ],
  },
}

function build(initialValue?: unknown) {
  return createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue })
}

describe('row-scoped computed rules', () => {
  test('computes per row, into that row', () => {
    const engine = build({ items: [{ price: 10.0, qty: 2.0 }, { price: 5.0, qty: 3.0 }] })

    expect(engine.getFieldSnapshot(['items', 0, 'lineTotal']).value).toBe(20)
    expect(engine.getFieldSnapshot(['items', 1, 'lineTotal']).value).toBe(15)
  })

  test('recomputes the affected row when its inputs change', () => {
    const engine = build({ items: [{ price: 10.0, qty: 2.0 }] })

    engine.setValue(['items', 0, 'qty'], 4.0)

    expect(engine.getFieldSnapshot(['items', 0, 'lineTotal']).value).toBe(40)
  })

  test('an aggregate over the repeater runs AFTER the row computations it reads', () => {
    const engine = build({ items: [{ price: 10.0, qty: 2.0 }] })

    expect(engine.getFieldSnapshot(['grand']).value).toBe(20)

    engine.setValue(['items', 0, 'qty'], 3.0)
    expect(engine.getFieldSnapshot(['grand']).value).toBe(30)
  })

  test('a new row is computed the moment it appears', () => {
    const engine = build()
    engine.addRow(['items'])
    engine.setValue(['items', 0, 'price'], 7.0)
    engine.setValue(['items', 0, 'qty'], 2.0)

    expect(engine.getFieldSnapshot(['items', 0, 'lineTotal']).value).toBe(14)
  })
})

describe('row-scoped metadata rules', () => {
  test('required can depend on the row itself', () => {
    const engine = build({ items: [{ qty: 20.0 }, { qty: 2.0 }] })

    expect(engine.getFieldSnapshot(['items', 0, 'reason']).required).toBe(true)
    expect(engine.getFieldSnapshot(['items', 1, 'reason']).required).toBe(false)
    expect(engine.validate().errors['items[0].reason']).toEqual(['required'])
    expect(engine.validate().errors['items[1].reason']).toBeUndefined()
  })

  test('visibility applies per row instance and respects clearOnHide false', () => {
    const engine = build({ items: [{ discount: 5.0 }] })

    expect(engine.getFieldSnapshot(['items', 0, 'discount']).visible).toBe(false)
    // clearOnHide false: the value survives the hide.
    expect(engine.getFieldSnapshot(['items', 0, 'discount']).value).toBe(5)

    engine.setValue(['currency'], 'CHF')
    expect(engine.getFieldSnapshot(['items', 0, 'discount']).visible).toBe(true)
  })

  test('validate rules run per row and name the failing instance', () => {
    const engine = build({ items: [{ qty: 5.0 }, { qty: -1.0 }] })

    const report = engine.validate()

    expect(report.errors['items[1].qty']).toEqual(['notPositive'])
    expect(report.errors['items[0].qty']).toBeUndefined()
  })
})

describe('row-scoped cycle gates', () => {
  test('a cycle between row computations is rejected at construction', () => {
    const cyclic: FormSchema = {
      ...schema,
      logic: {
        rules: [
          { target: 'items[].price', kind: 'computed', cel: 'item.qty * 1.0' },
          { target: 'items[].qty', kind: 'computed', cel: 'item.price * 1.0' },
        ],
      },
    }

    expect(() => createFormEngine({ schema: cyclic, capabilities: FIXED_CLOCK })).toThrow(/price|qty/)
  })

  test('a row rule reading the aggregate that reads the rows is rejected', () => {
    const cyclic: FormSchema = {
      ...schema,
      logic: {
        rules: [
          { target: 'items[].lineTotal', kind: 'computed', cel: 'grand * 1.0' },
          { target: 'grand', kind: 'computed', cel: 'size(items) + 0.0' },
        ],
      },
    }

    expect(() => createFormEngine({ schema: cyclic, capabilities: FIXED_CLOCK })).toThrow(/grand|items/)
  })
})
