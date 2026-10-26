import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyErrorSummary, FormancyForm, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * A repeater's bounds and its own errors, as the Angular renderer draws them (0184).
 *
 * The same cases as `packages/react/src/repeater-bounds.test.tsx`, by role and accessible
 * name, because the two renderers must draw one repeater one way. A near-copy rather than
 * a shared helper: a renderer's markup is exactly the thing that must not be shared.
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

@Component({
  selector: 'formancy-test-repeater-host',
  imports: [FormancyErrorSummary, FormancyForm],
  template: `
    <formancy-error-summary />
    <formancy-form />
  `,
})
class SummaryHost {}

async function mount(schema: FormSchema, value?: unknown, summary = false) {
  const engine = createFormEngine({
    schema,
    ...(value === undefined ? {} : { initialValue: value }),
    capabilities: { now: () => 0, today: () => '2026-10-18', random: () => 0.5 },
  })
  const view = await render(summary ? SummaryHost : FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
  /** Press a control as a person would, and let the change land. */
  const press = async (name: string, role: 'button' | 'link' = 'button'): Promise<void> => {
    fireEvent.click(screen.getByRole(role, { name }))
    await view.fixture.whenStable()
  }
  return { engine, view, press }
}

const group = () => screen.getByRole('group', { name: /^Guests/ })

describe('the add and remove buttons', () => {
  test('the add button is not offered once the repeater holds its maxItems', async () => {
    // It was, and the engine added a fourth row to a repeater that allows three: the person
    // met the cap, if at all, as an error after the fact. Absent rather than disabled, as the
    // move buttons are at the ends.
    const { press } = await mount(guests({ maxItems: 2 }))
    await press('Add guest')
    await press('Add guest')
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Add guest' })).toBeNull()

    await press('Remove guest 2 of 2')
    expect(screen.getByRole('button', { name: 'Add guest' })).toBeDefined()
  })

  test('no remove button is offered at the repeater’s minItems', async () => {
    // Removing the only row of a `minItems: 1` repeater left none under React, and this
    // renderer's own effect put one back — two answers to one document (0023). The effect
    // is gone; the engine refuses the row and the button is not offered.
    const { press } = await mount(guests({ minItems: 1 }))
    expect(screen.queryByRole('button', { name: /^Remove guest/ })).toBeNull()
    await press('Add guest')
    await press('Remove guest 1 of 2')
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Remove guest/ })).toBeNull()
  })

  test('a disabled repeater offers its buttons disabled, and its rows with them', async () => {
    // A rule that disabled the repeater left every row editable and every button live.
    await mount(guests({}, [{ target: 'guests', kind: 'disabled', cel: 'true' }]), { guests: [{}, {}] })
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
    const { press } = await mount(guests({ required: true }), undefined, true)
    expect(within(group()).getByText('required')).toBeDefined()

    await press('Submit')
    const described = group().getAttribute('aria-describedby') ?? ''
    const error = described
      .split(' ')
      .map((id) => document.getElementById(id))
      .find((element) => element?.getAttribute('data-formancy-part') === 'error')
    expect(error?.textContent?.trim()).toBe('Add at least one row.')
    expect(group().contains(error ?? null)).toBe(true)
    expect(screen.getByRole('link', { name: 'Guests: Add at least one row.' })).toBeDefined()

    await press('Add guest')
    expect(group().querySelector('[data-formancy-part="error"]')).toBeNull()
  })

  test('the summary’s link takes focus into the repeater', async () => {
    // The link goes to the repeater's own id; a fieldset takes no focus, so the first
    // control in it does, as the summary does for any field whose id names no control.
    const { press } = await mount(guests({ required: true }), undefined, true)
    await press('Submit')
    await press('Guests: Add at least one row.', 'link')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add guest' }))
  })

  test('without a summary, a failed submit takes focus into the repeater', async () => {
    // The first invalid thing is the repeater, and focus goes to its id as to a field's —
    // which named no element, so focus stayed on Submit and nothing said where to look.
    const { press } = await mount(guests({ required: true }))
    await press('Submit')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add guest' }))
  })
})

describe('a hidden repeater', () => {
  test('is not drawn at all, as a hidden field is not', async () => {
    // A rule hiding the repeater cleared its rows and left its fieldset and its add button on
    // the screen, so a person could add rows to a question that was withdrawn.
    const { engine, view } = await mount(
      guests({}, [{ target: 'guests', kind: 'visible', cel: 'coming == true' }], [
        { key: 'coming', type: 'checkbox', label: 'Coming' },
      ]),
    )
    expect(screen.queryByRole('group', { name: /^Guests/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add guest' })).toBeNull()
    engine.setValue(['coming'], true)
    await view.fixture.whenStable()
    expect(group()).toBeDefined()
  })
})
