import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import type { FormEngine } from './engine.js'

/**
 * What a repeater is told about its rows, enforced: how many there may be, whether there
 * must be any, and what a rule aimed at it says about them.
 *
 * Found on 2026-10-18 and recorded before it was fixed: the engine validated fields, and a
 * repeater is not one, so every one of these was accepted at publish and evaluated nowhere —
 * in the browser or in the server's replay of the same engine. A submission with more rows
 * than `maxItems`, or none where the repeater was required, was stored, and a `validate` rule
 * aimed at the repeater failed open where validation is meant to fail closed (0022).
 */

const CLOCK = { now: () => 0, today: () => '2026-10-18', random: () => 0.5 }

/** A form with one repeater of fees, whatever the repeater and its row are told. */
function feeForm(
  repeater: Record<string, unknown> = {},
  rules: readonly unknown[] = [],
  row: Record<string, unknown> = {},
  beside: readonly unknown[] = [],
): FormSchema {
  return {
    specVersion: '4',
    id: 'fees',
    title: 'Fees',
    model: {
      fields: [
        ...beside,
        {
          key: 'fees',
          type: 'repeater',
          label: 'Fees',
          ...repeater,
          fields: [{ key: 'amount', type: 'number', label: 'Amount', ...row }],
        },
      ],
    },
    logic: { rules },
  } as unknown as FormSchema
}

/** The server's replay: a submission posted straight at it, with whatever rows it sent. */
function replay(schema: FormSchema, value: unknown) {
  const engine = createFormEngine({ schema, capabilities: CLOCK, mode: 'server', initialValue: value })
  return engine.submit()
}

const rows = (count: number) => Array.from({ length: count }, (_, at) => ({ amount: at + 1 }))

function browser(schema: FormSchema, value?: unknown): FormEngine {
  return createFormEngine({ schema, capabilities: CLOCK, ...(value === undefined ? {} : { initialValue: value }) })
}

describe('a repeater is bounded by its own maxItems', () => {
  test('a submission with more rows than it allows is refused, with the code a list field uses', () => {
    // The defect: four rows on `maxItems: 3` were stored. `maxItems` is the code a
    // `selectboxes` already reports for the same question, so a catalogue words it once.
    expect(replay(feeForm({ maxItems: 3 }), { fees: rows(4) })).toEqual({ ok: false, errors: { fees: ['maxItems'] } })
    expect(replay(feeForm({ maxItems: 3 }), { fees: rows(3) })).toEqual({ ok: true, errors: {} })
  })

  test('the engine adds no row past it, and says so before anybody asks', () => {
    // Both renderers' add buttons called `addRow` and the engine obliged, so a person met the
    // cap — if at all — as an error after adding a row too many. Refused, as a row index that
    // is not a row is refused, so a host calling past it learns at once rather than storing it.
    const engine = browser(feeForm({ maxItems: 2 }))
    expect(engine.canAddRow(['fees'])).toBe(true)
    engine.addRow(['fees'])
    engine.addRow(['fees'])
    expect(engine.canAddRow(['fees'])).toBe(false)
    expect(() => engine.addRow(['fees'])).toThrow(RangeError)
    expect(engine.rowCount(['fees'])).toBe(2)
  })
})

describe('a repeater is not taken below its minItems', () => {
  test('the engine removes no row past it', () => {
    // "How many rows the form opens with and will not go below": nothing held the second
    // half. Under React the last row of a `minItems: 1` repeater went and stayed gone; under
    // Angular a renderer effect put an empty one back — two renderers, two answers (0023).
    const engine = browser(feeForm({ minItems: 1 }))
    expect(engine.rowCount(['fees'])).toBe(1)
    expect(engine.canRemoveRow(['fees'])).toBe(false)
    expect(() => engine.removeRow(['fees'], 0)).toThrow(RangeError)
    expect(engine.rowCount(['fees'])).toBe(1)

    engine.addRow(['fees'])
    expect(engine.canRemoveRow(['fees'])).toBe(true)
    engine.removeRow(['fees'], 1)
    expect(engine.rowCount(['fees'])).toBe(1)
  })

  test('a list written short over the repeater is refused with minItems', () => {
    // Seeding happens once, when the engine is built; a host writing the rows directly
    // afterwards can still leave fewer than the minimum, and nothing said so.
    const engine = browser(feeForm({ minItems: 2 }))
    engine.setValue(['fees'], [{ _id: 'r1', amount: 1 }])
    expect(engine.submit()).toEqual({ ok: false, errors: { fees: ['minItems'] } })
  })

  test('a short submission is topped up as the browser opens it, so a required row still refuses it', () => {
    // The server's replay seeds as the browser does (0023), which is what an honest client
    // with the rows left empty would have sent. The seeded rows are rows like any other: a
    // required answer in them refuses the submission rather than storing empty rows.
    expect(replay(feeForm({ minItems: 2 }, [], { required: true }), { fees: [] })).toEqual({
      ok: false,
      errors: { 'fees[0].amount': ['required'], 'fees[1].amount': ['required'] },
    })
  })
})

