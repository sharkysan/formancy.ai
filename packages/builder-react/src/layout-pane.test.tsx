import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyLayoutPane } from './layout-pane.js'

afterEach(cleanup)

/**
 * The arrangement editor, exercised the way the conformance suite insists on:
 * by role and accessible name only, never by test id and never by CSS.
 *
 * Every move here is done with the keyboard, because that is the path SC 2.5.7
 * requires and the one that gets skipped. The drag surface is a second route
 * to the same commands; its arithmetic is tested directly in layout-drop.
 */
const schema = (): FormSchema => ({
  specVersion: '1',
  id: 'arranged',
  title: 'Sign-up',
  model: {
    fields: [
      { key: 'first', type: 'text', label: 'First name' },
      { key: 'last', type: 'text', label: 'Last name' },
      { key: 'email', type: 'text', label: 'Email' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'first' },
            { kind: 'field', path: 'last' },
          ],
        },
        { kind: 'field', path: 'email' },
      ],
    },
  ],
})

const open = (document: FormSchema = schema()): BuilderSession => createBuilderSession(document)

const rowNames = (): string[] =>
  screen.getAllByRole('treeitem').map((item) => item.textContent ?? '')

describe('reading the arrangement', () => {
  test('shows every node, naming containers by what they hold', () => {
    render(<FormancyLayoutPane session={open()} />)

    expect(rowNames()).toEqual([
      'Row with First name and Last name',
      'First name',
      'Last name',
      'Email',
    ])
  })

  test('nesting is in aria-level, not only in indentation', () => {
    render(<FormancyLayoutPane session={open()} />)

    const items = screen.getAllByRole('treeitem')
    expect(items[0]?.getAttribute('aria-level')).toBe('1')
    expect(items[1]?.getAttribute('aria-level')).toBe('2')
  })

  test('the whole tree is one tab stop, not one per node', async () => {
    const user = userEvent.setup()
    render(<FormancyLayoutPane session={open()} />)

    await user.tab()
    expect(globalThis.document.activeElement).toBe(screen.getAllByRole('treeitem')[0])

    // A twenty-row arrangement must not cost twenty tabs to get past.
    await user.tab()
    expect(globalThis.document.activeElement).not.toBe(screen.getAllByRole('treeitem')[1])
  })
})

describe('moving by keyboard', () => {
  test('m offers destinations as sentences, and choosing one moves the node', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}') // Last name, inside the row
    await user.keyboard('m')

    const dialog = screen.getByRole('dialog', { name: 'Move Last name' })
    expect(dialog).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'the web layout, after Email' }))

    expect(session.document().layouts?.[0]?.nodes).toEqual([
      { kind: 'row', children: [{ kind: 'field', path: 'first' }] },
      { kind: 'field', path: 'email' },
      { kind: 'field', path: 'last' },
    ])
  })

  test('a node with nowhere to go is told so rather than shown an empty dialog', async () => {
    const user = userEvent.setup()
    const session = open({
      ...schema(),
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'first' }] }],
    })
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('m')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('cannot be moved anywhere else')
  })
})

describe('adding', () => {
  test('a row, then where it goes', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('a')
    await user.click(screen.getByRole('button', { name: 'Row' }))
    await user.click(screen.getByRole('button', { name: 'the web layout, after Email' }))

    const nodes = session.document().layouts?.[0]?.nodes ?? []
    expect(nodes).toHaveLength(3)
    expect(nodes[2]).toEqual({ kind: 'row', children: [] })
  })

  test('the palette offers the fields this arrangement leaves out, and nothing else', async () => {
    const user = userEvent.setup()
    const session = open({
      ...schema(),
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'first' }] }],
    })
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('a')

    expect(screen.getByRole('button', { name: 'Last name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Email' })).toBeTruthy()
    // Already placed: offering it would produce a document the validator
    // refuses, and a palette entry that always fails is worse than no entry.
    expect(screen.queryByRole('button', { name: 'First name' })).toBeNull()
  })

  test('placing a field puts it where the person chose', async () => {
    const user = userEvent.setup()
    const session = open({
      ...schema(),
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'first' }] }],
    })
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('a')
    await user.click(screen.getByRole('button', { name: 'Email' }))
    await user.click(screen.getByRole('button', { name: 'the web layout, before First name' }))

    expect(session.document().layouts?.[0]?.nodes[0]).toEqual({ kind: 'field', path: 'email' })
  })
})

