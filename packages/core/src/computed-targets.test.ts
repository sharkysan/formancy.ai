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