describe('a required repeater needs a row', () => {
  test('required on the repeater refuses a submission of no rows', () => {
    // Measured on 2026-10-18 by a server-mode submission of none: accepted. Required on a
    // repeater means at least one row; what a row must hold is said by the fields in it.
    expect(replay(feeForm({ required: true }), {})).toEqual({ ok: false, errors: { fees: ['required'] } })
    expect(replay(feeForm({ required: true }), { fees: [] })).toEqual({ ok: false, errors: { fees: ['required'] } })
    expect(replay(feeForm({ required: true }), { fees: [{}] })).toEqual({ ok: true, errors: {} })
  })

  test('a required rule aimed at the repeater requires a row while it holds', () => {
    // The rule was evaluated, set the repeater's wire required, and nothing read it.
    const schema = feeForm({}, [{ target: 'fees', kind: 'required', cel: 'charged == true' }], {}, [
      { key: 'charged', type: 'checkbox', label: 'Charged' },
    ])
    expect(replay(schema, { charged: true })).toEqual({ ok: false, errors: { fees: ['required'] } })
    expect(replay(schema, { charged: false })).toEqual({ ok: true, errors: {} })
  })
})

describe('a validate rule aimed at a repeater is run', () => {
  test('with the rows as its value, and its own code when it is false', () => {
    // The obvious place for a cap the document cannot express — the repeater — ran nothing,
    // so the rule was accepted at publish and the rows it forbade were stored.
    const cap = [{ target: 'fees', kind: 'validate', cel: 'size(fees) <= 3', code: 'tooManyFees' }]
    expect(replay(feeForm({}, cap), { fees: rows(4) })).toEqual({ ok: false, errors: { fees: ['tooManyFees'] } })
    expect(replay(feeForm({}, cap), { fees: rows(3) })).toEqual({ ok: true, errors: {} })
  })

  test('and closed when it cannot be evaluated', () => {
    // 0022 for a repeater: a rule that errors cannot vouch for the rows. Reading a row that
    // is not there is the runtime failure here.
    const reads = [{ target: 'fees', kind: 'validate', cel: 'fees[0].amount > 0.0' }]
    expect(replay(feeForm({}, reads), {})).toEqual({ ok: false, errors: { fees: ['invalid'] } })
  })
})

describe('a repeater value of the wrong shape is refused', () => {
  test('a scalar or an object where the rows belong', () => {
    // Without a `minItems` to seed over it, a string posted where the rows belong was
    // stored verbatim: the engine walked it as no rows and validated nothing.
    expect(replay(feeForm(), { fees: 'junk' })).toEqual({ ok: false, errors: { fees: ['type'] } })
    expect(replay(feeForm(), { fees: { amount: 1 } })).toEqual({ ok: false, errors: { fees: ['type'] } })
  })
})

describe('a hidden repeater is not part of the conversation (0013)', () => {
  const shown = (repeater: Record<string, unknown>) =>
    feeForm({ required: true, maxItems: 1, ...repeater }, [{ target: 'fees', kind: 'visible', cel: 'charged == true' }], { required: true }, [
      { key: 'charged', type: 'checkbox', label: 'Charged' },
    ])

  test('neither it nor its rows are validated while a rule hides it', () => {
    // Kept with clearOnHide off, so there are rows to validate: a hidden field contributes no
    // errors, and a hidden repeater's rows are no different. Its `clearOnHide` was read from
    // nothing — the lookup knew only leaf fields — so the rows were always cleared.
    const engine = browser(shown({ clearOnHide: false }), { charged: true, fees: [{}, {}] })
    engine.setValue(['charged'], false)
    expect(engine.rowCount(['fees'])).toBe(2)
    expect(engine.submit()).toEqual({ ok: true, errors: {} })
    expect(engine.getFieldSnapshot(['fees']).visible).toBe(false)
    expect(engine.getFieldSnapshot(['fees', 0, 'amount']).visible).toBe(false)
  })

  test('cleared by default, and opened again with its minimum when it comes back', () => {
    // A repeater that promises a row and returns from hiding with none would meet the person
    // with an error for a row they never removed.
    const engine = browser(shown({ required: false, minItems: 1 }), { charged: true })
    expect(engine.rowCount(['fees'])).toBe(1)
    engine.setValue(['charged'], false)
    expect(engine.rowCount(['fees'])).toBe(0)
    engine.setValue(['charged'], true)
    expect(engine.rowCount(['fees'])).toBe(1)
  })

  test('nor on a page the answers walk past', () => {
    // A skipped page hid the repeater's own wire and none of its rows, so a required answer
    // in a row on a page nobody saw refused the form — the thing 0087 exists to prevent.
    const schema = {
      specVersion: '4',
      id: 'paged',
      title: 'Paged',
      model: {
        fields: [
          { key: 'first', type: 'page', fields: [{ key: 'charged', type: 'checkbox', label: 'Charged' }] },
          { key: 'second', type: 'page', fields: [feeForm({ minItems: 1, required: true }, [], { required: true }).model.fields[0]] },
        ],
      },
      logic: { rules: [{ target: 'second', kind: 'skip', cel: 'charged != true' }] },
    } as unknown as FormSchema
    expect(replay(schema, {})).toEqual({ ok: true, errors: {} })
    expect(replay(schema, { charged: true })).toEqual({ ok: false, errors: { 'fees[0].amount': ['required'] } })
  })

  test('nor inside a group a rule hides', () => {
    // What a rule hides it hides whole. Kept with clearOnHide off on the group, which the
    // lookup also could not see, so the rows are there to be wrongly validated.
    const schema = {
      specVersion: '4',
      id: 'grouped',
      title: 'Grouped',
      model: {
        fields: [
          { key: 'charged', type: 'checkbox', label: 'Charged' },
          {
            key: 'billing',
            type: 'group',
            label: 'Billing',
            clearOnHide: false,
            fields: [
              { key: 'reference', type: 'text', label: 'Reference', required: true },
              feeForm({ required: true, maxItems: 1 }, [], { required: true }).model.fields[0],
            ],
          },
        ],
      },
      logic: { rules: [{ target: 'billing', kind: 'visible', cel: 'charged == true' }] },
    } as unknown as FormSchema
    const value = { billing: { fees: [{}, {}] } }
    expect(replay(schema, value)).toEqual({ ok: true, errors: {} })
    expect(replay(schema, { ...value, charged: true })).toEqual({
      ok: false,
      errors: {
        'billing.reference': ['required'],
        'billing.fees': ['maxItems'],
        'billing.fees[0].amount': ['required'],
        'billing.fees[1].amount': ['required'],
      },
    })

    const engine = browser(schema, value)
    expect(engine.getFieldSnapshot(['billing', 'reference']).visible).toBe(false)
    engine.setValue(['charged'], true)
    expect(engine.getFieldSnapshot(['billing', 'reference']).visible).toBe(true)
    expect(engine.getFieldSnapshot(['billing', 'fees', 0, 'amount']).visible).toBe(true)
  })
})

