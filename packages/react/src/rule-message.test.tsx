import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { ErrorSummary, FormancyForm, FormancyProvider, useSubmit } from './index.js'

afterEach(cleanup)

/**
 * A rule's own message on screen (0198): said under the field and in the error summary in the
 * form's language, where the code used to be shown as itself.
 */
const CLOCK = { now: () => 0, today: () => '2026-10-27', random: () => 0.5 }

const form: FormSchema = {
  specVersion: '5',
  id: 'trip',
  title: 'Trip',
  i18n: {
    defaultLocale: 'en',
    messages: {
      en: { 'age.adult': 'Travellers must be 18 or older.' },
      de: { 'age.adult': 'Reisende müssen mindestens 18 sein.' },
    },
  },
  model: { fields: [{ key: 'age', type: 'number', label: 'Age' }] },
  logic: { rules: [{ target: 'age', kind: 'validate', cel: 'age >= 18', code: 'adult', message: { $t: 'age.adult' } }] },
}

function Submit() {
  const submit = useSubmit()
  return <button onClick={() => submit()}>send</button>
}

const mount = (locale?: string) => {
  const engine = createFormEngine({ schema: form, capabilities: CLOCK, initialValue: { age: 12 }, ...(locale === undefined ? {} : { locale }) })
  render(
    <FormancyProvider engine={engine}>
      <ErrorSummary />
      <FormancyForm />
      <Submit />
    </FormancyProvider>,
  )
  return engine
}

describe('a rule’s message', () => {
  test('is said under the field and in the summary, never the code', () => {
    mount()
    fireEvent.click(screen.getByText('send'))
    expect(screen.getAllByText(/Travellers must be 18 or older\./)).toHaveLength(2)
    expect(screen.queryByText(/\badult\b/)).toBeNull()
  })

  test('is said in the form’s language', () => {
    mount('de')
    fireEvent.click(screen.getByText('send'))
    expect(screen.getAllByText(/Reisende müssen mindestens 18 sein\./)).toHaveLength(2)
  })
})
