import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * The same layout, the same assertions as packages/react/src/layout.test.tsx.
 *
 * Written twice on purpose: a layout feature that exists in one renderer and
 * not the other is exactly the drift the conformance suite exists to prevent,
 * and these are the WCAG criteria a side-by-side arrangement puts at risk.
 */
const schema: FormSchema = {
  specVersion: '1',
  id: 'address',
  title: 'Address',
  model: {
    fields: [
      { key: 'firstName', type: 'text', label: 'First name' },
      { key: 'lastName', type: 'text', label: 'Last name' },
      { key: 'street', type: 'text', label: 'Street' },
      { key: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'section',
          label: 'Your name',
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', path: 'firstName' },
                { kind: 'field', path: 'lastName' },
              ],
            },
          ],
        },
        { kind: 'field', path: 'street' },
      ],
    },
  ],
}

async function mount(layout?: string): Promise<void> {
  await render(FormancyForm, {
    ...(layout === undefined ? {} : { inputs: { layout } }),
    providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema }))],
  })
}

const labelOrder = (): string[] =>
  [...document.querySelectorAll('label')].map((label) => label.textContent?.trim() ?? '')

describe('rendering a named layout', () => {
  test('places the fields the layout asks for, in its order', async () => {
    await mount('web')

    expect(labelOrder()).toEqual(['First name', 'Last name', 'Street'])
  })

  test('a field the layout omits is not rendered', async () => {
    await mount('web')

    expect(screen.queryByLabelText('Notes')).toBeNull()
  })

  test('an unknown layout name falls back to model order', async () => {
    await mount('print')

    expect(labelOrder()).toHaveLength(4)
  })
})

describe('WCAG', () => {
  test('1.3.2 and 2.4.3 — DOM order is the visual order', async () => {
    await mount('web')

    const row = document.querySelector('[data-formancy-part="layout-row"]')!
    expect([...row.querySelectorAll('label')].map((l) => l.textContent?.trim())).toEqual([
      'First name',
      'Last name',
    ])
  })

  test('1.4.10 — reflow is the stylesheet’s job, not a measurement', async () => {
    await mount('web')

    const row = document.querySelector('[data-formancy-part="layout-row"]') as HTMLElement
    expect(row.getAttribute('style')).toBeNull()
    expect(row.getAttribute('data-columns')).toBe('2')
  })

  test('1.3.1 — a labelled section is a real group', async () => {
    await mount('web')

    const group = screen.getByRole('group', { name: 'Your name' })
    expect(group.getAttribute('data-formancy-part')).toBe('layout-section')
  })

  test('1.3.1 — a row invents no relationship', async () => {
    await mount('web')

    for (const row of document.querySelectorAll('[data-formancy-part="layout-row"]')) {
      expect(row.getAttribute('role')).toBeNull()
    }
  })

  test('the heading id is stable, so aria-labelledby keeps pointing at it', async () => {
    await mount('web')

    const group = screen.getByRole('group', { name: 'Your name' })
    const id = group.getAttribute('aria-labelledby')

    // Minting the id inside the template would give a new one per change
    // detection pass, leaving aria-labelledby aimed at nothing.
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)?.textContent).toBe('Your name')
  })
})
