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

/**
 * `span` — a node taking more than one of a table's columns.
 *
 * The same assertions the React file makes, written out rather than shared: a
 * layout feature that exists in one renderer and not the other is exactly the
 * drift these paired files exist to catch.
 */
const spanning = {
  specVersion: '2',
  id: 'address',
  title: 'Address',
  model: {
    fields: [
      { key: 'postcode', type: 'text', label: 'Postcode' },
      { key: 'city', type: 'text', label: 'City' },
      { key: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'table',
          columns: 3,
          children: [
            { kind: 'field', path: 'postcode', span: 2 },
            { kind: 'field', path: 'city' },
            { kind: 'field', path: 'notes', span: 'all' },
          ],
        },
      ],
    },
  ],
} as unknown as FormSchema

async function mountSpanning(): Promise<void> {
  await render(FormancyForm, {
    inputs: { layout: 'web' },
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(createFormEngine({ schema: spanning })),
    ],
  })
}

const cellOf = (label: string): HTMLElement | null =>
  screen.getByRole('textbox', { name: label }).closest('[data-formancy-part="layout-cell"]')

describe('a node that spans a table\u2019s columns', () => {
  test('gets a cell to span with, and the others are left exactly as they were', async () => {
    // Only the spanning node is wrapped, so a form that uses no span has the markup
    // it had before this existed.
    await mountSpanning()

    expect(cellOf('Notes')?.getAttribute('data-span')).toBe('all')
    expect(cellOf('Postcode')?.getAttribute('data-span')).toBe('2')
    expect(cellOf('City')).toBeNull()

    // That the cell is the container's child FOR LAYOUT is asserted below, where the
    // recursion's host element is accounted for -- Angular puts one between them and
    // React does not, which is the whole subject of the next two cases.
  })

  test('carries the number where CSS can count with it, and nothing for `all`', async () => {
    // A selector can match `data-span`, but `grid-column: span attr(data-span)` is not
    // a thing -- so the number goes where CSS can count with it. `all` is 1 / -1
    // whatever the column count and needs no number.
    await mountSpanning()

    expect(cellOf('Postcode')?.style.getPropertyValue('--fm-span')).toBe('2')
    expect(cellOf('Notes')?.style.getPropertyValue('--fm-span')).toBe('')
  })

  test('changes nothing about what any control is called', async () => {
    // The line a layout may not cross: a cell is a box around a control, and a box
    // that joined the accessible name would let the arrangement change what the form
    // asks -- which is what every lookup being by role and name protects.
    await mountSpanning()

    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Postcode' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'City' })).toBeTruthy()
  })
})

describe('the recursion\u2019s own host element', () => {
  test('takes no part in layout, so a container sees the children React puts there', async () => {
    // The bug this prevents, and it had shipped: Angular gives every component a host
    // element, this one recurses, so a container's children arrive wrapped in a
    // `<formancy-layout>` that React does not emit. A wrapper that participates in
    // layout is then the only grid item its parent has.
    //
    // Measured in a browser against blueprint.css, with both renderers' exact markup on
    // one page: React put two fields at the same top, 442px apart; Angular stacked them,
    // 86px apart at the same left edge. A two-column table has therefore never produced
    // two columns in Angular -- and nothing failed, because jsdom has no layout and no
    // application in this repository renders the Angular bindings.
    //
    // jsdom cannot see the columns, but it CAN see this, which is the one declaration
    // the columns depend on. Argued in
    // [0073](../../../docs/decisions/0073-a-host-element-is-not-a-layout.md).
    await mountSpanning()

    const hosts = [...document.querySelectorAll('formancy-layout')]
    expect(hosts.length).toBeGreaterThan(0)
    for (const host of hosts) {
      expect(getComputedStyle(host).display).toBe('contents')
    }
  })

  test('and the cells really are the container\u2019s own children', async () => {
    // The structural half: with the host out of the way the grid items are the cells
    // and the fields, which is what a theme's `grid-template-columns` acts on. Asserted
    // as ancestry rather than as a box, because a box is the thing jsdom cannot give.
    await mountSpanning()

    const table = document.querySelector('[data-formancy-part="layout-table"]')
    const cell = screen.getByRole('textbox', { name: 'Notes' })
      .closest('[data-formancy-part="layout-cell"]')
    expect(cell).not.toBeNull()
    // Every element between the cell and the table takes no part in layout.
    let walk = cell?.parentElement ?? null
    const between: string[] = []
    while (walk !== null && walk !== table) {
      between.push(`${walk.tagName.toLowerCase()}:${getComputedStyle(walk).display}`)
      walk = walk.parentElement
    }
    expect(walk).toBe(table)
    expect(between.filter((entry) => !entry.endsWith(':contents'))).toEqual([])
  })
})
