import { describe, expect, test } from 'vitest'

import { belongsToColumn, datagridColumns } from './datagrid.js'
import { CONTAINER_FIELD_TYPES, FIELD_TYPES, LIST_VALUED_FIELD_TYPES } from './types.js'
import type { FieldDef } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `columns` — configuring the grid a `datagrid` widget arranges.
 *
 * ── WHY THIS IS NOT A FIELD TYPE, HAVING NEARLY BEEN ONE ────────────────────
 *
 * `datagrid` shipped as a widget on a repeater
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md))
 * because it stores exactly what a repeater stores. Then the columns needed
 * configuring — which child fields appear, in what order, how wide — and the
 * argument for promoting it to a type was that a presentation *hint* is a single
 * name, and a name cannot carry an object.
 *
 * **That argument is wrong, and it was built before it was checked.** A widget can
 * carry configuration: the document schema gates a property on `widget:
 * "datagrid"` exactly as readily as on `type: "datagrid"`, so the coupling is
 * enforceable either way.
 *
 * The type version was written, and it produced a bug on the way — which is the
 * evidence that settled this rather than the reasoning. `walkFields` opened its row
 * scope on `field.type === 'repeater'`, so a datagrid nested inside a repeater
 * passed a rule that exists because the engine cannot count rows two levels of
 * repetition deep. The check was correct for every type that existed when it was
 * written. It went wrong the moment a second type held the same row model, and that
 * class of defect is unbounded: `CONTAINER_FIELD_TYPES`, `LIST_VALUED_FIELD_TYPES`,
 * the nesting guard, CSV column unioning, server replay — each one a place two types
 * with one shape can quietly disagree.
 *
 * So: **one row model, one type, and the arrangement configured beside the widget
 * that asks for it.** [0066](../../../docs/decisions/0066-a-widget-may-be-configured.md)
 * records it and what it gives up.
 */

function documentWith(fields: unknown[], specVersion = '2'): Record<string, unknown> {
  return { specVersion, id: 'grid', title: 'Grid', model: { fields } }
}

const errorsFor = (document: Record<string, unknown>): readonly string[] => {
  const result = validateSchema(document as never)
  return result.valid ? [] : result.errors.map((error) => `${error.path} ${error.message}`)
}

/** A repeater arranged as a grid, with two child fields — the minimum worth arranging. */
const grid = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: 'lines',
  type: 'repeater',
  widget: 'datagrid',
  label: 'Lines',
  fields: [
    { key: 'item', type: 'text', label: 'Item' },
    { key: 'qty', type: 'number', label: 'Quantity' },
  ],
  ...extra,
})

describe('the row model', () => {
  test('is still one type, and datagrid is not a second one', () => {
    // The assertion that keeps the decision. A `datagrid` entry appearing in any of
    // these three lists means somebody promoted the widget to a type, and every
    // rule about repeating rows now has two names to remember -- which is exactly
    // how the nesting guard was broken while that version was being written.
    expect(FIELD_TYPES).not.toContain('datagrid')
    expect(CONTAINER_FIELD_TYPES).not.toContain('datagrid')
    expect(LIST_VALUED_FIELD_TYPES).not.toContain('datagrid')
  })

  test('still refuses a repeater inside a repeater, however it is arranged', () => {
    // Arranging the outer one as a grid must not change the rule, and would have
    // done under a second type.
    const errors = errorsFor(
      documentWith([
        {
          ...grid(),
          fields: [
            {
              key: 'inner',
              type: 'repeater',
              label: 'Inner',
              fields: [{ key: 'leaf', type: 'text', label: 'Leaf' }],
            },
          ],
        },
      ]),
    )
    expect(errors.join('\n')).toMatch(/cannot sit inside/)
  })
})

describe('the columns', () => {
  test('are optional, and a grid without them is valid', () => {
    // A grid nobody has arranged yet is still a grid. Requiring columns would make
    // the widget unusable in the builder until every column was named, and the
    // sensible default -- every child field in model order -- is what the repeater
    // already does.
    expect(errorsFor(documentWith([grid()]))).toEqual([])
  })

  test('name child fields of this grid, in the order they should appear', () => {
    expect(
      errorsFor(documentWith([grid({ columns: [{ field: 'qty' }, { field: 'item' }] })])),
    ).toEqual([])
  })

  test('are refused when a column names a field the grid does not have', () => {
    // The likeliest authoring mistake, and silent without this: a column pointing
    // at a renamed or deleted field shows an empty column, which reads as a field
    // that collects nothing rather than as a configuration error.
    const errors = errorsFor(documentWith([grid({ columns: [{ field: 'nope' }] })]))
    expect(errors.join('\n')).toMatch(/nope/)
  })

  test('are refused when one field is given two columns', () => {
    // Two columns over one answer: whatever is typed in one appears in the other,
    // and the grid claims more columns than the row has values.
    const errors = errorsFor(
      documentWith([grid({ columns: [{ field: 'item' }, { field: 'item' }] })]),
    )
    expect(errors.join('\n')).toMatch(/item/)
  })

  test('may leave a field out, and that field is not thereby hidden', () => {
    // Allowed on purpose: a column list is an ordering, not a choice of which
    // answers to keep. The renderer appends the unnamed fields after the configured
    // ones, so nothing a person filled in becomes invisible -- which is the failure
    // this permission would otherwise create.
    expect(errorsFor(documentWith([grid({ columns: [{ field: 'item' }] })]))).toEqual([])
  })

  test('carry a relative width as a number, not a CSS length', () => {
    // No CSS in the document. `width: "12rem"` would be the format deciding the
    // consumer's design system, which is the thing this project exists to avoid,
    // and a fixed length is one no renderer can honour on a narrow screen. A
    // unitless weight is a ratio the renderer spends however it likes.
    expect(errorsFor(documentWith([grid({ columns: [{ field: 'item', width: 2 }] })]))).toEqual([])
    expect(
      errorsFor(documentWith([grid({ columns: [{ field: 'item', width: '12rem' }] })])),
    ).not.toEqual([])
  })

  test('refuse a width of zero, which is a column nobody can see', () => {
    // Not a styling quibble: a zero-width column holds a field that is collected,
    // required-checked and unreachable, which is the same harm as a field left out
    // of the only layout a form uses.
    expect(
      errorsFor(documentWith([grid({ columns: [{ field: 'item', width: 0 }] })])),
    ).not.toEqual([])
  })

  test('are refused on a repeater that is not arranged as a grid', () => {
    // This is the coupling the type version would have enforced structurally.
    // Enforced here instead: `columns` without the widget is an author who
    // configured an arrangement nothing will apply.
    const errors = errorsFor(documentWith([{ ...grid(), widget: undefined }]))
    expect(errors).toEqual([])

    const configured = errorsFor(
      documentWith([{ ...grid(), widget: undefined, columns: [{ field: 'item' }] }]),
    )
    expect(configured).not.toEqual([])
  })

  test('are refused on a field type that has no rows at all', () => {
    const errors = errorsFor(
      documentWith([{ key: 'plain', type: 'text', label: 'Plain', columns: [{ field: 'x' }] }]),
    )
    expect(errors).not.toEqual([])
  })
})

