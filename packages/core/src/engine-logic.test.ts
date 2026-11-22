import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
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

/**
 * The rules of one pass read one bag of answers, and what a computed rule writes goes into it for
 * the rules after it. It went in at the target's top-level name, which for a field inside a group
 * is the group's: a rule writing `addr.zip` left `addr` as "3000", and a row rule in a repeater
 * inside a group left the group as the list of rows. Every rule after it that read a member of the
 * group could not be evaluated, and since the write is made again on every pass, never was.
 */
describe('what a computed rule writes inside a group, read by the rules after it in the same pass', () => {
  const form = (fields: FieldDef[], rules: LogicRule[]): FormSchema => ({
    specVersion: '1',
    id: 'grouped',
    title: 'Grouped',
    model: { fields },
    logic: { rules },
  })

  const address = form(
    [
      {
        key: 'addr',
        type: 'group',
        fields: [
          { key: 'city', type: 'text' },
          { key: 'zip', type: 'text' },
        ],
      },
      { key: 'label', type: 'text' },
      { key: 'town', type: 'text' },
      { key: 'canton', type: 'text' },
      { key: 'note', type: 'text' },
      { key: 'locked', type: 'text' },
    ],
    [
      { target: 'addr.zip', kind: 'computed', cel: '"3000"' },
      { target: 'label', kind: 'computed', cel: '"PLZ " + addr.zip' },
      { target: 'town', kind: 'computed', cel: 'addr.city' },
      { target: 'canton', kind: 'required', cel: 'addr.city == "Bern"' },
      { target: 'note', kind: 'visible', cel: 'addr.city == "Basel"' },
      { target: 'locked', kind: 'disabled', cel: 'addr.city == "Bern"' },
    ],
  )
  const inBern = (mode: 'client' | 'server' = 'client') =>
    createFormEngine({ schema: address, capabilities: FIXED_CLOCK, mode, initialValue: { addr: { city: 'Bern' }, note: 'typed' } })

  test('a rule after it reads the value it wrote', () => {
    // `addr.zip` read a member of the string "3000", could not be evaluated, and the label was
    // never written, though the zip it reads was stored.
    expect(inBern().getFieldSnapshot(['label']).value).toBe('PLZ 3000')
  })

  test('a rule after it reads a field of the group the rule did not write', () => {
    // The city stood beside the zip in the store and not in the bag, so the town stayed empty
    // however often the city was changed.
    const engine = inBern()
    expect(engine.getFieldSnapshot(['town']).value).toBe('Bern')

    engine.setValue(['addr', 'city'], 'Thun')
    expect(engine.getFieldSnapshot(['town']).value).toBe('Thun')
  })

  test('a required, a visible and a disabled rule read the group whole, in the browser and on the replay', () => {
    // They run after every computed rule, and each failed open, as 0022 has them: the canton was
    // not asked for and a submission without it was accepted, the note a rule hides was shown, so
    // the server's replay kept what was typed into it rather than strip it, and the field a rule
    // locks could be changed.
    for (const mode of ['client', 'server'] as const) {
      const engine = inBern(mode)

      expect(engine.getFieldSnapshot(['canton']).required).toBe(true)
      expect(engine.getFieldSnapshot(['note']).visible).toBe(false)
      expect(engine.getFieldSnapshot(['locked']).disabled).toBe(true)
      expect(engine.submit()).toEqual({ ok: false, errors: { canton: ['required'] } })
      expect('note' in (engine.value() as Record<string, unknown>)).toBe(false)
    }
  })

  const order = form(
    [
      {
        key: 'order',
        type: 'group',
        fields: [
          { key: 'note', type: 'text' },
          {
            key: 'lines',
            type: 'repeater',
            fields: [
              { key: 'qty', type: 'number' },
              { key: 'twice', type: 'number' },
              { key: 'label', type: 'text' },
            ],
          },
        ],
      },
      { key: 'remark', type: 'text' },
    ],
    [
      { target: 'order.lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' },
      // Reads `item.twice`, so it runs after the rule above.
      { target: 'order.lines[].label', kind: 'computed', cel: 'order.note + " " + string(item.twice)' },
      { target: 'remark', kind: 'visible', cel: 'has(order.note) && order.note != "Probe"' },
    ],
  )
  const probe = () => createFormEngine({ schema: order, capabilities: FIXED_CLOCK, initialValue: { order: { note: 'Probe', lines: [{ qty: 2 }] } } })

  test('a row rule after another, in a repeater inside a group, reads the group', () => {
    // The group was left as its rows, so `order.note` read a member of a list and every row's
    // label stayed empty.
    expect(probe().getFieldSnapshot(['order', 'lines', 0, 'label']).value).toBe('Probe 4')
  })

  test('a rule after the row rules reads the group, not its rows', () => {
    // The visible rule read the rows where the group belongs, failed open, and showed the remark.
    expect(probe().getFieldSnapshot(['remark']).visible).toBe(false)
  })

  test('a group holding nothing yet is read as the group, not as no rows', () => {
    // With nothing stored there is nothing to read back, and the group was left as an empty list,
    // so even `has(order.note)` could not be evaluated, and the remark showed on every untouched form.
    const engine = createFormEngine({ schema: order, capabilities: FIXED_CLOCK })

    expect(engine.getFieldSnapshot(['remark']).visible).toBe(false)
  })

  test('control: a target at the top level is read back as it was written', () => {
    // Passed before the fix as after. The group is re-read whole from the store; at the top level
    // that is the value just written, so a rule after it reads what it read before.
    const engine = createFormEngine({
      schema: form(
        [
          { key: 'zip', type: 'text' },
          { key: 'label', type: 'text' },
        ],
        [
          { target: 'zip', kind: 'computed', cel: '"3000"' },
          { target: 'label', kind: 'computed', cel: '"PLZ " + zip' },
        ],
      ),
      capabilities: FIXED_CLOCK,
    })

    expect(engine.getFieldSnapshot(['label']).value).toBe('PLZ 3000')
  })

  test('control: a repeater at the top level is read back as its rows, or as none', () => {
    // Passed before the fix as after. A rule after the row rules reads the rows as just written,
    // and a repeater handed null, which validation takes for no rows, as none: read as null, the
    // count could not be evaluated and a visible rule reading its size would show its field.
    const lines = form(
      [
        { key: 'note', type: 'text' },
        {
          key: 'lines',
          type: 'repeater',
          fields: [
            { key: 'qty', type: 'number' },
            { key: 'twice', type: 'number' },
            { key: 'label', type: 'text' },
          ],
        },
        { key: 'count', type: 'number' },
      ],
      [
        { target: 'lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' },
        { target: 'lines[].label', kind: 'computed', cel: 'note + " " + string(item.twice)' },
        { target: 'count', kind: 'computed', cel: 'size(lines) == 0 ? 0.0 : lines[0].twice' },
      ],
    )
    const engine = (initialValue: unknown) => createFormEngine({ schema: lines, capabilities: FIXED_CLOCK, initialValue })

    const filled = engine({ note: 'Probe', lines: [{ qty: 2 }] })
    expect(filled.getFieldSnapshot(['lines', 0, 'label']).value).toBe('Probe 4')
    expect(filled.getFieldSnapshot(['count']).value).toBe(4)
    expect(engine({ note: 'Probe', lines: null }).getFieldSnapshot(['count']).value).toBe(0)
    expect(engine({ note: 'Probe' }).getFieldSnapshot(['count']).value).toBe(0)
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
