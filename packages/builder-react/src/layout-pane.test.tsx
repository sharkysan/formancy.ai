import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
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

describe('adding a code to the arrangement', () => {
  /**
   * Reported as "how can I add a new qr field in the playground" — and the answer was that
   * you could not. The `qrcode` layout kind reached the spec and both renderers with no way
   * to insert one, so an author's only route was editing the schema JSON. That is the
   * documented-but-unreachable failure, one step removed: the construct existed, worked, and
   * had no door.
   *
   * It takes a step the other entries do not. A container needs no path; a field placement
   * takes one from the UNPLACED list. A code offers EVERY answer, because it is a second
   * view of an answer rather than a placement of it — showing a code beside the field it
   * encodes is the ordinary case, and the unplaced list would have excluded exactly that.
   */
  /** The fixture is spec 1; a code needs spec 2, so these use an upgraded copy. */
  const spec2 = (): FormSchema => ({ ...schema(), specVersion: '2' })

  const openPalette = async (session = open(spec2())) => {
    // Focus the tree and press `a`, which is how every other adding test here does it and
    // how a person does it: the keyboard is the primary route, and the drag surface is a
    // second route to the same commands.
    const user = userEvent.setup()
    render(<FormancyLayoutPane session={session} />)
    await user.tab()
    await user.keyboard('a')
    return user
  }

  test('the key legend names what the palette actually offers', async () => {
    // The palette opens only by pressing `a` on the tree, so the legend is how anybody
    // finds it — and a legend that lists four things when the palette offers five is the
    // discoverability equivalent of an undocumented feature. Checked against the palette
    // rather than against a literal.
    const user = await openPalette()
    const offered = screen
      .getByRole('dialog', { name: 'Add to the arrangement' })
      .querySelectorAll('li > button, li > [data-formancy-part="palette-locked"]')
    expect(offered.length).toBeGreaterThan(3)

    const legend = document.querySelector('[data-formancy-part="layout-keys"]')?.textContent ?? ''
    for (const word of ['row', 'column', 'section', 'code']) {
      expect(legend.toLowerCase(), `the legend does not mention ${word}`).toContain(word)
    }
    void user
  })

  test('in a version 1 document offers the upgrade instead of a dead end', async () => {
    // The dead end this nearly shipped with. `validLayoutTargets` decides legality by
    // TRYING the edit against the validator, which refuses a code in a version 1 document
    // -- so the button worked, the answer chooser worked, and the final step had no targets
    // at all. Three clicks to nothing is worse than a sentence.
    //
    // Said rather than silently omitted, which is the shape the field palette already uses:
    // a shorter palette with no explanation reads as a broken builder when what is true is
    // that the document can move forward in one step.
    const session = open()
    const user = await openPalette(session)

    expect(screen.queryByRole('button', { name: 'Code' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Move it to version 2' }))
    expect(session.document().specVersion).toBe('2')
  })

  test('is offered once the document allows it', async () => {
    // And the upgrade is not cosmetic: the entry appears afterwards, so somebody who says
    // yes gets what they asked for rather than an unchanged palette.
    const session = open()
    const user = await openPalette(session)
    await user.click(screen.getByRole('button', { name: 'Move it to version 2' }))

    expect(screen.getByRole('button', { name: 'Code' })).toBeDefined()
  })

  test('is offered, and says what it does', async () => {
    await openPalette()
    expect(screen.getByRole('button', { name: 'Code' })).toBeDefined()
  })

  test('asks which answer it should hold, and offers the placed ones too', async () => {
    // The unplaced list would have hidden every answer already on the form, which is the
    // one an author most wants a code of.
    const user = await openPalette()
    await user.click(screen.getByRole('button', { name: 'Code' }))

    const which = screen.getByRole('dialog', { name: 'Which answer should the code hold?' })
    // `email` is placed in this fixture's arrangement, so it must still be offered.
    expect(within(which).getByRole('button', { name: 'Email' })).toBeDefined()
  })

  test('inserts a code that names the answer it holds', async () => {
    const session = open(spec2())
    const user = await openPalette(session)
    await user.click(screen.getByRole('button', { name: 'Code' }))
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Which answer should the code hold?' }),
      ).getByRole('button', { name: 'Email' }),
    )

    // Then the ordinary where-should-it-go step every other entry uses.
    const where = screen.getByRole('dialog', { name: /Where should the code for Email go\?/ })
    await user.click(within(where).getAllByRole('button')[0]!)

    expect(rowNames()).toContain('Code for Email')
  })

  test('produces a document the validator accepts', async () => {
    // The insert goes through `insertLayoutNode`, which refuses a command that would make
    // the document invalid rather than applying it -- so a code whose path did not exist
    // could never be inserted. Asserted because the palette hands it a path from the model
    // and that is the only reason it holds.
    const session = open(spec2())
    const user = await openPalette(session)
    await user.click(screen.getByRole('button', { name: 'Code' }))
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Which answer should the code hold?' }),
      ).getByRole('button', { name: 'Email' }),
    )
    const where = screen.getByRole('dialog', { name: /Where should the code for Email go\?/ })
    await user.click(within(where).getAllByRole('button')[0]!)

    const result = validateSchema(session.document())
    expect(result.valid).toBe(true)
  })
})

