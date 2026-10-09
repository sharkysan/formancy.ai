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
