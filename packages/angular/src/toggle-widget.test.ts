import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * `widget: "toggle"` in Angular — the same four assertions React makes.
 *
 * Deliberately a near-copy rather than a shared helper. Two renderers agreeing is
 * the claim this repository is built on, and the way it stops being true is one of
 * them quietly not implementing something while a shared abstraction reports that
 * both did. `@formancy/conformance` is where behaviour is specified once and run
 * against both drivers; this is a unit test of a renderer's own markup, and a
 * renderer's markup is exactly the thing that must not be shared.
 *
 * The ARIA decision is argued in the React file and is the same here: the control
 * stays a checkbox and gains a part name, because ARIA's `switch` means a control
 * that takes effect when operated, and because a role is not paint — a widget may
 * not change what a control claims to be
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
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

async function mount(widget?: 'toggle'): Promise<void> {
  const engine = createFormEngine({ schema: schemaWith(widget) })
  await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
}

describe('a checkbox with the toggle widget', () => {
  test('is still a checkbox to assistive technology', async () => {
    await mount('toggle')
    expect(screen.getByRole('checkbox', { name: 'Agree to the terms' })).toBeDefined()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  test('carries a part name a theme can draw a switch with', async () => {
    // Without this the widget validates and does nothing, which is the
    // documented-but-inert failure this repository has already shipped once.
    await mount('toggle')
    const input = screen.getByRole('checkbox', { name: 'Agree to the terms' })
    expect(input.getAttribute('data-formancy-part')).toBe('toggle')
  })

  test('renders the ordinary part name when no widget is asked for', async () => {
    // A guard on the guard: a renderer that put the part name on every checkbox
    // would satisfy the assertion above while ignoring the widget entirely.
    await mount()
    const input = screen.getByRole('checkbox', { name: 'Agree to the terms' })
    expect(input.getAttribute('data-formancy-part')).not.toBe('toggle')
  })

  test('still collects true, false and untouched', () => {
    // Untouched is ABSENT from the value rather than null in it, which is why a
    // rule reading a checkbox has to say `agree == true`.
    const engine = createFormEngine({ schema: schemaWith('toggle') })
    expect(engine.value()).toEqual({})
    engine.setValue(['agree'], true)
    expect(engine.value()).toEqual({ agree: true })
    engine.setValue(['agree'], false)
    expect(engine.value()).toEqual({ agree: false })
  })
})
