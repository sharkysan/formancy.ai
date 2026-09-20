import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import {
  FormancyForm,
  injectFieldContext,
  provideFormancy,
  provideFormancyRegistry,
} from './index'
import type { SubmitOutcome } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

function flatSchema(fields: FormSchema['model']['fields']): FormSchema {
  return { specVersion: '1', id: 'test', title: 'Test', model: { fields } }
}

async function renderForm(engine: FormEngine, options?: Parameters<typeof render>[1]) {
  const view = await render(FormancyForm, {
    ...options,
    providers: [provideZonelessChangeDetection(), provideFormancy(engine), ...(options?.providers ?? [])],
  })
  await view.fixture.whenStable()
  return view
}

describe('FormancyForm', () => {
  test('renders a labelled text control wired to the engine', async () => {
    const engine = createFormEngine({
      schema: flatSchema([{ key: 'email', type: 'text', label: 'Email' }]),
    })
    await renderForm(engine)

    const control = screen.getByLabelText('Email')
    fireEvent.input(control, { target: { value: 'ada@example.com' } })

    expect(engine.getFieldSnapshot(['email']).value).toBe('ada@example.com')
  })

  test('a hidden field leaves the DOM entirely, and returns when shown', async () => {
    const engine = createFormEngine({
      schema: {
        ...flatSchema([
          { key: 'ship', type: 'checkbox', label: 'Ship it' },
          { key: 'notes', type: 'text', label: 'Notes' },
        ]),
        logic: { rules: [{ target: 'notes', kind: 'visible', cel: 'ship == true' }] },
      },
      capabilities: { now: () => 0, today: () => '2026-01-01', random: () => 0 },
    })
    const view = await renderForm(engine)

    expect(screen.queryByLabelText('Notes')).toBeNull()

    fireEvent.click(screen.getByLabelText('Ship it'))
    await view.fixture.whenStable()

    expect(screen.getByLabelText('Notes')).toBeTruthy()
  })

  test('a select carries a leading empty option and writes through to the engine', async () => {
    const engine = createFormEngine({
      schema: flatSchema([
        {
          key: 'country',
          type: 'select',
          label: 'Country',
          options: [
            { value: 'CH', label: 'Switzerland' },
            { value: 'US', label: 'United States' },
          ],
        },
      ]),
    })
    await renderForm(engine)

    const select = screen.getByLabelText('Country') as HTMLSelectElement
    // The empty option is the unanswered state; without it the browser
    // silently pre-selects the first real option.
    expect(select.options[0]?.value).toBe('')
    expect(select.value).toBe('')

    fireEvent.change(select, { target: { value: 'CH' } })

    expect(engine.getFieldSnapshot(['country']).value).toBe('CH')
  })

  test('a radio group is a fieldset with a legend and labelled options', async () => {
    const engine = createFormEngine({
      schema: flatSchema([
        {
          key: 'size',
          type: 'radio',
          label: 'Size',
          options: [
            { value: 's', label: 'Small' },
            { value: 'l', label: 'Large' },
          ],
        },
      ]),
    })
    await renderForm(engine)

    const group = screen.getByRole('group', { name: 'Size' })
    fireEvent.click(within(group).getByLabelText('Large'))

    expect(engine.getFieldSnapshot(['size']).value).toBe('l')
  })

  test('error codes render joined as the aria-describedby target once the field is touched', async () => {
    const engine = createFormEngine({
      schema: flatSchema([{ key: 'email', type: 'text', label: 'Email', required: true }]),
    })
    const view = await renderForm(engine)

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await view.fixture.whenStable()

    const control = screen.getByLabelText('Email')
    const describedBy = control.getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(describedBy as string)?.textContent).toBe('required')
    expect(control.getAttribute('aria-invalid')).toBe('true')
  })

  test('the registry resolves per-path over per-type over the defaults', async () => {
    @Component({
      selector: 'formancy-test-by-type',
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<p>by-type {{ context.path }}</p>`,
    })
    class ByType {
      protected readonly context = injectFieldContext()
    }

    @Component({
      selector: 'formancy-test-by-path',
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<p>by-path {{ context.path }}</p>`,
    })
    class ByPath {
      protected readonly context = injectFieldContext()
    }

    const engine = createFormEngine({
      schema: flatSchema([
        { key: 'first', type: 'text', label: 'First' },
        { key: 'second', type: 'text', label: 'Second' },
      ]),
    })
    const view = await renderForm(engine, {
      providers: [
        provideFormancyRegistry({ byType: { text: ByType }, byPath: { first: ByPath } }),
      ],
    })
    await view.fixture.whenStable()

    expect(screen.getByText('by-path first')).toBeTruthy()
    expect(screen.getByText('by-type second')).toBeTruthy()
  })

  test('a paged schema renders a stepper, Next/Back, and Submit only on the last page', async () => {
    const engine = createFormEngine({
      schema: flatSchema([
        {
          key: 'one',
          type: 'page',
          label: 'Step one',
          fields: [{ key: 'name', type: 'text', label: 'Name' }],
        },
        {
          key: 'two',
          type: 'page',
          label: 'Step two',
          fields: [{ key: 'confirm', type: 'checkbox', label: 'Confirm' }],
        },
      ]),
    })
    const view = await renderForm(engine)

    const current = () => document.querySelector('[aria-current="step"]')?.textContent?.trim()
    expect(current()).toBe('Step one')
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await view.fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await view.fixture.whenStable()

    expect(current()).toBe('Step two')
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await view.fixture.whenStable()

    expect(current()).toBe('Step one')
  })

  test('a failed submit navigates to the first page with a problem', async () => {
    const engine = createFormEngine({
      schema: {
        ...flatSchema([
          {
            key: 'one',
            type: 'page',
            label: 'Step one',
            fields: [{ key: 'company', type: 'text', label: 'Company' }],
          },
          {
            key: 'two',
            type: 'page',
            label: 'Step two',
            fields: [{ key: 'invoice', type: 'checkbox', label: 'Invoice my company' }],
          },
        ]),
        logic: { rules: [{ target: 'company', kind: 'required', cel: 'invoice == true' }] },
      },
      capabilities: { now: () => 0, today: () => '2026-01-01', random: () => 0 },
    })
    const view = await renderForm(engine)
    const settle = async () => {
      await view.fixture.whenStable()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await view.fixture.whenStable()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await settle()
    fireEvent.click(screen.getByLabelText('Invoice my company'))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await settle()

    expect(document.querySelector('[aria-current="step"]')?.textContent?.trim()).toBe('Step one')
    const control = screen.getByLabelText('Company')
    expect(control.getAttribute('aria-invalid')).toBe('true')
  })

  test('a repeater seeds minItems and names its row controls by position', async () => {
    const engine = createFormEngine({
      schema: flatSchema([
        {
          key: 'contacts',
          type: 'repeater',
          label: 'Contacts',
          minItems: 1,
          addLabel: 'Add contact',
          removeLabel: 'Remove contact',
          fields: [{ key: 'name', type: 'text', label: 'Name' }],
        },
      ]),
    })
    const view = await renderForm(engine)

    // Seeded to minItems: one row, not an add button and a shrug.
    expect(screen.getAllByLabelText('Name')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }))
    await view.fixture.whenStable()

    expect(screen.getAllByLabelText('Name')).toHaveLength(2)
    // Position context in the NAME, so a screen-reader user knows which row
    // this button kills without walking the tree.
    expect(screen.getByRole('button', { name: 'Remove contact 2 of 2' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove contact 1 of 2' }))
    await view.fixture.whenStable()

    expect(screen.getAllByLabelText('Name')).toHaveLength(1)
  })

  test('the submitted output reports the outcome, with the payload on success', async () => {
    const engine = createFormEngine({
      schema: flatSchema([{ key: 'email', type: 'text', label: 'Email', required: true }]),
    })
    const outcomes: SubmitOutcome[] = []
    const view = await renderForm(engine, {
      on: { submitted: (outcome: SubmitOutcome) => outcomes.push(outcome) },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await view.fixture.whenStable()

    expect(outcomes[0]).toMatchObject({ ok: false, errors: { email: ['required'] } })

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    await view.fixture.whenStable()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await view.fixture.whenStable()

    expect(outcomes[1]).toMatchObject({ ok: true, data: { email: 'ada@example.com' } })
  })
})
