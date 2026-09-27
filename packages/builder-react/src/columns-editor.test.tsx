import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { DataGridColumn, FieldDef } from '@formancy/spec'
import { ColumnsEditor } from './columns-editor.js'

afterEach(cleanup)

/**
 * The editor for a datagrid's columns.
 *
 * It was found missing by a guard rather than by a person: `properties.test.ts`
 * walks the schema and asks whether every property is settable, and `columns`
 * was the one it named — the format validated it, both renderers honoured it,
 * and the builder could not write it.
 *
 * The cases below are about the two things a column is that an `options` list is
 * not: it NAMES a child that already exists, and the list is an ORDERING rather
 * than a choice of which answers to keep.
 */
const children: FieldDef[] = [
  { key: 'name', type: 'text', label: 'Item name' },
  { key: 'qty', type: 'number', label: 'Quantity' },
  { key: 'note', type: 'text', label: 'Note' },
] as FieldDef[]

function mount(columns: DataGridColumn[]): { written: DataGridColumn[][] } {
  const written: DataGridColumn[][] = []
  render(
    <ColumnsEditor
      columns={columns}
      children={children}
      onChange={(next) => written.push(next)}
    />,
  )
  return { written }
}

const last = (written: DataGridColumn[][]): DataGridColumn[] => written[written.length - 1] ?? []

describe('the columns editor', () => {
  test('offers the children that exist, never a text box', async () => {
    // A column names a child; a typed name is a column over nothing, which
    // `validateSchema` refuses at publish rather than at the keystroke.
    mount([{ field: 'name' }])

    const chooser = screen.getByLabelText('Answer')
    expect(chooser.tagName.toLowerCase()).toBe('select')
    expect([...(chooser as HTMLSelectElement).options].map((option) => option.value)).toEqual([
      'name',
      'qty',
      'note',
    ])
  })

  test('shows a column naming a child that is gone, rather than silently rewriting it', () => {
    // The panel shows what the document SAYS. Quietly repointing the column at a
    // different answer would be an edit nobody made, and the author would never learn
    // that the field they meant is missing.
    mount([{ field: 'deleted' }])

    const chooser = screen.getByLabelText('Answer') as HTMLSelectElement
    expect(chooser.value).toBe('deleted')
    expect([...chooser.options].map((option) => option.textContent)).toContain(
      'deleted — no such field',
    )
  })

  test('adds a column for an answer that has none, naming the one it will configure', async () => {
    const { written } = mount([{ field: 'name' }])

    // Named rather than "Add a column": the button says which answer it is about, so
    // somebody clicking it knows what they are getting.
    await userEvent.click(screen.getByRole('button', { name: /Configure the qty column/ }))

    expect(last(written)).toEqual([{ field: 'name' }, { field: 'qty' }])
  })

  test('says so when every answer already has a column, instead of offering a fourth', () => {
    // The failure this prevents: a button that adds a duplicate column, which
    // `validateSchema` refuses with "One answer cannot fill two columns".
    mount([{ field: 'name' }, { field: 'qty' }, { field: 'note' }])

    expect(screen.queryByRole('button', { name: /Configure the/ })).toBeNull()
    expect(screen.getByText(/Every answer has a column/)).toBeDefined()
  })

  test('removing a column says it is an ordering, not a deletion', () => {
    // 0066: a column list orders and sizes what is there, it does not choose what is
    // there. An author who removes a column expects the answer to go with it, so the
    // panel says out loud that it does not.
    mount([{ field: 'name' }, { field: 'qty' }, { field: 'note' }])

    expect(screen.getByText(/puts its answer back at the end rather than taking it off/)).toBeDefined()
  })

  test('removes the column it names, and no other', async () => {
    const { written } = mount([{ field: 'name' }, { field: 'qty' }])

    await userEvent.click(screen.getByRole('button', { name: 'Remove the qty column' }))

    expect(last(written)).toEqual([{ field: 'name' }])
  })

  test('writes a width as a number, because a ratio is arithmetic', async () => {
    const { written } = mount([{ field: 'name' }])

    await userEvent.type(screen.getByLabelText('Width, as a share'), '3')

    expect(last(written)).toEqual([{ field: 'name', width: 3 }])
  })

  test('clearing a width removes it rather than writing zero', async () => {
    // An absent width means "an even share"; `width: 0` is refused outright as a
    // column nobody can see. Writing one for the other would hide an answer.
    const { written } = mount([{ field: 'name', width: 2 }])

    await userEvent.clear(screen.getByLabelText('Width, as a share'))

    expect(last(written)).toEqual([{ field: 'name' }])
  })

  test('sets an alignment, and clearing it back to default removes it', async () => {
    const { written } = mount([{ field: 'qty' }])
    const align = screen.getByLabelText('Align')

    await userEvent.selectOptions(align, 'end')
    expect(last(written)).toEqual([{ field: 'qty', align: 'end' }])

    await userEvent.selectOptions(align, '')
    expect(last(written)).toEqual([{ field: 'qty' }])
  })

  test('a short heading shortens the HEADING and not the question', async () => {
    // What a screen reader announces for every answer in the column is still the
    // field's own label — that separation is the reason `header` exists at all.
    const { written } = mount([{ field: 'qty' }])

    await userEvent.type(screen.getByLabelText('Short heading'), 'Qty')

    expect(last(written)).toEqual([{ field: 'qty', header: 'Qty' }])
  })

  test('an emptied heading is removed, not written as an empty string', async () => {
    const { written } = mount([{ field: 'qty', header: 'Qty' }])

    await userEvent.clear(screen.getByLabelText('Short heading'))

    expect(last(written)).toEqual([{ field: 'qty' }])
  })

  test('says what an empty list means, rather than looking broken', () => {
    // No columns is a legal and common state: every answer still gets one, in the
    // order the fields are declared.
    mount([])

    expect(screen.getByText(/Every answer still gets one/)).toBeDefined()
  })

  test('every control has a label, because this is a form builder', () => {
    mount([{ field: 'name' }])

    const controls = [...document.querySelectorAll('input, select')]
    expect(controls.length).toBeGreaterThan(2)
    for (const control of controls) {
      const id = control.getAttribute('id')
      expect(document.querySelector(`label[for="${id ?? ''}"]`), control.outerHTML).not.toBeNull()
    }
  })
})
