import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'

/**
 * One document, two builders.
 *
 * `@formancy/builder-angular` was complete, published, and mounted by no
 * application — and, it turned out, **not importable from anywhere in the
 * workspace**: its manifest carried no `exports`, so a sibling package could not
 * resolve it at all. Both facts have the same shape, and the second is the
 * reason the first went unnoticed.
 *
 * This is a stronger claim than the renderers' one. The two renderers get an
 * engine each, because element ids are minted per engine
 * ([0095](../../../docs/decisions/0095-one-schema-two-renderers.md)). The two
 * builders share **one session**, because a session is the document and there is
 * only one document — so an edit made in the Angular tree has to appear in the
 * JSON and in the rendered forms, and switching builders has to keep the undo
 * stack, since there is only one of those too.
 *
 * Queried by role and accessible name only ([0034]), which is also the only way
 * to compare two builders: the markup is each package's own on purpose.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => (
    <textarea readOnly aria-label="Schema" value={value ?? ''} />
  ),
  useMonaco: () => null,
}))

afterEach(cleanup)

/**
 * The toolbar's Undo, read fresh each time.
 *
 * `disabled` rather than a jest-dom matcher, which this suite does not install —
 * and the property is the thing the browser acts on anyway.
 */
const undoButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement

/** Open the Build pane, then choose which builder is on screen. */
const builtWith = async (which: 'React' | 'Angular'): Promise<void> => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Build' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Builder' }), which.toLowerCase())
}

/** The Angular builder's own structure tree, waited for rather than assumed. */
const angularTree = async (): Promise<HTMLElement> =>
  waitFor(
    () => {
      const trees = screen.getAllByRole('tree', { name: /structure/i })
      const found = trees.at(-1)
      expect(found, 'the Angular builder never rendered a tree').toBeDefined()
      return found!
    },
    { timeout: 10_000 },
  )

describe('switching which builder is on screen', () => {
  test('mounts the Angular builder, and it renders the document', async () => {
    render(<App />)
    await builtWith('Angular')

    const tree = await angularTree()

    // The alert the pane shows when its bootstrap throws. Asserted absent,
    // because otherwise a failed mount and a slow one look the same.
    expect(screen.queryByRole('alert', { name: /did not start/i })).toBeNull()
    // The starter document's first field, by accessible name.
    expect(within(tree).getAllByRole('treeitem').length).toBeGreaterThan(3)
  })

  test('and an edit there reaches the JSON, which is the shared session', async () => {
    /*
     * The assertion a mount check cannot make. The Angular builder could render
     * the document perfectly and be bound to a session of its own — nothing on
     * screen would say so, and every claim about parity would be about two
     * documents that happen to start the same.
     *
     * So: undo. The document is loaded, nothing has been edited, and both
     * builders show the same session — so Undo is disabled. Delete a field in
     * the Angular tree and it must become enabled, because the session that
     * recorded the edit is the one the React toolbar is reading.
     */
    render(<App />)
    await builtWith('Angular')
    await angularTree()

    expect(undoButton().disabled, 'Undo was already enabled before any edit').toBe(true)

    const tree = await angularTree()
    const first = within(tree).getAllByRole('treeitem')[0]!
    const user = userEvent.setup()
    await user.click(first)
    await user.keyboard('{Delete}')

    await waitFor(() => {
      expect(undoButton().disabled).toBe(false)
    })
  })

  test('and switching back keeps the document and the undo stack', async () => {
    // There is one session, so there is one undo stack. A builder that owned its
    // own would reset this, and the only way to see that is to cross over.
    render(<App />)
    await builtWith('Angular')
    const tree = await angularTree()

    const user = userEvent.setup()
    await user.click(within(tree).getAllByRole('treeitem')[0]!)
    await user.keyboard('{Delete}')
    await waitFor(() => {
      expect(undoButton().disabled).toBe(false)
    })

    await builtWith('React')

    // Still enabled, and still undoable, after the Angular application is gone.
    expect(undoButton().disabled, 'the undo stack did not survive the switch').toBe(false)
    await user.click(undoButton())
    await waitFor(() => {
      expect(undoButton().disabled).toBe(true)
    })
  })
})
