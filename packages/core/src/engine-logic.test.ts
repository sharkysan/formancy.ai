import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import type { FormEngineOptions } from './engine.js'

const FIXED_CLOCK = { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 }

const schema: FormSchema = {
  specVersion: '1',
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

/**
 * A rule can type-check at save time and still fail when it runs. `int(ref)` on
 * a text field is the realistic case: it type-checks, because int(string) is a
 * legal conversion, and it throws the moment somebody types something that is
 * not a number.
 *
 * What happens then is a safety decision, and it is deliberately asymmetric:
 * see docs/decisions/0022-fail-open-fail-closed.md. These tests exist because
 * writing that record revealed that nothing enforced it — swapping the two
 * branches would previously have broken no test at all.
 */
describe('an expression that fails at runtime', () => {
  const brittle: FormSchema = {
    specVersion: '1',
    id: 'brittle',
    title: 'Brittle',
    model: {
      fields: [
        { key: 'reference', type: 'text' },
        { key: 'shown', type: 'text' },
        { key: 'asked', type: 'text' },
        { key: 'locked', type: 'text' },
        { key: 'checked', type: 'text' },
      ],
    },
    logic: {
      rules: [
        { target: 'shown', kind: 'visible', cel: 'int(reference) > 5' },
        { target: 'asked', kind: 'required', cel: 'int(reference) > 5' },
        { target: 'locked', kind: 'disabled', cel: 'int(reference) > 5' },
        { target: 'checked', kind: 'validate', cel: 'int(reference) > 5', code: 'unproven' },
      ],
    },
  }

  const brittleEngine = (): ReturnType<typeof createFormEngine> => {
    const engine = createFormEngine({
      schema: brittle,
      capabilities: FIXED_CLOCK,
    } satisfies FormEngineOptions)
    engine.setValue(['reference'], 'not a number')
    return engine
  }

  test('the premise: the rule really does fail, rather than quietly returning false', () => {
    // Without this, every assertion below would pass for the wrong reason — an
    // expression that evaluated successfully to false looks identical to one
    // that failed open.
    const working = createFormEngine({
      schema: brittle,
      capabilities: FIXED_CLOCK,
    } satisfies FormEngineOptions)
    working.setValue(['reference'], '9')

    expect(working.getFieldSnapshot(['asked']).required).toBe(true)
    expect(brittleEngine().getFieldSnapshot(['asked']).required).toBe(false)
  })

  test('a visible rule fails OPEN, because hiding a field discards what was typed into it', () => {
    expect(brittleEngine().getFieldSnapshot(['shown']).visible).toBe(true)
  })

  test('a required rule fails OPEN, because a field nobody can satisfy blocks the form', () => {
    expect(brittleEngine().getFieldSnapshot(['asked']).required).toBe(false)
  })

  test('a disabled rule fails OPEN, because a control nobody can use blocks the form', () => {
    expect(brittleEngine().getFieldSnapshot(['locked']).disabled).toBe(false)
  })

  test('a validate rule fails CLOSED, because unchecked data in a database is not recoverable', () => {
    const engine = brittleEngine()
    const report = engine.validate()

    expect(report.valid).toBe(false)
    expect(report.errors['checked']).toEqual(['unproven'])
  })

  test('the asymmetry holds in one pass: the form is usable and the submission is refused', () => {
    const engine = brittleEngine()
    const outcome = engine.submit()

    expect(engine.getFieldSnapshot(['shown']).visible).toBe(true)
    expect(outcome.ok).toBe(false)
  })
})

/**
 * `runsOn` exists because some checks cannot run in both places. A uniqueness
 * check needs the database; a debounced hint needs the keyboard. Without a way
 * to say which, an author writes the check twice — which is the duplicated,
 * drifting logic this project exists to prevent.
 *
 * It applies to `validate` rules only. Metadata rules must run identically in
 * both places or the server's replay stops being a check at all, so the spec
 * refuses `runsOn` on anything else.
 */
describe('runsOn', () => {
  const sided: FormSchema = {
    specVersion: '1',
    id: 'sided',
    title: 'Sided',
    model: { fields: [{ key: 'email', type: 'text' }] },
    logic: {
      rules: [
        { target: 'email', kind: 'validate', cel: 'false', code: 'everywhere' },
        { target: 'email', kind: 'validate', cel: 'false', code: 'clientOnly', runsOn: 'client' },
        { target: 'email', kind: 'validate', cel: 'false', code: 'serverOnly', runsOn: 'server' },
      ],
    },
  }

  const codesIn = (mode: 'client' | 'server' | undefined): string[] => {
    const engine = createFormEngine({
      schema: sided,
      capabilities: FIXED_CLOCK,
      ...(mode === undefined ? {} : { mode }),
    } satisfies FormEngineOptions)
    return engine.validate().errors['email'] ?? []
  }

  test('an unmarked rule runs in both places', () => {
    expect(codesIn('client')).toContain('everywhere')
    expect(codesIn('server')).toContain('everywhere')
  })

  test('a client-only rule does not run on the server', () => {
    expect(codesIn('client')).toContain('clientOnly')
    expect(codesIn('server')).not.toContain('clientOnly')
  })

  test('a server-only rule does not run on the client', () => {
    expect(codesIn('server')).toContain('serverOnly')
    expect(codesIn('client')).not.toContain('serverOnly')
  })

  test('the default is the client, because that is where a form is filled in', () => {
    expect(codesIn(undefined)).toEqual(codesIn('client'))
  })
})