describe('removing and unwrapping', () => {
  test('Delete says the form still collects the field', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}') // Email
    await user.keyboard('{Delete}')

    // Taking a field out of an arrangement is not deleting it, and a builder
    // that says "Removed Email" invites somebody to think their data is gone.
    expect(screen.getByRole('status').textContent).toContain('The form still collects it')
    expect(session.unplacedFields('web')).toEqual(['email'])
  })

  test('u keeps what was inside the row', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('u')

    expect(session.document().layouts?.[0]?.nodes).toEqual([
      { kind: 'field', path: 'first' },
      { kind: 'field', path: 'last' },
      { kind: 'field', path: 'email' },
    ])
  })

  test('u on a field refuses, in the session’s words', async () => {
    const user = userEvent.setup()
    render(<FormancyLayoutPane session={open()} />)

    await user.tab()
    await user.keyboard('{ArrowDown}u')

    expect(screen.getByRole('status').textContent).toContain('Cannot unwrap')
  })
})

describe('what the arrangement leaves out', () => {
  test('is named, because an unplaced field is invisible to everyone filling it in', () => {
    render(
      <FormancyLayoutPane
        session={open({
          ...schema(),
          layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'first' }] }],
        })}
      />,
    )

    const heading = screen.getByRole('heading', { name: 'Not in this arrangement' })
    expect(heading).toBeTruthy()
    expect(heading.parentElement?.textContent).toContain('Email')
  })

  test('is absent when everything is placed', () => {
    render(<FormancyLayoutPane session={open()} />)

    expect(screen.queryByRole('heading', { name: 'Not in this arrangement' })).toBeNull()
  })
})

describe('a form with no arrangement at all', () => {
  test('explains what that means rather than showing an empty tree', () => {
    const { layouts: _none, ...bare } = schema()
    render(<FormancyLayoutPane session={open(bare)} />)

    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add an arrangement' })).toBeTruthy()
  })

  test('and one button away from having one', async () => {
    const user = userEvent.setup()
    const { layouts: _none, ...bare } = schema()
    const session = open(bare)
    render(<FormancyLayoutPane session={session} />)

    await user.click(screen.getByRole('button', { name: 'Add an arrangement' }))

    expect(session.document().layouts).toEqual([{ name: 'web', nodes: [] }])
    expect(screen.getByRole('tree')).toBeTruthy()
  })
})

describe('undo', () => {
  test('reaches layout commands like any other', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('u')
    expect(session.document().layouts?.[0]?.nodes).toHaveLength(3)

    await user.keyboard('{Control>}z{/Control}')

    expect(session.document().layouts?.[0]?.nodes).toHaveLength(2)
  })
})

/**
 * Dragging, which is the SECOND way to reach these commands. Everything above
 * happens without it, which is what SC 2.5.7 asks for; these keep that true.
 */
