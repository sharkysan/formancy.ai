import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { computeAccessibleName } from 'dom-accessibility-api'
import { afterEach, describe, expect, test } from 'vitest'

import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

/**
 * `widget: "datagrid"` in Angular — the same assertions the React file makes.
 *
 * Deliberately a near-copy rather than a shared helper, on the reasoning
 * [0033](../../../docs/decisions/0033-one-suite-n-drivers.md) rests on: two
 * renderers agreeing is the claim, and the way it stops being true is one of
 * them quietly not implementing something while a shared abstraction reports
 * that both did. A renderer's markup is exactly the thing that must not be
 * shared. What IS shared is the column plan, in `@formancy/spec`, because a
 * grid that ordered its columns one way here and another way in React would be
 * two forms from one document.
 *
 * The design is argued in the React file and is the same here: no `<table>` and
 * no `role="grid"`, every cell control keeping its own label, and a heading
 * strip that names nothing.
 */
function schema(widget?: 'datagrid'): FormSchema {
  return {
    specVersion: '2',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          minItems: 2,
          addLabel: 'Add item',
          removeLabel: 'Remove item',
          ...(widget === undefined
            ? {}
            : {
                widget,
                columns: [
                  { field: 'name', width: 3 },
                  { field: 'qty', width: 1.5, align: 'end' },
                  { field: 'unitPrice', width: 1, align: 'end', header: 'Unit' },
                ],
              }),
          fields: [
            { key: 'name', type: 'text', label: 'Item name' },
            { key: 'qty', type: 'number', label: 'Quantity ordered' },
            { key: 'unitPrice', type: 'number', label: 'Unit price' },
            { key: 'lineTotal', type: 'number', label: 'Line total' },
          ],
        },
      ],
    },
  } as unknown as FormSchema
}

async function mount(widget?: 'datagrid'): Promise<void> {
  const view = await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(createFormEngine({ schema: schema(widget), capabilities: CLOCK })),
    ],
  })
  await view.fixture.whenStable()
}

const namedControls = (): Array<[string, string]> =>
  [...document.querySelectorAll('input, select, textarea, button')].map((element) => [
    element.tagName.toLowerCase(),
    computeAccessibleName(element),
  ])

const parts = (name: string): HTMLElement[] =>
  [...document.querySelectorAll(`[data-formancy-part="${name}"]`)] as HTMLElement[]

const reset = (): void => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
}

