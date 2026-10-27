import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyErrorSummary, FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The React binding's `rule-message.test.tsx`, case for case (0198). */
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

@Component({
  selector: 'formancy-test-rule-message-host',
  imports: [FormancyErrorSummary, FormancyForm],
  template: `
    <formancy-error-summary />
    <formancy-form />
  `,
})
class Host {}

async function mount(locale?: string): Promise<void> {
  const engine = createFormEngine({ schema: form, capabilities: CLOCK, initialValue: { age: 12 }, ...(locale === undefined ? {} : { locale }) })
  const view = await render(Host, { providers: [provideZonelessChangeDetection(), provideFormancy(engine)] })
  engine.submit()
  await view.fixture.whenStable()
}

describe('a rule’s message', () => {
  test('is said under the field and in the summary, never the code', async () => {
    await mount()
    expect(screen.getAllByText(/Travellers must be 18 or older\./)).toHaveLength(2)
    expect(screen.queryByText(/\badult\b/)).toBeNull()
  })

  test('is said in the form’s language', async () => {
    await mount('de')
    expect(screen.getAllByText(/Reisende müssen mindestens 18 sein\./)).toHaveLength(2)
  })
})
