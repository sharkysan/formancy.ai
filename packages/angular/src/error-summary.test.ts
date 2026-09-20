import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyErrorSummary, FormancyForm, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', required: true },
      { key: 'name', type: 'text', label: 'Name', required: true },
    ],
  },
}

@Component({
  selector: 'formancy-test-summary-host',
  imports: [FormancyErrorSummary, FormancyForm],
  template: `
    <formancy-error-summary />
    <formancy-form />
  `,
})
class SummaryHost {}

async function renderHost(engine: FormEngine) {
  const view = await render(SummaryHost, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
  return view
}

describe('FormancyErrorSummary', () => {
  test('renders nothing while the form is clean', async () => {
    await renderHost(createFormEngine({ schema }))

    expect(document.querySelector('[data-formancy-part="error-summary"]')).toBeNull()
  })

  test('when errors appear it lists them as in-page links and focuses itself once', async () => {
    const engine = createFormEngine({ schema })
    const view = await renderHost(engine)

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await view.fixture.whenStable()

    const summary = document.querySelector('[data-formancy-part="error-summary"]')
    expect(summary).not.toBeNull()
    // Focusing the container already announces it; role=alert would announce
    // it TWICE, so its absence is part of the contract.
    expect(summary?.getAttribute('role')).toBeNull()
    expect(document.activeElement).toBe(summary)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]?.textContent).toBe('email: required')
    const controlId = engine.getFieldSnapshot(['email']).ids.control
    expect(links[0]?.getAttribute('href')).toBe(`#${controlId}`)

    // The link takes the user to the problem: hash alone scrolls but does not
    // focus, so the click handler must do both.
    fireEvent.click(links[0] as HTMLElement)
    await view.fixture.whenStable()
    expect(document.activeElement).toBe(document.getElementById(controlId))
  })

  test('editing an already-broken field never re-steals focus', async () => {
    const engine = createFormEngine({ schema })
    const view = await renderHost(engine)

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await view.fixture.whenStable()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'x' } })
    await view.fixture.whenStable()
    const emailControl = screen.getByLabelText('Email')
    emailControl.focus()

    fireEvent.input(emailControl, { target: { value: '' } })
    await view.fixture.whenStable()

    expect(document.activeElement).toBe(emailControl)
  })
})
