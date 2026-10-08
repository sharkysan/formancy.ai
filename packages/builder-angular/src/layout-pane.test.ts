import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyLayoutPane } from './layout-pane'

/**
 * The arrangement tree, which must behave as the React one does.
 *
 * A separate pane rather than a mode of the structure tree, for the reason the
 * React one gives: the model answers *what does this form collect* and the
 * arrangement answers *where does it appear*, and a field can be in one without
 * being in the other. One tree showing both would have to pretend those are the
 * same question.
 *
 * Same assertions as `packages/builder-react/src/layout-pane.test.tsx`, by role
 * and accessible name only.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const schema: FormSchema = {
  specVersion: '2',
  id: 'order',
  title: 'Order',
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
}

interface Mounted {
  session: BuilderSession
  /** Flush the render a change causes, as press and click already do. */
  settle(): Promise<void>
  press(keys: string): Promise<void>
  click(element: Element): Promise<void>
  tab(): Promise<void>
}

const mount = async (form: FormSchema = schema): Promise<Mounted> => {
  const session = createBuilderSession(form)
  const view = await render(FormancyLayoutPane, {
    componentInputs: { session },
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()

  const user = userEvent.setup()
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
  }
  return {
    session,
    settle,
    press: async (keys) => {
      await user.keyboard(keys)
      await settle()
    },
    click: async (element) => {
      await user.click(element as HTMLElement)
      await settle()
    },
    tab: async () => {
      await user.tab()
      await settle()
    },
  }
}

const items = (): string[] =>
  screen.getAllByRole('treeitem').map((item) => item.textContent?.trim() ?? '')

/** A dialog's choices, which are its buttons minus the way out of it. */
const choices = (dialog: HTMLElement): HTMLElement[] =>
  within(dialog)
    .getAllByRole('button')
    .filter((button) => !/cancel/i.test(button.textContent ?? ''))

describe('the arrangement tree', () => {
  test('lists the arrangement, containers before what is in them', async () => {
    await mount()

    // A row, then the two fields inside it, then the field beside it.
    expect(items().length).toBe(4)
    const levels = screen.getAllByRole('treeitem').map((item) => item.getAttribute('aria-level'))
    expect(levels).toEqual(['1', '2', '2', '1'])
  })

  test('is one tab stop, and the arrows do the rest', async () => {
    const { tab, press } = await mount()

    await tab()
    expect(screen.getAllByRole('treeitem').filter((item) => item.tabIndex === 0)).toHaveLength(1)

    await press('{ArrowDown}')
    expect(document.activeElement?.textContent?.trim()).toBe(items()[1])
  })

  test('u unwraps a row and leaves what was in it where it was', async () => {
    const { session, tab, press } = await mount()
    await tab()

    await press('u')

    // The row is gone; the two fields it held are still placed.
    const nodes = session.document().layouts?.[0]?.nodes ?? []
    expect(nodes.map((node) => node.kind)).toEqual(['field', 'field', 'field'])
    expect(screen.getByRole('status').textContent).toMatch(/unwrapped/i)
  })

  test('w puts two items side by side, which is what a row IS', async () => {
    const { session, tab, press, click } = await mount()
    await tab()
    // Down to the field beside the row, which has something to pair with.
    await press('{End}')

    await press('w')
    const dialog = screen.getByRole('dialog', { name: /beside|row|wrap/i })
    await click(choices(dialog)[0]!)

    expect(screen.getByRole('status').textContent).toMatch(/side by side|row/i)
    // A row now holds the pair, wherever it landed.
    const json = JSON.stringify(session.document().layouts?.[0]?.nodes ?? [])
    expect(json).toContain('"row"')
  })

  test('and says so rather than opening an empty dialog when there is nothing to pair with', async () => {
    const { tab, press } = await mount({
      specVersion: '2',
      id: 'one',
      title: 'One',
      model: { fields: [{ key: 'only', type: 'text', label: 'Only' }] },
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'only' }] }],
    })
    await tab()

    await press('w')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/nothing to put beside/i)
  })

  test('Delete takes a field out of the arrangement and says the form still collects it', async () => {
    // The distinction this pane exists to make. Anything else reads as having
    // deleted the question.
    const { session, tab, press } = await mount()
    await tab()
    await press('{End}')

    await press('{Delete}')

    expect(session.document().model.fields.map((field) => field.key)).toContain('email')
    expect(screen.getByRole('status').textContent).toMatch(/still collects it/i)
  })

  test('and a field the arrangement leaves out is named, not hidden', async () => {
    // A field collected by the form and absent from the only arrangement is
    // invisible to everyone filling it in, and that is the mistake this pane can
    // prevent — so it is a heading rather than a silence.
    const { tab, press } = await mount()
    await tab()
    await press('{End}')
    await press('{Delete}')

    const unplaced = screen.getByRole('heading', { name: /not in this arrangement/i })
    expect(unplaced).toBeTruthy()
    expect(unplaced.parentElement?.textContent).toMatch(/Email/)
  })

  test('m offers destinations as sentences, and moving announces itself', async () => {
    const { tab, press, click } = await mount()
    await tab()
    await press('{End}')

    await press('m')
    const dialog = screen.getByRole('dialog', { name: /move/i })
    const labels = choices(dialog).map((button) => button.textContent?.trim() ?? '')
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) expect(label).not.toMatch(/^\d+$/)

    await click(choices(dialog)[0]!)
    expect(screen.getByRole('status').textContent).toMatch(/moved/i)
  })

  test('a adds a container, and Escape leaves without adding one', async () => {
    const { session, tab, press } = await mount()
    await tab()

    await press('a')
    expect(screen.getByRole('dialog', { name: /add/i })).toBeTruthy()

    await press('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(session.document().layouts?.[0]?.nodes.length).toBe(2)
  })

  test('a field the arrangement leaves out can be placed, not only listed', async () => {
    // This pane named the unplaced field under a heading and offered three
    // containers when asked to add something — so the mistake it pointed at was
    // one it gave no way to fix. The offer is builder-core's now, the React one.
    const { session, tab, press, click } = await mount()
    await tab()
    await press('{End}')
    await press('{Delete}')

    await press('a')
    await click(
      within(screen.getByRole('dialog', { name: /add/i })).getByRole('button', { name: 'Email' }),
    )
    const where = screen.getByRole('dialog', { name: /where should email go/i })
    await click(choices(where)[0]!)

    expect(session.unplacedFields('web')).toEqual([])
    expect(screen.getByRole('status').textContent).toMatch(/^Added Email to /)
  })

  test('a code can be added, showing an answer and labelled after it', async () => {
    const { session, tab, press, click } = await mount()
    await tab()

    await press('a')
    await click(
      within(screen.getByRole('dialog', { name: /add/i })).getByRole('button', { name: 'Code' }),
    )
    await click(
      within(screen.getByRole('dialog', { name: /which answer/i })).getByRole('button', {
        name: 'Email',
      }),
    )
    await click(choices(screen.getByRole('dialog', { name: /the code for email/i }))[0]!)

    const nodes = JSON.stringify(session.document().layouts?.[0]?.nodes)
    expect(nodes).toContain('"kind":"qrcode"')
    expect(nodes).toContain('"label":"Email as a code"')
  })

  test('a code in a version 1 form is offered with the upgrade, not as a dead end', async () => {
    const { session, tab, press, click } = await mount({
      ...schema,
      specVersion: '1',
      layouts: [{ name: 'web', nodes: [{ kind: 'field', path: 'first' }] }],
    })
    await tab()

    await press('a')
    const dialog = screen.getByRole('dialog', { name: /add/i })
    expect(within(dialog).queryByRole('button', { name: 'Code' })).toBeNull()
    await click(within(dialog).getByRole('button', { name: /move it to version 2/i }))

    expect(session.document().specVersion).toBe('2')
  })

  test('a form with no arrangement says what that means and offers one', async () => {
    const { session, click } = await mount({ ...schema, layouts: [] })

    expect(screen.getByText(/has no arrangement/)).toBeTruthy()
    await click(screen.getByRole('button', { name: 'Add an arrangement' }))

    expect(session.document().layouts?.map((layout) => layout.name)).toEqual(['web'])
  })

  test('Escape inside a dialog closes it, where Cancel was the only way out', async () => {
    const { tab, press } = await mount()
    await tab()
    await press('a')
    // Focus inside the dialog, so the tree's own Escape cannot be the one that answers.
    within(screen.getByRole('dialog', { name: /add/i }))
      .getAllByRole('button')[0]!
      .focus()

    await press('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Ctrl+Z undoes an arrangement edit like any other', async () => {
    const { session, tab, press } = await mount()
    await tab()
    await press('u')

    await press('{Control>}z{/Control}')

    expect(session.document().layouts?.[0]?.nodes[0]?.kind).toBe('row')
  })

  test('every shortcut is listed, and the parts a theme dresses are named', async () => {
    await mount()

    for (const key of ['a', 'm', 'u', 'w', 'Delete']) {
      expect(screen.getByText(key), `no legend entry for ${key}`).toBeTruthy()
    }
    const parts = [...document.querySelectorAll('[data-formancy-part]')].map((element) =>
      element.getAttribute('data-formancy-part'),
    )
    for (const part of ['layout-pane', 'layout-tree', 'layout-node', 'layout-keys']) {
      expect(parts, `no ${part}`).toContain(part)
    }
  })
})

/*
 * Dragging, which is the SECOND way to reach these commands. Everything above
 * works without it, which is what WCAG 2.2 SC 2.5.7 asks for and the order this
 * was built in.
 */
describe('dragging in the arrangement', () => {
  const dragFromTo = (from: string, to: string, edge: 'top' | 'bottom'): void => {
    const source = screen.getByRole('treeitem', { name: from })
    const target = screen.getByRole('treeitem', { name: to })
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: () => undefined,
      getData: () => '',
    }
    // MouseEvents, because jsdom has no DragEvent and the fallback drops
    // `clientY` — so both edges arrive undefined and every drop lands below the
    // target, which is half of what this decides.
    const at = (type: string): Event => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY: edge === 'top' ? -1 : 1,
      })
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
      return event
    }
    source.dispatchEvent(at('dragstart'))
    target.dispatchEvent(at('dragover'))
    target.dispatchEvent(at('drop'))
  }

  test('a node can be dragged to another position, and it is announced', async () => {
    const { session, settle } = await mount()
    const before = JSON.stringify(session.document().layouts?.[0]?.nodes)

    dragFromTo('Email', 'First name', 'top')
    await settle()

    expect(JSON.stringify(session.document().layouts?.[0]?.nodes)).not.toBe(before)
    // Through the same live region the keyboard path uses, so a drag is not a
    // silent command for somebody using both — and by name, which "Moved." was not.
    expect(screen.getByRole('status').textContent).toBe('Moved Email.')
  })

  test('and a drop the session would refuse changes nothing', async () => {
    const { session, settle } = await mount()
    const before = JSON.stringify(session.document().layouts?.[0]?.nodes)

    // A container onto something inside itself.
    dragFromTo(items()[0] ?? '', 'First name', 'bottom')
    await settle()

    expect(JSON.stringify(session.document().layouts?.[0]?.nodes)).toBe(before)
  })
})