describe('a repeater with the datagrid widget', () => {
  test('calls every control exactly what it called it without the widget', async () => {
    // THE case, and the reason it uses computeAccessibleName rather than a query: the
    // conformance driver matches each label source separately, so it would keep passing
    // while a column heading grew onto the front of every computed name.
    await mount(undefined)
    const withoutWidget = namedControls()
    reset()

    await mount('datagrid')
    const withWidget = namedControls()

    expect(withWidget).toEqual(withoutWidget)
    expect(withWidget.length).toBeGreaterThan(8)
  })

  test('draws a grid rather than blocks, and says how many columns it has', async () => {
    await mount('datagrid')

    expect(parts('datagrid')).toHaveLength(1)
    expect(parts('row')).toHaveLength(0)
    expect(parts('datagrid-row')).toHaveLength(2)
    // The actions track is not a field column: a theme sizes what the document
    // describes and adds its own track for the buttons.
    expect(parts('datagrid')[0]?.getAttribute('data-columns')).toBe('4')
  })

  test('carries the authored ratios where CSS can build tracks from them', async () => {
    // A custom property, not `grid-template-columns`, so a theme's media query wins.
    // And a property rather than an enumerated attribute, because `width` is a number
    // with `exclusiveMinimum: 0`: 1.5 is legal and nothing bounds it from above.
    await mount('datagrid')

    expect(parts('datagrid')[0]?.style.getPropertyValue('--fm-datagrid-columns')).toBe(
      '3fr 1.5fr 1fr 1fr',
    )
  })

  test('shows a column for every answer, in the order the columns ask for', async () => {
    // `columns` is an ordering, not a choice of which answers to keep: `lineTotal` is
    // named by no column and still gets one, because a child dropped from the grid
    // would be an answer nobody can give.
    await mount('datagrid')

    expect(parts('datagrid-heading').map((heading) => heading.textContent?.trim())).toEqual([
      'Item name',
      'Quantity ordered',
      'Unit',
      'Line total',
    ])
  })

  test('a heading is static text and names nothing', async () => {
    // What makes the narrow-screen reflow possible: a theme deletes the heading strip
    // at phone width and un-clips the labels, and because the headings never named
    // anything, what each control announces does not depend on the viewport.
    await mount('datagrid')

    for (const heading of parts('datagrid-heading')) {
      expect(heading.tagName.toLowerCase()).toBe('span')
      expect(heading.hasAttribute('id')).toBe(false)
      expect(heading.hasAttribute('aria-label')).toBe(false)
      expect(heading.getAttribute('role')).toBeNull()
    }
    expect(screen.queryByRole('columnheader')).toBeNull()
    expect(screen.queryByLabelText('Unit')).toBeNull()
  })

  test('puts the author’s alignment on the cell, not on the control', async () => {
    // `end` means the column's values line up against the end, so the control, its
    // error and its clipped label have to move together.
    await mount('datagrid')

    const firstRow = parts('datagrid-row')[0]
    const aligns = [...(firstRow?.children ?? [])]
      .filter((child) => child.getAttribute('data-formancy-part') === 'datagrid-cell')
      .map((cell) => cell.getAttribute('data-align'))

    expect(aligns).toEqual([null, 'end', 'end', null])
  })

  test('gives every row the same number of cells, and the buttons one of their own', async () => {
    // A row whose cell count varied would put every row after it out of line with the
    // heading strip. The buttons are one cell because there are two on the first and
    // last rows and three in between.
    await mount('datagrid')

    const rows = parts('datagrid-row')
    const cellCounts = rows.map(
      (row) =>
        [...row.children].filter(
          (child) => child.getAttribute('data-formancy-part') === 'datagrid-cell',
        ).length,
    )
    expect(cellCounts).toEqual([4, 4])
    expect(parts('datagrid-actions')).toHaveLength(rows.length)
  })

  test('leaves the tab order exactly as it was', async () => {
    // The only mechanical guard on "this is not a role=grid". Both drivers operate
    // controls with fireEvent and never press Tab, so a grid that swallowed Tab would
    // pass every fixture while making the form unusable by keyboard.
    const tabbables = (): number =>
      document.querySelectorAll('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
        .length

    await mount(undefined)
    const asBlocks = tabbables()
    reset()

    await mount('datagrid')
    expect(tabbables()).toBe(asBlocks)
    for (const name of ['datagrid', 'datagrid-head', 'datagrid-row', 'datagrid-cell']) {
      for (const element of parts(name)) expect(element.getAttribute('role')).toBeNull()
    }
  })

  test('keeps the row buttons’ names, which carry the row’s position', async () => {
    // 0068 put the position in the name so a screen-reader user knows which row a
    // button acts on without walking the tree. A grid does not change where a person
    // is, so the names may not change either -- and in this renderer the buttons come
    // from one template used by both arrangements, which is what holds that true.
    await mount('datagrid')

    expect(screen.getByRole('button', { name: 'Remove item 1 of 2' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Move Items 1 of 2 down' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Move Items 1 of 2 up' })).toBeNull()
  })

  test('heads the grid only once there is a row to head', async () => {
    // A heading strip over nothing is a set of column names for columns that hold no
    // answers, which reads as a form that failed to load. The React file has asserted
    // this since the widget shipped and this file did not -- so the arrangement each
    // renderer shows for an empty grid was checked in one of them, which is the
    // divergence the two files exist to prevent.
    await mount('datagrid')
    expect(parts('datagrid-head')).toHaveLength(1)

    reset()
    const empty = schema('datagrid')
    const grid = empty.model.fields[0] as unknown as Record<string, unknown>
    const view = await render(FormancyForm, {
      providers: [
        provideZonelessChangeDetection(),
        provideFormancy(
          createFormEngine({
            schema: {
              ...empty,
              model: { fields: [{ ...grid, minItems: 0 }] },
            } as unknown as FormSchema,
            capabilities: CLOCK,
          }),
        ),
      ],
    })
    await view.fixture.whenStable()

    expect(parts('datagrid-row')).toHaveLength(0)
    expect(parts('datagrid-head')).toHaveLength(0)
  })
})
