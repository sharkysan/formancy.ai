import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, fireEvent } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { injectField, injectSubmit, provideFormancy } from './index'

type Outcome = { ok: boolean; errors: Record<string, string[]> }

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const schema: FormSchema = {
  specVersion: '0',
  id: 'contact',
  title: 'Contact',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email', required: true }] },
}

@Component({
  selector: 'formancy-test-submit',
  template: `
    <input [id]="field.snapshot().ids.control" aria-label="Email" />
    <button type="button" (click)="outcome = submit()">Go</button>
  `,
})
class SubmitHost {
  readonly field = injectField('email')
  readonly submit = injectSubmit()
  outcome: Outcome | undefined
}

@Component({
  selector: 'formancy-test-submit-with-summary',
  template: `
    <div data-formancy-part="error-summary" tabindex="-1"></div>
    <input [id]="field.snapshot().ids.control" aria-label="Email" />
    <button type="button" (click)="outcome = submit()">Go</button>
  `,
})
class SubmitHostWithSummary {
  readonly field = injectField('email')
  readonly submit = injectSubmit()
  outcome: Outcome | undefined
}

async function renderHost(component: typeof SubmitHost | typeof SubmitHostWithSummary, engine: FormEngine) {
  const view = await render(component, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  return view
}

describe('injectSubmit', () => {
  test('a failed submit reports the errors and focuses the first invalid control', async () => {
    const view = await renderHost(SubmitHost, createFormEngine({ schema }))

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    await view.fixture.whenStable()

    const host = view.fixture.componentInstance as SubmitHost
    expect(host.outcome).toMatchObject({ ok: false, errors: { email: ['required'] } })
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
  })

  test('an error summary takes precedence: it focuses itself, so submit must not steal focus', async () => {
    const view = await renderHost(SubmitHostWithSummary, createFormEngine({ schema }))

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    await view.fixture.whenStable()

    expect(document.activeElement).not.toBe(screen.getByLabelText('Email'))
  })

  test('a valid form submits ok', async () => {
    const view = await renderHost(
      SubmitHost,
      createFormEngine({ schema, initialValue: { email: 'ada@example.com' } }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    await view.fixture.whenStable()

    const host = view.fixture.componentInstance as SubmitHost
    expect(host.outcome).toMatchObject({ ok: true })
  })
})
