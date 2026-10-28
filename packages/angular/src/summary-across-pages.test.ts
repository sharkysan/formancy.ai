import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyErrorSummary, FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The React binding's `summary-across-pages.test.tsx`, case for case (0205). */
const CLOCK = { now: () => 0, today: () => '2026-10-28', random: () => 0.5 }

const form: FormSchema = {
  specVersion: '5',
  id: 'call',
  title: 'Call',
  model: {
    fields: [
      { key: 'you', type: 'page', label: 'You', fields: [{ key: 'phone', type: 'text', label: 'Phone' }] },
      {
        key: 'how',
        type: 'page',
        label: 'How',
        fields: [
          { key: 'call', type: 'checkbox', label: 'Call me' },
          { key: 'when', type: 'text', label: 'When', required: true },
        ],
      },
    ],
  },
  logic: { rules: [{ target: 'phone', kind: 'required', cel: 'call == true' }] },
}

@Component({
  selector: 'formancy-test-summary-pages-host',
  imports: [FormancyErrorSummary, FormancyForm],
  template: `
    <formancy-error-summary />
    <formancy-form />
  `,
})
class Host {}

describe('the error summary on a paged form', () => {
  test('takes a link to a question on another page to that page, and focuses it', async () => {
    const view = await render(Host, {
      providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema: form, capabilities: CLOCK }))],
    })
    const settle = async (): Promise<void> => {
      await view.fixture.whenStable()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Call me' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await screen.findByRole('textbox', { name: 'Phone' })
    await settle()

    fireEvent.click(screen.getByRole('link', { name: /^When/ }))
    await settle()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'When' }))

    fireEvent.click(screen.getByRole('link', { name: /^Phone/ }))
    await settle()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Phone' }))
  })
})
