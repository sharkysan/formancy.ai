import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema, LayoutNode } from '@formancy/spec'
import { LayoutPropertyPanel } from './layout-property-panel.js'

afterEach(cleanup)

/**
 * The panel that did not exist, and the gap it closed.
 *
 * Until this, NO property of a layout node could be set from the builder: a
 * table's `columns` and a section's `label` since the day layouts existed, and
 * `span` from the moment the format grew it. The format validated them, both
 * renderers honoured them, and the only way to write one was to edit the JSON.
 *
 * Found by a guard rather than by a person — `properties.test.ts` walks the
 * schema and asks whether every property is reachable — which is why these
 * cases are about the panel DOING it rather than about it existing.
 */
const schema: FormSchema = {
  specVersion: '2',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'first', type: 'text', label: 'First name' },
      { key: 'last', type: 'text', label: 'Last name' },
      { key: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'table',
          columns: 2,
          children: [
            { kind: 'field', path: 'first' },
            { kind: 'field', path: 'last' },
            { kind: 'field', path: 'notes' },
          ],
        },
      ],
    },
  ],
} as unknown as FormSchema

function mountAt(path: readonly number[]): BuilderSession {
  const session = createBuilderSession(schema)
  render(<LayoutPropertyPanel session={session} address={{ layout: 'web', path }} />)
  return session
}

const nodeAt = (session: BuilderSession, path: readonly number[]): Record<string, unknown> => {
  let node = session.document().layouts?.[0]?.nodes[path[0]!] as LayoutNode
  for (const step of path.slice(1)) {
    node = (node as { children: LayoutNode[] }).children[step]!
  }
  return node as unknown as Record<string, unknown>
}

describe('the layout property panel', () => {
  test('offers what the schema says this kind has, and nothing it does not', () => {
    mountAt([0])

    // A table sizes its grid and may be named.
    expect(screen.getByLabelText('Columns')).toBeDefined()
    expect(screen.getByLabelText('Heading')).toBeDefined()
    // And it may span, because a table can sit inside a table.
    expect(screen.getByLabelText('Column span')).toBeDefined()

    // `kind`, `children` and `path` are not settings: the first is what the node IS,
    // the second is structure the tree edits, the third is which answer a placement
    // places. Offering them would be offering to break the document.
    expect(screen.queryByLabelText('Kind')).toBeNull()
    expect(screen.queryByLabelText('Cells')).toBeNull()
  })

  test('a placement offers only its span, because everything else about it is structure', () => {
    mountAt([0, 0])

    expect(screen.getByLabelText('Column span')).toBeDefined()
    expect(screen.queryByLabelText('Heading')).toBeNull()
  })

  test('writes a number as a number, which is the whole reason it is not a plain box', async () => {
    // `span` is `anyOf: [integer, const "all"]`, so the control is a text box — and the
    // string "2" is refused by the schema while 2 is accepted. Before the panel knew
    // that, typing a numeric span did nothing and said nothing.
    const session = mountAt([0, 0])

    await userEvent.type(screen.getByLabelText('Column span'), '2')

    expect(nodeAt(session, [0, 0])['span']).toBe(2)
  })

  test('writes the word too, which a number box could never have expressed', async () => {
    const session = mountAt([0, 2])

    await userEvent.type(screen.getByLabelText('Column span'), 'all')

    expect(nodeAt(session, [0, 2])['span']).toBe('all')
  })

  test('clearing a box removes the property rather than writing an empty one', async () => {
    // An empty box means "no value", not "the empty string". `span: ''` is not a thing
    // the schema accepts, and a property the author just cleared must not stay.
    const session = mountAt([0, 1])
    const box = screen.getByLabelText('Column span')

    await userEvent.type(box, 'all')
    expect(nodeAt(session, [0, 1])['span']).toBe('all')

    await userEvent.clear(box)
    expect('span' in nodeAt(session, [0, 1])).toBe(false)
  })

  test('a value the format refuses leaves the document where it was', async () => {
    // Every write is attempted against the validator, so the panel does not have to
    // know that a span may not exceed its table — and cannot drift from the rule
    // publish enforces.
    const session = mountAt([0, 0])

    await userEvent.type(screen.getByLabelText('Column span'), '9')

    expect('span' in nodeAt(session, [0, 0])).toBe(false)
  })

  test('sets a container property, not only a leaf one', async () => {
    const session = mountAt([0])
    const box = screen.getByLabelText('Columns')

    await userEvent.clear(box)
    await userEvent.type(box, '3')

    expect(nodeAt(session, [0])['columns']).toBe(3)
  })

  test('says what it is looking at, without using the label it is about to edit', () => {
    // The node's own `label` cannot be the heading: it is one of the properties this
    // panel edits, so it would be empty exactly when somebody is about to set it, and
    // would change under them as they typed.
    mountAt([0])
    expect(screen.getByRole('heading', { name: 'This grid' })).toBeDefined()

    cleanup()
    mountAt([0, 0])
    expect(screen.getByRole('heading', { name: 'This placement' })).toBeDefined()
  })

  test('renders nothing at all for an address that is not there', () => {
    // A panel that threw would take the whole builder down when an undo removed the
    // node it was showing.
    const session = createBuilderSession(schema)
    const { container } = render(
      <LayoutPropertyPanel session={session} address={{ layout: 'web', path: [9] }} />,
    )

    expect(container.firstChild).toBeNull()
  })

  test('every control it renders has a label, because this is a form builder', () => {
    // A builder whose own panel cannot be used by a screen reader is a poor
    // advertisement for the forms it makes.
    mountAt([0])

    const controls = [...document.querySelectorAll('input, select, textarea')]
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      const id = control.getAttribute('id')
      expect(id, control.outerHTML).not.toBeNull()
      expect(document.querySelector(`label[for="${id ?? ''}"]`), control.outerHTML).not.toBeNull()
    }
  })
})