describe('a configured grid in a version 1 document', () => {
  test('is refused by name, with the fix in the message', () => {
    // Two reasons at once -- the widget and the columns -- and the author needs to
    // be told about both rather than fixing one and hitting the other.
    const errors = errorsFor(documentWith([grid({ columns: [{ field: 'item' }] })], '1'))
    expect(errors.join('\n')).toMatch(/specVersion "2"/)
  })
})

describe('datagridColumns', () => {
  const repeater = {
    key: 'items',
    type: 'repeater',
    fields: [
      { key: 'name', type: 'text', label: 'Item name' },
      { key: 'qty', type: 'number', label: 'Quantity' },
      { key: 'note', type: 'text', label: 'Note' },
    ],
  } as unknown as FieldDef

  test('puts the configured columns first, in the order they were written', () => {
    // The plan lives here rather than in each renderer for the reason
    // `narrowOptionsByLabel` does: a grid that ordered its columns one way in React and
    // another in Angular would be two different forms from one document, and nothing
    // would fail -- each renderer's tests would be green against its own ordering.
    const plan = datagridColumns(repeater, [{ field: 'qty' }, { field: 'name' }])

    expect(plan.map((entry) => entry.key)).toEqual(['qty', 'name', 'note'])
  })

  test('appends a child no column names, rather than dropping it', () => {
    // 0066: a column list is an ordering, not a choice of which answers to keep. A child
    // left out of the grid would be an answer nobody can give, which is the failure
    // `unreferencedPaths` exists for.
    const plan = datagridColumns(repeater, [{ field: 'name' }])

    expect(plan.map((entry) => entry.key)).toEqual(['name', 'qty', 'note'])
    expect(plan[1]?.column).toBeUndefined()
    expect(plan[2]?.column).toBeUndefined()
  })

  test('hands back the column and the child together, so a renderer looks nothing up', () => {
    const plan = datagridColumns(repeater, [{ field: 'qty', width: 2, align: 'end' }])

    expect(plan[0]?.column).toEqual({ field: 'qty', width: 2, align: 'end' })
    expect(plan[0]?.child?.label).toBe('Quantity')
  })

  test('survives a column naming a child that is gone', () => {
    // `validateSchema` refuses this, but a renderer is handed documents it did not
    // validate -- the builder edits one between keystrokes. A column with no child keeps
    // its place and carries `undefined`, so the renderer draws an empty cell rather than
    // reading a property of nothing.
    const plan = datagridColumns(repeater, [{ field: 'deleted' }])

    expect(plan[0]?.key).toBe('deleted')
    expect(plan[0]?.child).toBeUndefined()
    expect(plan.map((entry) => entry.key)).toEqual(['deleted', 'name', 'qty', 'note'])
  })

  test('a repeater with no columns still shows every child', () => {
    expect(datagridColumns(repeater, []).map((entry) => entry.key)).toEqual([
      'name',
      'qty',
      'note',
    ])
  })
})

describe('belongsToColumn', () => {
  test('matches the column’s own leaf and everything under it', () => {
    expect(belongsToColumn('items[0].name', 'items[0]', 'name')).toBe(true)
    expect(belongsToColumn('items[0].name.first', 'items[0]', 'name')).toBe(true)
    expect(belongsToColumn('items[0].name[2]', 'items[0]', 'name')).toBe(true)
  })

  test('does not let one child swallow another whose key starts the same way', () => {
    // The bug a bare `startsWith` would have: `name` taking `nameOnCard` with it, so one
    // column holds two answers and the column after it is short by one.
    expect(belongsToColumn('items[0].nameOnCard', 'items[0]', 'name')).toBe(false)
  })

  test('does not reach into another row', () => {
    expect(belongsToColumn('items[1].name', 'items[0]', 'name')).toBe(false)
  })
})
