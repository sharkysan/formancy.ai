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

  test('and it needs no stylesheet to do it, so a strict style-src needs no nonce', async () => {
    /*
     * The declaration above arrived as a component style — `styles: ':host { display:
     * contents }'` — and Angular emits a component style as a `<style>` element injected
     * into the document at runtime. Under `style-src 'self'` with no nonce, that element
     * is **blocked**, the host keeps its default `display: block`, and the layout bug
     * 0073 exists to fix comes back with nothing failing anywhere.
     *
     * Which makes the product's own headline — "runs under a strict CSP with no
     * configuration" — false for this renderer, in exactly the directive 0073 argued
     * about while choosing a stylesheet over an inline style. It compared a *parsed*
     * style attribute with a stylesheet and never considered the third option: CSSOM.
     * CSP does not govern CSSOM, so setting the property on the element needs no
     * directive and no nonce.
     *
     * Asserted as the absence of the element rather than as a property of the source,
     * because what a strict CSP blocks is the element.
     */
    await mountSpanning()

    const injected = [...document.querySelectorAll('style')].map(
      (element) => element.textContent ?? '',
    )
    expect(injected.filter((text) => text.includes('display') || text.includes('contents'))).toEqual(
      [],
    )
    // And the fact above still holds without one, which is the whole point.
    for (const host of document.querySelectorAll('formancy-layout')) {
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

/**
 * The same locale defect, and the same assertions as
 * packages/react/src/layout.test.tsx.
 *
 * Both renderers had it, identically and independently: the layout tree was
 * handed `schema.i18n.defaultLocale` rather than the engine's locale, so every
 * string belonging to the arrangement rather than to a field rendered in the
 * language the form was written in. Reported from the templates gallery, where
 * the German HR onboarding form showed German fields under the English
 * headings "Employee" and "Work setup".
 *
 * Two hand-written renderers agreeing on a mistake is the case
 * [0033](../../../docs/decisions/0033-one-suite-n-drivers.md) accepts the cost
 * of, so the pair is written twice here as well.
 */
const translated = {
  specVersion: '1',
  id: 'onboarding',
  title: 'Onboarding',
  model: {
    fields: [
      { key: 'fullName', type: 'text', label: { $t: 'fullName' } },
      { key: 'workMode', type: 'text', label: { $t: 'workMode' } },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        { kind: 'section', label: { $t: 'section.1' }, children: [{ kind: 'field', path: 'fullName' }] },
        { kind: 'section', label: { $t: 'section.2' }, children: [{ kind: 'field', path: 'workMode' }] },
      ],
    },
  ],
  i18n: {
    defaultLocale: 'en',
    messages: {
      en: { 'section.1': 'Employee', 'section.2': 'Work setup', fullName: 'Full name', workMode: 'Work arrangement' },
      de: {
        'section.1': 'Mitarbeitende Person',
        'section.2': 'Arbeitsplatz',
        fullName: 'Vor- und Nachname',
        workMode: 'Arbeitsmodell',
      },
      fr: { fullName: 'Prénom et nom', workMode: 'Mode de travail' },
    },
  },
} as unknown as FormSchema

async function mountTranslated(locale: string): Promise<void> {
  await render(FormancyForm, {
    inputs: { layout: 'web' },
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(createFormEngine({ schema: translated, locale })),
    ],
  })
}

describe('a layout in a locale that is not the default', () => {
  test('names its sections in that locale, not the one the form was written in', async () => {
    await mountTranslated('de')

    expect(screen.getByRole('group', { name: 'Mitarbeitende Person' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Arbeitsplatz' })).toBeTruthy()

    // The English gone rather than merely joined: a heading left in the source
    // language is the whole of the reported defect.
    expect(screen.queryByRole('group', { name: 'Employee' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Work setup' })).toBeNull()
  })

  test('and still falls back to the default locale for a string with no translation', async () => {
    // The other half, and why this is not simply "use the locale": a catalogue
    // with a gap must show the source language, never the message id. `fr` here
    // carries the fields and not the headings.
    await mountTranslated('fr')

    expect(screen.getByRole('textbox', { name: 'Prénom et nom' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Employee' }), 'a gap showed the message id').toBeTruthy()
  })
})