describe('a disabled repeater keeps its rows and is still checked', () => {
  test('its rows are disabled with it, and its bounds still hold', () => {
    // A disabled field keeps its answer and is validated; a repeater a rule disabled left
    // every row editable, because nothing below the repeater's own wire read the rule.
    const schema = feeForm({ maxItems: 1 }, [{ target: 'fees', kind: 'disabled', cel: 'locked == true' }], {}, [
      { key: 'locked', type: 'checkbox', label: 'Locked' },
    ])
    const engine = browser(schema, { locked: true, fees: [{}, {}] })
    expect(engine.getFieldSnapshot(['fees']).disabled).toBe(true)
    expect(engine.getFieldSnapshot(['fees', 0, 'amount']).disabled).toBe(true)
    expect(engine.submit().errors).toEqual({ fees: ['maxItems'] })
    engine.setValue(['locked'], false)
    expect(engine.getFieldSnapshot(['fees', 0, 'amount']).disabled).toBe(false)
  })
})

describe('a repeater carries a snapshot, as a field does', () => {
  test('its label, its requiredness and, once submitted, its errors — named where a summary reads them', () => {
    // A renderer draws a field's error from its snapshot and the error summary names it by
    // the snapshot's label (#196). A repeater had no snapshot at all, so an error on it
    // would have had nowhere to be drawn and nothing to be called.
    const engine = browser(feeForm({ required: true }))
    const before = engine.getFieldSnapshot(['fees'])
    expect(before).toMatchObject({ type: 'repeater', label: 'Fees', required: true, visible: true, errors: [] })

    expect(engine.submit().ok).toBe(false)
    const after = engine.getFieldSnapshot(['fees'])
    expect(after).toMatchObject({ touched: true, errors: ['required'] })
    // A fieldset, so required is said in its description rather than as aria-required.
    expect(after.props.control['aria-required']).toBeUndefined()
    expect(after.props.control['aria-describedby']).toBe(`${after.ids.hint} ${after.ids.error}`)
    expect(engine.visibleErrors()).toEqual([{ path: 'fees', codes: ['required'] }])
    expect(engine.firstInvalid()).toBe('fees')

    engine.addRow(['fees'])
    expect(engine.getFieldSnapshot(['fees']).errors).toEqual([])
  })

  test('a wizard page does not go on past a repeater short of what it needs', async () => {
    // Next validates the page's own fields; without the repeater among them, a page could
    // be left with no rows in a required repeater and the person would learn so at the end.
    const schema = {
      specVersion: '4',
      id: 'paged',
      title: 'Paged',
      model: {
        fields: [
          { key: 'first', type: 'page', fields: [feeForm({ required: true }).model.fields[0]] },
          { key: 'second', type: 'page', fields: [{ key: 'note', type: 'text', label: 'Note' }] },
        ],
      },
    } as unknown as FormSchema
    const engine = browser(schema)
    await expect(engine.wizard()!.next()).resolves.toBe(false)
    expect(engine.getFieldSnapshot(['fees']).touched).toBe(true)
    engine.addRow(['fees'])
    await expect(engine.wizard()!.next()).resolves.toBe(true)
  })
})