describe('dragging', () => {
  const transfer = (): object => ({
    effectAllowed: '',
    dropEffect: '',
    setData: () => undefined,
    getData: () => '',
  })

  /**
   * Dispatched as MouseEvents. jsdom has no DragEvent and Testing Library's
   * fallback drops clientY, so both edges would arrive as `undefined` and
   * every drop would land below its target — half of what this code decides.
   * Every box is zero-sized here, so the sign of clientY picks the edge.
   */
  const dragFromTo = (from: string, to: string, edge: 'top' | 'bottom'): void => {
    const dataTransfer = transfer()
    const at = (type: string): Event => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY: edge === 'top' ? -1 : 1,
      })
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
      return event
    }

    fireEvent(screen.getByRole('treeitem', { name: from }), at('dragstart'))
    fireEvent(screen.getByRole('treeitem', { name: to }), at('dragover'))
    fireEvent(screen.getByRole('treeitem', { name: to }), at('drop'))
  }

  test('a field can be dragged out of its row', () => {
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    dragFromTo('Last name', 'Email', 'bottom')

    expect(session.document().layouts?.[0]?.nodes).toEqual([
      { kind: 'row', children: [{ kind: 'field', path: 'first' }] },
      { kind: 'field', path: 'email' },
      { kind: 'field', path: 'last' },
    ])
  })

  test('the upper half means before it', () => {
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    dragFromTo('Email', 'First name', 'top')

    expect(session.document().layouts?.[0]?.nodes[0]).toEqual({
      kind: 'row',
      children: [
        { kind: 'field', path: 'email' },
        { kind: 'field', path: 'first' },
        { kind: 'field', path: 'last' },
      ],
    })
  })

  test('a drop the session would refuse is refused before it starts', () => {
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    // The row into its own child. An indicator here would promise a move that
    // cannot happen, and the row would snap back with no explanation.
    dragFromTo('Row with First name and Last name', 'First name', 'top')

    expect(session.canUndo()).toBe(false)
  })

  test('a drop is announced through the live region the keyboard path uses', () => {
    render(<FormancyLayoutPane session={open()} />)

    dragFromTo('Last name', 'Email', 'bottom')

    expect(screen.getByRole('status').textContent).toBe('Moved.')
  })

  test('the keyboard path still works afterwards, because it never depended on this', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    dragFromTo('Last name', 'Email', 'bottom')

    await user.tab()
    await user.keyboard('u')

    expect(session.document().layouts?.[0]?.nodes[0]).toEqual({ kind: 'field', path: 'first' })
  })
})

describe('moving around the tree', () => {
  test('Home and End reach both ends', async () => {
    const user = userEvent.setup()
    render(<FormancyLayoutPane session={open()} />)

    await user.tab()
    await user.keyboard('{End}')
    expect(globalThis.document.activeElement?.textContent).toBe('Email')

    await user.keyboard('{Home}')
    expect(globalThis.document.activeElement?.textContent).toBe('Row with First name and Last name')
  })

  test('the arrows stop at the ends rather than wrapping', async () => {
    const user = userEvent.setup()
    render(<FormancyLayoutPane session={open()} />)

    await user.tab()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(globalThis.document.activeElement?.textContent).toBe('Row with First name and Last name')

    await user.keyboard('{End}{ArrowDown}')
    expect(globalThis.document.activeElement?.textContent).toBe('Email')
  })

  test('a key the pane does not use is left to the browser', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('{Alt>}m{/Alt}')

    // Alt+m is somebody's browser shortcut. Swallowing it would take it away.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(session.canUndo()).toBe(false)
  })

  test('Ctrl+Y redoes what Ctrl+Z undid', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('u')
    await user.keyboard('{Control>}z{/Control}')
    await user.keyboard('{Control>}y{/Control}')

    expect(session.document().layouts?.[0]?.nodes).toHaveLength(3)
  })

  test('undo with nothing to undo says so instead of doing nothing quietly', async () => {
    const user = userEvent.setup()
    render(<FormancyLayoutPane session={open()} />)

    await user.tab()
    await user.keyboard('{Control>}z{/Control}')

    expect(screen.getByRole('status').textContent).toBe('Nothing to undo.')
  })
})

describe('cancelling', () => {
  test('the add palette leaves the document alone', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('a')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(session.canUndo()).toBe(false)
  })

  test('the move palette does too', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('{ArrowDown}m')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(session.canUndo()).toBe(false)
  })
})
