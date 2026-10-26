import { act, cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { ErrorSummary, FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * A repeater's bounds and its own errors, as the React renderer draws them (0184).
 *
 * The engine holds the bounds; what the renderer owes is not to offer a control the engine
 * would refuse, and to draw the repeater's own error where its rows are — named by its
 * legend, which is how the error summary and the conformance drivers find it. The Angular
 * renderer is held to the same markup by `packages/angular/src/repeater-bounds.test.ts`
 * and both by `packages/conformance/fixtures/repeater-bounds.json`.
 */
function guests(repeater: Record<string, unknown> = {}, rules: readonly unknown[] = [], beside: readonly unknown[] = []) {
  return {
    specVersion: '4',
    id: 'party',
    title: 'Party',
    model: {
      fields: [
        ...beside,
        {
          key: 'guests',
          type: 'repeater',
          label: 'Guests',
          addLabel: 'Add guest',
          removeLabel: 'Remove guest',
          ...repeater,
          fields: [{ key: 'name', type: 'text', label: 'Name' }],
        },
      ],
    },
    logic: { rules },
  } as unknown as FormSchema
}

function mount(schema: FormSchema, value?: unknown, summary = false) {
  const engine = createFormEngine({
    schema,
    ...(value === undefined ? {} : { initialValue: value }),
    capabilities: { now: () => 0, today: () => '2026-10-18', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      {summary ? <ErrorSummary /> : null}
      <FormancyForm />
    </FormancyProvider>,
  )
  return engine
}

const group = () => screen.getByRole('group', { name: /^Guests/ })

describe('the add and remove buttons', () => {
  test('the add button is not offered once the repeater holds its maxItems', async () => {
    // It was, and the engine added a fourth row to a repeater that allows three: the person
    // met the cap, if at all, as an error after the fact. Absent rather than disabled, as the
    // move buttons are at the ends.
    mount(guests({ maxItems: 2 }))
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Add guest' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Remove guest 2 of 2' }))
    expect(screen.getByRole('button', { name: 'Add guest' })).toBeDefined()
  })

  test('no remove button is offered at the repeater’s minItems', async () => {
    // Removing the only row of a `minItems: 1` repeater left none under React, and Angular's
    // own effect put one back — two answers to one document (0023).
    mount(guests({ minItems: 1 }))
    expect(screen.queryByRole('button', { name: /^Remove guest/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove guest 1 of 2' }))
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Remove guest/ })).toBeNull()
  })

  test('a disabled repeater offers its buttons disabled, and its rows with them', () => {
    // A rule that disabled the repeater left every row editable and every button live.
    mount(guests({}, [{ target: 'guests', kind: 'disabled', cel: 'true' }]), { guests: [{}, {}] })
    expect((screen.getByRole('button', { name: 'Add guest' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Remove guest 1 of 2' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Move Guests 1 of 2 down' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByRole('textbox', { name: 'Name' }).every((box) => (box as HTMLInputElement).disabled)).toBe(true)
  })
})

describe('the repeater’s own error', () => {
  test('is drawn in the repeater, described by it, and named in the summary by its label', async () => {
    // An error on the repeater had nowhere to be drawn: the renderers drew errors under
    // fields, and a repeater is not one. The summary names it as #196 names a field.
    mount(guests({ required: true }), undefined, true)
    // The group's "required" hint, before anything is submitted — not the error.
    expect(within(group()).getByText('required')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    const described = group().getAttribute('aria-describedby') ?? ''
    const error = described
      .split(' ')
      .map((id) => document.getElementById(id))
      .find((element) => element?.getAttribute('data-formancy-part') === 'error')
    expect(error?.textContent).toBe('Add at least one row.')
    expect(group().contains(error ?? null)).toBe(true)
    expect(screen.getByRole('link', { name: 'Guests: Add at least one row.' })).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))
    expect(group().querySelector('[data-formancy-part="error"]')).toBeNull()
  })

  test('the summary’s link takes focus into the repeater', async () => {
    // The link goes to the repeater's own id; a fieldset takes no focus, so the first
    // control in it does, as the summary does for any field whose id names no control.
    mount(guests({ required: true }), undefined, true)
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await userEvent.click(screen.getByRole('link', { name: 'Guests: Add at least one row.' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add guest' }))
  })

  test('without a summary, a failed submit takes focus into the repeater', async () => {
    // The first invalid thing is the repeater, and focus goes to its id as to a field's —
    // which named no element, so focus stayed on Submit and nothing said where to look.
    mount(guests({ required: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add guest' }))
  })
})

describe('a hidden repeater', () => {
  test('is not drawn at all, as a hidden field is not', async () => {
    // A rule hiding the repeater cleared its rows and left its fieldset and its add button on
    // the screen, so a person could add rows to a question that was withdrawn.
    const engine = mount(guests({}, [{ target: 'guests', kind: 'visible', cel: 'coming == true' }], [
      { key: 'coming', type: 'checkbox', label: 'Coming' },
    ]))
    expect(screen.queryByRole('group', { name: /^Guests/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add guest' })).toBeNull()
    await act(async () => engine.setValue(['coming'], true))
    expect(group()).toBeDefined()
  })
})
