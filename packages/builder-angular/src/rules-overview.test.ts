import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createBuilderSession, fixedCapabilities } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyRulesOverview } from './rules-overview'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.replaceChildren()
})

/** The cases React's overview is held to, near-copied on purpose (0128). */
const form: FormSchema = {
  specVersion: '4',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'country',
        type: 'radio',
        label: 'Country',
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      { key: 'canton', type: 'text', label: 'Canton' },
    ],
  },
  logic: {
    rules: [
      {
        target: 'canton',
        kind: 'visible',
        cel: 'country == "CH"',
        editor: {
          join: 'all',
          conditions: [{ field: 'country', operator: 'is', value: 'CH', answer: 'choice' }],
        },
      },
    ],
  },
} as FormSchema

const clock = fixedCapabilities({ nowMs: 0, today: '2026-10-09', random: 0.5 })

const mount = async (inputs: Record<string, unknown>) => {
  const view = await render(FormancyRulesOverview, {
    componentInputs: inputs,
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()
}

describe('the rules overview', () => {
  test('lists every rule under the field it is about, in words', async () => {
    await mount({ session: createBuilderSession(form) })

    expect(screen.getByRole('heading', { name: 'Canton' })).toBeTruthy()
    expect(screen.getByText(/Country is Switzerland/)).toBeTruthy()
    expect(document.querySelector('[data-formancy-part="rules-overview-now"]')).toBeNull()
  })

  test('and given the answers a preview holds, says what each rule does now and why', async () => {
    await mount({
      session: createBuilderSession(form),
      answers: { country: 'DE' },
      capabilities: clock,
    })

    expect(screen.getByText('Hidden now.')).toBeTruthy()
    expect(screen.getByText('Country is Switzerland: no — it is Germany')).toBeTruthy()
  })

  test('and says so when the form has no rules at all', async () => {
    await mount({ session: createBuilderSession({ ...form, logic: { rules: [] } } as FormSchema) })

    expect(
      screen.getByText('This form has no rules: every field always behaves the same way.'),
    ).toBeTruthy()
  })
})

describe('a rule in a repeater row', () => {
  /**
   * One verdict per row, as in the React overview: such a rule had none, since
   * evaluated against the form as a whole it reads an `item` that is not there.
   */
  const rowForm = {
    specVersion: '4',
    id: 'gifts',
    title: 'Gifts',
    model: {
      fields: [
        {
          key: 'recipients',
          type: 'repeater',
          label: 'Recipients',
          fields: [
            { key: 'amount', type: 'number', label: 'Amount' },
            { key: 'note', type: 'text', label: 'Note' },
          ],
        },
      ],
    },
    logic: {
      rules: [
        {
          target: 'recipients[].note',
          kind: 'required',
          cel: 'item.amount != null && item.amount >= 1000.0',
          editor: {
            join: 'all',
            conditions: [
              { field: 'recipients[].amount', operator: 'isAtLeast', value: 1000, answer: 'number' },
            ],
          },
        },
      ],
    },
  } as FormSchema

  /** Each row's line, its label and effect, with Angular's template whitespace folded. */
  const rowsSaid = (): string[] =>
    [
      ...document.querySelectorAll(
        '[data-formancy-part="rules-overview-rows"] [data-formancy-part="rules-overview-now"] > p',
      ),
    ].map((line) => (line.textContent ?? '').replace(/\s+/g, ' ').trim())

  test('says, row by row, what it does now and why', async () => {
    await mount({
      session: createBuilderSession(rowForm),
      answers: { recipients: [{ amount: 50 }, { amount: 1200 }] },
      capabilities: clock,
    })

    expect(rowsSaid()).toEqual(['Row 1 Not required now.', 'Row 2 Required now.'])
    expect(screen.getByText('Amount in this row is at least 1000: no — it is 50')).toBeTruthy()
    expect(screen.getByText('Amount in this row is at least 1000: yes')).toBeTruthy()
  })

  test('and with no rows in the preview, says there is nothing to decide', async () => {
    await mount({ session: createBuilderSession(rowForm), answers: {}, capabilities: clock })

    expect(rowsSaid()).toEqual([])
    expect(screen.getByText('No rows in the preview yet, so there is nothing to decide.')).toBeTruthy()
  })
})
