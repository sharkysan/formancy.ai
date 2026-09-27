import { cleanup, render, screen } from '@testing-library/react'
import { computeAccessibleName } from 'dom-accessibility-api'
import { afterEach, describe, expect, test } from 'vitest'

import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

/**
 * `widget: "datagrid"` on a repeater — rows drawn as a grid instead of as blocks.
 *
 * ── WHY IT IS NOT A `<table>`, AND NOT `role="grid"` ─────────────────────────
 *
 * Measured against the accessible-name implementation this repository installs,
 * not assumed: a `<th scope="col">` contributes **nothing** to the accessible
 * name of a control in its column, and `headers=` pointing at that header
 * contributes nothing either. A clipped `<label>` does.
 *
 * So a table earns no name for its cells and the per-cell `<label>` has to stay
 * whatever the container is — at which point the table is paying for
 * `td-has-header`, `th-has-data-cells` and a header echo on every cell, and
 * buying coordinates. That trade is why it loses. It is not that it is free.
 *
 * `role="grid"` is refused for the reason `toggle` is not `role="switch"`
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)):
 * a role is not paint. It would also take the arrow keys, which the controls in
 * the cells already own — a `select` with `widget: "typeahead"` is legal in a
 * row and claims Up, Down, Home, End, Enter and Escape
 * ([0072](../../../docs/decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)).
 *
 * ── AND WHY THE CONFORMANCE SUITE IS NOT THE GUARD HERE ──────────────────────
 *
 * Measured: `@testing-library/dom` tests each label source separately, so
 * `queryAllByLabelText('Quantity')` still matches an element whose *computed*
 * name is `"Qty Quantity"`. "Every fixture still passes" is therefore **not**
 * evidence that no name changed, which is why the first case below asserts
 * `computeAccessibleName` directly against the same schema rendered without the
 * widget.
 *
 * Deliberately a near-copy of the Angular file rather than a shared helper: a
 * renderer's markup is exactly the thing that must not be shared.
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

function mount(widget?: 'datagrid'): void {
  render(
    <FormancyProvider engine={createFormEngine({ schema: schema(widget), capabilities: CLOCK })}>
      <FormancyForm onSubmit={() => undefined} />
    </FormancyProvider>,
  )
}

/** Every control on the page, as (tag, computed accessible name) in document order. */
const namedControls = (): Array<[string, string]> =>
  [...document.querySelectorAll('input, select, textarea, button')].map((element) => [
    element.tagName.toLowerCase(),
    computeAccessibleName(element),
  ])

const parts = (name: string): HTMLElement[] =>
  [...document.querySelectorAll(`[data-formancy-part="${name}"]`)] as HTMLElement[]

