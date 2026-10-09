import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createBuilderSession, fixedCapabilities } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { RulesOverview } from './rules-overview.js'

/**
 * The overview a person reads, in React (0128). What it says is builder-core's and is
 * tested there against the engine; these cases are about what reaches the screen.
 */
afterEach(cleanup)

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

describe('the rules overview', () => {
  test('lists every rule under the field it is about, in words', () => {
    render(<RulesOverview session={createBuilderSession(form)} />)

    expect(screen.getByRole('heading', { name: 'Canton' })).toBeTruthy()
    expect(screen.getByText('Country is Switzerland')).toBeTruthy()
    // Without a preview's answers there is nothing to explain, and it does not try.
    expect(document.querySelector('[data-formancy-part="rules-overview-now"]')).toBeNull()
  })

  test('and given the answers a preview holds, says what each rule does now and why', () => {
    render(
      <RulesOverview
        session={createBuilderSession(form)}
        answers={{ country: 'DE' }}
        capabilities={clock}
      />,
    )

    expect(screen.getByText('Hidden now.')).toBeTruthy()
    expect(screen.getByText('Country is Switzerland: no — it is Germany')).toBeTruthy()
  })

  test('and says so when the form has no rules at all', () => {
    const plain = { ...form, logic: { rules: [] } } as FormSchema
    render(<RulesOverview session={createBuilderSession(plain)} />)

    expect(
      screen.getByText('This form has no rules: every field always behaves the same way.'),
    ).toBeTruthy()
  })
})

describe('a rule in a repeater row', () => {
  /**
   * One verdict per row. The overview gave such a rule none, since evaluated against
   * the form as a whole it reads an `item` that is not there — so an author looking
   * at a note required in one recipient's row and not another's had no reason shown.
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

  const rowsSaid = (): string[] =>
    [
      ...document.querySelectorAll(
        '[data-formancy-part="rules-overview-rows"] [data-formancy-part="rules-overview-now"] > p',
      ),
    ].map((line) => line.textContent ?? '')

  test('says, row by row, what it does now and why', () => {
    render(
      <RulesOverview
        session={createBuilderSession(rowForm)}
        answers={{ recipients: [{ amount: 50 }, { amount: 1200 }] }}
        capabilities={clock}
      />,
    )

    expect(rowsSaid()).toEqual(['Row 1 Not required now.', 'Row 2 Required now.'])
    expect(screen.getByText('Amount in this row is at least 1000: no — it is 50')).toBeTruthy()
    expect(screen.getByText('Amount in this row is at least 1000: yes')).toBeTruthy()
  })

  test('and with no rows in the preview, says there is nothing to decide', () => {
    render(<RulesOverview session={createBuilderSession(rowForm)} answers={{}} capabilities={clock} />)

    expect(rowsSaid()).toEqual([])
    expect(screen.getByText('No rows in the preview yet, so there is nothing to decide.')).toBeTruthy()
  })
})
