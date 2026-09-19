import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import type { FormEngineOptions } from './engine.js'

const FIXED_CLOCK = { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 }

const schema: FormSchema = {
  specVersion: '0',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'country', type: 'select' },
      { key: 'canton', type: 'text', required: true },
      { key: 'state', type: 'text', clearOnHide: false },
      { key: 'price', type: 'number' },
      { key: 'qty', type: 'number' },
      { key: 'subtotal', type: 'number' },
      { key: 'total', type: 'number' },
      { key: 'vip', type: 'checkbox' },
      { key: 'reason', type: 'text' },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'state', kind: 'visible', cel: 'country == "US"' },
      { target: 'subtotal', kind: 'computed', cel: 'price * qty' },
      { target: 'total', kind: 'computed', cel: 'subtotal * 1.1' },
      { target: 'reason', kind: 'required', cel: 'vip == true' },
      { target: 'qty', kind: 'validate', cel: 'qty == null || qty <= 100.0', code: 'tooMany' },
    ],
  },
}

function engineWith(overrides?: Partial<FormEngineOptions>) {
  return createFormEngine({ schema, capabilities: FIXED_CLOCK, ...overrides })
}

describe('visibility rules', () => {
  test('a field is hidden while its visible rule is false, and appears when it turns true', () => {
    const engine = engineWith()

    expect(engine.getFieldSnapshot(['canton']).visible).toBe(false)

    engine.setValue(['country'], 'CH')

    expect(engine.getFieldSnapshot(['canton']).visible).toBe(true)
    expect(engine.getFieldSnapshot(['state']).visible).toBe(false)
  })

  test('a hidden field is excluded from validation, even when required', () => {
    const engine = engineWith()

    // canton is required in the model but hidden while country is not CH.
    expect(engine.validate().errors['canton']).toBeUndefined()

    engine.setValue(['country'], 'CH')
    expect(engine.validate().errors['canton']).toEqual(['required'])
  })

  test('hiding a field prunes its value by default — a hidden branch cannot smuggle data', () => {
    const engine = engineWith()
    engine.setValue(['country'], 'CH')
    engine.setValue(['canton'], 'ZH')

    engine.setValue(['country'], 'DE')

    expect('canton' in (engine.value() as Record<string, unknown>)).toBe(false)
  })

  test('clearOnHide false keeps the value, and it is there when the field returns', () => {
    const engine = engineWith()
    engine.setValue(['country'], 'US')
    engine.setValue(['state'], 'CA')

    engine.setValue(['country'], 'CH')
    expect((engine.value() as Record<string, unknown>)['state']).toBe('CA')

    engine.setValue(['country'], 'US')
    expect(engine.getFieldSnapshot(['state']).value).toBe('CA')
  })
})

describe('computed rules', () => {
  test('a computed field follows its inputs, through a chain, in one settled pass', () => {
    const engine = engineWith()

    engine.setValue(['price'], 10.0)
    engine.setValue(['qty'], 3.0)

    expect(engine.getFieldSnapshot(['subtotal']).value).toBe(30)
    expect(engine.getFieldSnapshot(['total']).value).toBeCloseTo(33)
  })

  test('a cyclic computed chain is rejected when the engine is built, with the cycle named', () => {
    const cyclic: FormSchema = {
      ...schema,
      logic: {
        rules: [
          { target: 'price', kind: 'computed', cel: 'qty * 1.0' },
          { target: 'qty', kind: 'computed', cel: 'price * 1.0' },
        ],
      },
    }

    expect(() => createFormEngine({ schema: cyclic, capabilities: FIXED_CLOCK })).toThrow(/price|qty/)
  })
})

describe('required and validate rules', () => {
  test('an expression can make a field required, and the snapshot reflects it live', () => {
    const engine = engineWith()

    expect(engine.getFieldSnapshot(['reason']).required).toBe(false)
    expect(engine.validate().errors['reason']).toBeUndefined()

    engine.setValue(['vip'], true)

    expect(engine.getFieldSnapshot(['reason']).required).toBe(true)
    expect(engine.validate().errors['reason']).toEqual(['required'])
  })

  test('a validate rule contributes its code while false, alongside built-in checks', () => {
    const engine = engineWith()

    engine.setValue(['qty'], 500.0)
    expect(engine.validate().errors['qty']).toEqual(['tooMany'])

    engine.setValue(['qty'], 5.0)
    expect(engine.validate().errors['qty']).toBeUndefined()
  })
})

describe('compile-time gates', () => {
  test('a rule reading an unknown identifier fails engine construction, not the user', () => {
    const broken: FormSchema = {
      ...schema,
      logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'ghost == "x"' }] },
    }

    expect(() => createFormEngine({ schema: broken, capabilities: FIXED_CLOCK })).toThrow(/ghost/)
  })

  test('logic rules require capabilities, because now() must be injected, never ambient', () => {
    expect(() => createFormEngine({ schema })).toThrow(/capabilit/i)
  })

  test('a schema without logic needs no capabilities', () => {
    const plain: FormSchema = { ...schema }
    delete (plain as { logic?: unknown }).logic

    expect(() => createFormEngine({ schema: plain })).not.toThrow()
  })
})