describe('a repeater with the datagrid widget', () => {
  test('calls every control exactly what it called it without the widget', () => {
    // THE case. A column heading that reached a control's accessible name would make
    // the arrangement change what the form asks -- and it would do it invisibly,
    // because the conformance driver matches each label source separately and would
    // keep passing while the computed name grew a heading in front of it.
    //
    // Compared element for element against the same schema rendered as blocks, which
    // is the only comparison that can fail for the right reason.
    mount(undefined)
    const withoutWidget = namedControls()
    cleanup()

    mount('datagrid')
    const withWidget = namedControls()

    expect(withWidget).toEqual(withoutWidget)
    // A guard on the guard: an empty list would make this pass forever.
    expect(withWidget.length).toBeGreaterThan(8)
  })

  test('draws a grid rather than blocks, and says how many columns it has', () => {
    // The failure this prevents is the one the playground records for every widget it
    // cannot show yet: the property validates, the renderer ignores it, and a visitor
    // cannot tell the widget from its absence.
    mount('datagrid')

    expect(parts('datagrid')).toHaveLength(1)
    expect(parts('row')).toHaveLength(0)
    expect(parts('datagrid-row')).toHaveLength(2)

    // Four field columns, and the actions track is NOT one of them: a theme sizes the
    // columns the document describes and adds its own track for the buttons.
    expect(parts('datagrid')[0]?.getAttribute('data-columns')).toBe('4')
  })

  test('carries the authored ratios where CSS can build tracks from them', () => {
    // A custom property rather than `grid-template-columns`, so a theme's narrow-screen
    // media query replaces its own declaration and wins. And a property rather than an
    // enumerated attribute, because `width` is a number with `exclusiveMinimum: 0`: 1.5
    // is legal and nothing bounds it from above, so no attribute could enumerate it.
    mount('datagrid')

    // Three columns are sized and `lineTotal` is not, so it takes an even share.
    expect(parts('datagrid')[0]?.style.getPropertyValue('--fm-datagrid-columns')).toBe(
      '3fr 1.5fr 1fr 1fr',
    )
  })

  test('shows a column for every answer, in the order the columns ask for', () => {
    // `columns` is an ORDERING, not a choice of which answers to keep
    // ([0066](../../../docs/decisions/0066-a-widget-may-be-configured.md)). A child no
    // column names still collects, so it still gets a column -- dropping it would be an
    // answer nobody can give, which is the failure `unreferencedPaths` exists for.
    mount('datagrid')

    expect(parts('datagrid-heading').map((heading) => heading.textContent)).toEqual([
      'Item name',
      'Quantity ordered',
      // The author's shortening, used for the heading only.
      'Unit',
      // Named by no column, appended in declaration order.
      'Line total',
    ])
  })

  test('a heading is static text and names nothing', () => {
    // What makes the narrow-screen reflow possible at all: a theme deletes the heading
    // strip at phone width and un-clips the labels, and because the headings never named
    // anything, what each control announces does not depend on the viewport.
    mount('datagrid')

    for (const heading of parts('datagrid-heading')) {
      expect(heading.tagName.toLowerCase()).toBe('span')
      expect(heading.hasAttribute('id')).toBe(false)
      expect(heading.hasAttribute('aria-label')).toBe(false)
      expect(heading.getAttribute('role')).toBeNull()
    }
    // And no query by name can reach one, which is what a conformance driver would do.
    expect(screen.queryByRole('columnheader')).toBeNull()
    expect(screen.queryByLabelText('Unit')).toBeNull()
  })

  test('puts the author’s alignment on the cell, not on the control', () => {
    // `end` means the column's values line up against the end, so the control, its error
    // and its clipped label have to move together.
    mount('datagrid')

    const firstRow = parts('datagrid-row')[0]
    const aligns = [...(firstRow?.children ?? [])]
      .filter((child) => child.getAttribute('data-formancy-part') === 'datagrid-cell')
      .map((cell) => cell.getAttribute('data-align'))

    expect(aligns).toEqual([null, 'end', 'end', null])
  })

  test('gives every row the same number of cells, and the buttons one of their own', () => {
    // A row whose cell count varied would put every row after it out of line with the
    // heading strip. The buttons are one cell rather than three because there are two on
    // the first and last rows and three in between.
    mount('datagrid')

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

  test('leaves the tab order exactly as it was', () => {
    // The only mechanical guard on "this is not a `role="grid"`". Both drivers operate
    // controls with fireEvent and never press Tab, so a grid that swallowed Tab would
    // pass every fixture in the suite while making the form unusable by keyboard.
    const tabbables = (): number =>
      document.querySelectorAll('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
        .length

    mount(undefined)
    const asBlocks = tabbables()
    cleanup()

    mount('datagrid')
    expect(tabbables()).toBe(asBlocks)
    // And nothing in the new subtree claims a role that would change what the keys do.
    for (const name of ['datagrid', 'datagrid-head', 'datagrid-row', 'datagrid-cell']) {
      for (const element of parts(name)) expect(element.getAttribute('role')).toBeNull()
    }
  })

  test('heads the grid only once there is a row to head', () => {
    // A heading strip over nothing is a set of column names for columns that hold no
    // answers, which reads as a form that failed to load.
    mount('datagrid')
    expect(parts('datagrid-head')).toHaveLength(1)

    cleanup()
    render(
      <FormancyProvider
        engine={createFormEngine({
          schema: {
            ...schema('datagrid'),
            model: {
              fields: [
                {
                  ...(schema('datagrid').model.fields[0] as unknown as Record<string, unknown>),
                  minItems: 0,
                },
              ],
            },
          } as unknown as FormSchema,
          capabilities: CLOCK,
        })}
      >
        <FormancyForm onSubmit={() => undefined} />
      </FormancyProvider>,
    )
    expect(parts('datagrid-row')).toHaveLength(0)
    expect(parts('datagrid-head')).toHaveLength(0)
  })
})