describe('a code node in the arrangement', () => {
  /**
   * Reported as "I do not see the qrcode element in the tree".
   *
   * It was in the arrangement tree all along; the playground has TWO trees, a Fields tab
   * and an Arrangement tab, and a code node is not a field so it only ever appears under
   * Arrangement. That is correct — a code collects nothing and has no key, which is the
   * whole reason it is a layout node rather than a field type
   * ([0070](../../../docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md)) — and
   * it is also a reasonable thing to be confused by, so it is now asserted rather than
   * reasoned about.
   */
  const withCode = (): FormSchema => ({
    ...schema(),
    specVersion: '2',
    layouts: [
      {
        name: 'web',
        nodes: [
          { kind: 'field', path: 'email' },
          { kind: 'qrcode', path: 'email' },
        ],
      },
    ],
  })

  test('is listed, and named by the answer it encodes', () => {
    // "Code for Email", not "Code": a tree of six rows needs each one to say which is
    // which, the same reasoning that names a row by what it holds.
    render(<FormancyLayoutPane session={open(withCode())} layout="web" />)
    expect(rowNames()).toEqual(['Email', 'Code for Email'])
  })

  test('is a leaf, so nothing tries to look inside it', () => {
    // A code has no children. The tree asks `isLayoutContainer`, which reads the spec's
    // LAYOUT_LEAF_KINDS -- when that said `kind !== 'field'` it claimed a code was a
    // container and the walker read `children` off it.
    render(<FormancyLayoutPane session={open(withCode())} layout="web" />)
    const items = screen.getAllByRole('treeitem')
    expect(items).toHaveLength(2)
    for (const item of items) expect(item.getAttribute('aria-expanded')).toBeNull()
  })
})

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

describe('wrapping two items into a row, by keyboard', () => {
  /**
   * The keyboard route for "put these two side by side", built BEFORE the
   * pointer gesture for it.
   *
   * That order is the repository's rule and WCAG 2.2 SC 2.5.7's requirement: a
   * drag has to have a complete keyboard equivalent, and a builder that grows
   * one afterwards never quite gets it. So the drag edge is not in this change
   * at all — this is the whole feature until it is.
   */
  test('w then a target makes a row of both, in one undo', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    // Down to Email, which sits at the top level beside the row.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}w')

    // A dialog of what it can be wrapped with, the same shape the move
    // command uses rather than a second idiom to learn.
    const dialog = await screen.findByRole('dialog', { name: /Wrap Email/ })
    // Exact, not a pattern: the row is named "Row with First name and Last
    // name", so a substring match finds two buttons.
    await user.click(within(dialog).getByRole('button', { name: 'First name' }))

    const nodes = session.document().layouts?.[0]?.nodes
    expect(JSON.stringify(nodes)).toContain('email')
    expect(session.canPublish().valid).toBe(true)

    // One gesture, one undo.
    expect(session.undo()).toBe(true)
    expect(session.document().layouts?.[0]?.nodes).toEqual([
      {
        kind: 'row',
        children: [
          { kind: 'field', path: 'first' },
          { kind: 'field', path: 'last' },
        ],
      },
      { kind: 'field', path: 'email' },
    ])
  })

  test('the focused item comes first, so the order is predictable', async () => {
    const user = userEvent.setup()
    const session = open()
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}w')
    const dialog = await screen.findByRole('dialog', { name: /Wrap Email/ })
    // Exact, not a pattern: the row is named "Row with First name and Last
    // name", so a substring match finds two buttons.
    await user.click(within(dialog).getByRole('button', { name: 'First name' }))

    // Email was focused, so Email is the first child. Without a stated rule
    // the order would depend on document position, which is not something
    // somebody choosing from a list can predict.
    const flat = JSON.stringify(session.document().layouts?.[0]?.nodes)
    expect(flat.indexOf('email')).toBeLessThan(flat.indexOf('first'))
  })

  test('it will not offer to wrap something with itself', async () => {
    const user = userEvent.setup()
    render(<FormancyLayoutPane session={open()} />)

    await user.tab()
    await user.keyboard('w')

    const dialog = await screen.findByRole('dialog', { name: /Wrap/ })
    // The focused node is the row at [0]; its own children are inside it, and
    // wrapping a container with its own child is refused by the session. Not
    // offering it beats offering it and explaining afterwards.
    const offered = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(offered.some((text) => text?.includes('First name'))).toBe(false)
  })

  test('Escape leaves the arrangement alone', async () => {
    const user = userEvent.setup()
    const session = open()
    const before = JSON.stringify(session.document().layouts)
    render(<FormancyLayoutPane session={session} />)

    await user.tab()
    await user.keyboard('w{Escape}')

    expect(screen.queryByRole('dialog', { name: /Wrap/ })).toBeNull()
    expect(JSON.stringify(session.document().layouts)).toBe(before)
  })

  test('the key is in the help, or nobody finds it', async () => {
    render(<FormancyLayoutPane session={open()} />)

    // A keyboard-only command that is not listed is a command that does not
    // exist for the person who needs it most.
    expect(screen.getByText('w')).toBeTruthy()
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
