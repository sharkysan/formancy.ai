import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

/**
 * A field a `computed` rule writes is drawn read-only.
 *
 * It was drawn as an ordinary control, so a person could type into a total the engine
 * would either overwrite at once or — while an input it reads was empty — keep as typed.
 * The engine now refuses the value, and says the field is read-only on its snapshot; these
 * cases hold the control to saying so too, with `readonly` rather than `disabled`, which
 * would take the value out of the tab order and grey out a number meant to be read (0181).
 *
 * Near-copied from the React binding's `computed-field.test.tsx`, case for case: the
 * conformance driver reads values, not attributes, so this is where the two are compared.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const CLOCK = { now: () => 0, today: () => '2026-10-07', random: () => 0.5 }

async function mount(fields: FieldDef[], rules: FormSchema['logic'], initialValue?: unknown): Promise<void> {
  const schema: FormSchema = {
    specVersion: '2',
    id: 'quote',
    title: 'Quote',
    model: { fields },
    ...(rules === undefined ? {} : { logic: rules }),
  }
  const engine = createFormEngine({
    schema,
    capabilities: CLOCK,
    ...(initialValue === undefined ? {} : { initialValue }),
  })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
}

// The first render compiles the form and everything the registry pulls in; charged here
// rather than to whichever case happens to be written first.
beforeAll(async () => {
  await mount([{ key: 'warm', type: 'text', label: 'Warm' }], undefined)
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const control = (name: string): HTMLInputElement => screen.getByLabelText<HTMLInputElement>(name)

describe('a computed field', () => {
  // The reported case: "Total, CHF" drawn as an ordinary number input, typed into.
  test('is read-only and stays in the tab order, and the fields it reads are not', async () => {
    await mount(
      [
        { key: 'qty', type: 'number', label: 'Quantity' },
        { key: 'price', type: 'number', label: 'Unit price' },
        { key: 'total', type: 'number', label: 'Total, CHF' },
      ],
      { rules: [{ target: 'total', kind: 'computed', cel: 'qty * price' }] },
    )

    expect(control('Total, CHF').readOnly).toBe(true)
    expect(control('Total, CHF').disabled).toBe(false)
    expect(control('Quantity').readOnly).toBe(false)
  })

  // Every control with a read-only state of its own. One left out is a control a
  // person types into and watches the engine take the typing back.
  test.each([
    ['text', "'fixed'"],
    ['textarea', "'fixed'"],
    ['number', '1.0'],
    ['date', "'2026-10-07'"],
    ['time', "'09:30'"],
    ['datetime', "'2026-10-07T09:30:00Z'"],
  ] as const)('drawn by the %s control is read-only', async (type, cel) => {
    await mount([{ key: 'answer', type, label: 'Answer' }], {
      rules: [{ target: 'answer', kind: 'computed', cel }],
    })

    expect(control('Answer').readOnly).toBe(true)
  })

  // The React binding's case. Here the ticked box stayed ticked over the engine's `false`, since
  // a bound value is written only when it changes (A3); drawn as its answer in words, in a
  // read-only box, there is nothing to tick (0216).
  test.each([
    ['checkbox', 'true', {}, 'Yes'],
    [
      'select',
      "'hi'",
      {
        options: [
          { value: 'lo', label: 'Low' },
          { value: 'hi', label: 'High' },
        ],
      },
      'High',
    ],
    [
      'radio',
      "'lo'",
      {
        options: [
          { value: 'lo', label: 'Low' },
          { value: 'hi', label: 'High' },
        ],
      },
      'Low',
    ],
  ] as const)('drawn by the %s control says its answer in words, read-only', async (type, cel, more, said) => {
    await mount([{ key: 'answer', type, label: 'Answer', ...more } as FieldDef], {
      rules: [{ target: 'answer', kind: 'computed', cel }],
    })

    expect(screen.getByRole('textbox', { name: 'Answer' })).toBe(control('Answer'))
    expect(control('Answer').value).toBe(said)
    expect(control('Answer').readOnly).toBe(true)
    expect(control('Answer').disabled).toBe(false)
  })

  // A row rule names the member once for every row, so each row's control is read-only,
  // and a member no rule writes is not.
  test('in a row is read-only in every row', async () => {
    await mount(
      [
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          fields: [
            { key: 'amount', type: 'number', label: 'Amount' },
            { key: 'lineTotal', type: 'number', label: 'Line total' },
          ],
        },
      ],
      { rules: [{ target: 'items[].lineTotal', kind: 'computed', cel: 'item.amount * 2.0' }] },
      { items: [{ amount: 1.0 }, { amount: 2.0 }] },
    )

    const totals = screen.getAllByLabelText<HTMLInputElement>('Line total')
    expect(totals).toHaveLength(2)
    expect(totals.every((input) => input.readOnly)).toBe(true)
    expect(screen.getAllByLabelText<HTMLInputElement>('Amount').some((input) => input.readOnly)).toBe(false)
  })

  // A rule may write a whole repeater. Its rows' fields said they were not read-only, and the rows
  // had no ids to be drawn by, so drawing one threw (0218). Each row's answers are drawn read-only,
  // a tick box as its answer in words, and nothing adds, removes or moves a row.
  test('as a whole repeater is read-only in every row, with nothing to add, remove or move one', async () => {
    await mount(
      [
        {
          key: 'doses',
          type: 'repeater',
          label: 'Doses',
          fields: [
            { key: 'drug', type: 'text', label: 'Drug' },
            { key: 'given', type: 'checkbox', label: 'Given' },
          ],
        },
      ],
      {
        rules: [
          {
            target: 'doses',
            kind: 'computed',
            cel: "[{'drug': dyn('A'), 'given': dyn(true)}, {'drug': dyn('B'), 'given': dyn(false)}]",
          },
        ],
      },
    )

    const drugs = screen.getAllByLabelText<HTMLInputElement>('Drug')
    expect(drugs.map((input) => [input.value, input.readOnly])).toEqual([
      ['A', true],
      ['B', true],
    ])
    const given = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Given' })
    expect(given.map((input) => [input.value, input.readOnly])).toEqual([
      ['Yes', true],
      ['No', true],
    ])
    expect(screen.queryAllByRole('button', { name: /^(add|remove|move) /i })).toEqual([])
  })
})
