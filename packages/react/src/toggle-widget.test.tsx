import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

const CLOCK = { now: () => 0, today: () => '2026-09-19', random: () => 0.5 }

/**
 * `widget: "toggle"` — a checkbox a theme can draw as a switch.
 *
 * The obvious implementation is `role="switch"`, and it is wrong here for two
 * reasons that point the same way.
 *
 * **ARIA's `switch` means a control that takes effect when you operate it.** A
 * form field does not: it sets a value that is submitted later, possibly never, and
 * possibly after the person changes their mind twice. Announcing "switch" for
 * something whose effect is deferred describes the control incorrectly to exactly
 * the people who depend on the description. The repository's own roadmap already
 * noted that a form switch must not commit; the conclusion it did not draw is that
 * such a thing is a checkbox.
 *
 * **And a widget may not change what a field collects
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).**
 * A role is not paint. Changing it changes what assistive technology believes the
 * control *is*, which is behaviour wearing presentation's clothes — and it would
 * make `toggle` the first widget to cross the line the widget mechanism exists to
 * hold.
 *
 * So the control stays a checkbox, keeps its role, and gains a part name a theme
 * styles. The switch is CSS, which is where a switch was always going to be.
 *
 * The happy consequence is that conformance is untouched: every fixture querying
 * `getByRole('checkbox', { name })` keeps working whether the widget is set or not,
 * so there is no framework-specific skip and no fixture to rewrite
 * ([0034](../../../docs/decisions/0034-accessible-name-only.md)).
 */

function schemaWith(widget?: 'toggle'): FormSchema {
  return {
    specVersion: '2',
    id: 'toggles',
    title: 'Toggles',
    model: {
      fields: [
        {
          key: 'agree',
          type: 'checkbox',
          label: 'Agree to the terms',
          ...(widget === undefined ? {} : { widget }),
        },
      ],
    },
  } as FormSchema
}

function mount(widget?: 'toggle'): void {
  const engine = createFormEngine({ schema: schemaWith(widget), capabilities: CLOCK })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>,
  )
}

describe('a checkbox with the toggle widget', () => {
  test('is still a checkbox to assistive technology', () => {
    // The whole decision in one assertion. `role="switch"` would fail this, and
    // would also be the first widget to change what a control claims to be.
    mount('toggle')
    expect(screen.getByRole('checkbox', { name: 'Agree to the terms' })).toBeDefined()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  test('carries a part name a theme can draw a switch with', () => {
    // The only thing the widget actually changes. Without this there is no hook,
    // and `widget: "toggle"` would be a property that validates and does nothing --
    // which is the inert-switch failure this repository has already shipped once.
    mount('toggle')
    const input = screen.getByRole('checkbox', { name: 'Agree to the terms' })
    expect(input.getAttribute('data-formancy-part')).toBe('toggle')
  })

  test('still collects true, false and untouched', () => {
    // A widget may not change what a field collects. Asserted rather than assumed,
    // because this is the line the mechanism exists to hold.
    const engine = createFormEngine({ schema: schemaWith('toggle'), capabilities: CLOCK })
    // Untouched is ABSENT from the value, not null in it -- measured rather than
    // assumed, because the first version of this test asserted `{ agree: null }` and
    // the engine was right. Which matters beyond this test: `'agree' in data` is
    // false for a checkbox nobody has touched, which is why a rule reading one has
    // to say `agree == true`.
    expect(engine.value()).toEqual({})
    engine.setValue(['agree'], true)
    expect(engine.value()).toEqual({ agree: true })
    engine.setValue(['agree'], false)
    expect(engine.value()).toEqual({ agree: false })
  })

  test('renders the ordinary part name when no widget is asked for', () => {
    // A guard on the guard: if every checkbox carried `data-formancy-part="toggle"`
    // the assertion above would pass for a renderer that ignores the widget
    // entirely.
    mount()
    const input = screen.getByRole('checkbox', { name: 'Agree to the terms' })
    expect(input.getAttribute('data-formancy-part')).not.toBe('toggle')
  })
})
