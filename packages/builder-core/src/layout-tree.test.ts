import { describe, expect, test } from 'vitest'
import { describeLayoutTarget, flattenLayout, nameOfPath } from './layout-tree.js'
import type { FormSchema } from '@formancy/spec'

/**
 * Naming an arrangement out loud.
 *
 * This is the accessibility contract of the layout pane, not decoration. A
 * person moving a row without a mouse hears these strings and nothing else,
 * so "Row" three times over fails even though it renders fine.
 */
const schema = (): FormSchema => ({
  specVersion: '1',
  id: 'arranged',
  title: 'Sign-up',
  model: {
    fields: [
      { key: 'first', type: 'text', label: 'First name' },
      { key: 'last', type: 'text', label: 'Last name' },
      { key: 'contact', type: 'group', label: 'Contact', fields: [{ key: 'email', type: 'text', label: 'Email' }] },
      { key: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'section',
          label: 'About you',
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', path: 'first' },
                { kind: 'field', path: 'last' },
              ],
            },
          ],
        },
        { kind: 'field', path: 'contact.email' },
      ],
    },
  ],
})

describe('flattenLayout', () => {
  test('walks a container immediately followed by its contents', () => {
    const rows = flattenLayout(schema(), 'web')

    expect(rows.map((row) => row.path)).toEqual([[0], [0, 0], [0, 0, 0], [0, 0, 1], [1]])
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 2, 0])
  })

  test('an unknown layout is empty rather than a throw', () => {
    expect(flattenLayout(schema(), 'print')).toEqual([])
  })

  test('a labelled container is named by its label', () => {
    expect(flattenLayout(schema(), 'web')[0]?.name).toBe('Section “About you”')
  })

  test('a container names a nested one as what it is, not by its contents', () => {
    const unlabelled: FormSchema = {
      ...schema(),
      layouts: [
        {
          name: 'web',
          nodes: [
            {
              kind: 'section',
              children: [
                { kind: 'row', children: [{ kind: 'field', path: 'first' }, { kind: 'field', path: 'last' }] },
                { kind: 'field', path: 'contact.email' },
              ],
            },
          ],
        },
      ],
    }

    // Recursing all the way gives "Section with Row with First name and Last
    // name and Email", where no reader can tell which "and" separates what.
    expect(flattenLayout(unlabelled, 'web')[0]?.name).toBe('Section with a row and Email')
  })

  test('an unlabelled container is named by what it holds', () => {
    // "Row" tells somebody scanning a list of rows nothing. This is the whole
    // reason describeNode exists.
    expect(flattenLayout(schema(), 'web')[1]?.name).toBe('Row with First name and Last name')
  })

  test('a field node is named by the field it places, through the group path', () => {
    expect(flattenLayout(schema(), 'web')[4]?.name).toBe('Email')
  })
})

describe('nameOfPath', () => {
  test('falls back to the path when no field has it', () => {
    // A layout placing a field that does not exist is invalid, and the builder
    // has to be able to SHOW the broken row rather than render an empty one.
    expect(nameOfPath(schema(), 'gone.missing')).toBe('gone.missing')
  })

  test('resolves through a group', () => {
    expect(nameOfPath(schema(), 'contact.email')).toBe('Email')
  })
})

describe('describeLayoutTarget', () => {
  test('names the layout itself at the top level', () => {
    const said = describeLayoutTarget(schema(), { layout: 'web', parent: [], index: 0 })

    expect(said).toBe('the web layout, before Section “About you”')
  })

  test('names the container and both neighbours', () => {
    const said = describeLayoutTarget(schema(), { layout: 'web', parent: [0, 0], index: 1 })

    expect(said).toBe('Row with First name and Last name, between First name and Last name')
  })

  test('the end of a container says after, not between', () => {
    expect(describeLayoutTarget(schema(), { layout: 'web', parent: [0, 0], index: 2 })).toContain(
      'after Last name',
    )
  })

  test('an empty container says so', () => {
    const empty: FormSchema = {
      ...schema(),
      layouts: [{ name: 'web', nodes: [{ kind: 'row', children: [] }] }],
    }

    expect(describeLayoutTarget(empty, { layout: 'web', parent: [0], index: 0 })).toBe(
      'Empty row, as its first item',
    )
  })

  test('a move excludes the traveller, so it does not name itself as a neighbour', () => {
    // Moving First name to index 1 of its own row. With it lifted there is one
    // sibling left, so the honest sentence is "after Last name" — describing
    // it against the list as it stands would say "between First name and Last
    // name", naming the thing being moved.
    const said = describeLayoutTarget(schema(), { layout: 'web', parent: [0, 0], index: 1 }, [0, 0, 0])

    expect(said).toBe('Row with First name and Last name, after Last name')
  })
})
