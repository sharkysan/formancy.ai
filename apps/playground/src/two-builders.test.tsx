import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { referencedMessages } from '@formancy/builder-core'
import { App } from './app.js'
import { builderTextFor } from './builder-pane.js'
import { STARTER_SCHEMA } from './starter.js'

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
/*
 * Monaco, as a textarea.
 *
 * Wired to `onChange` rather than read-only, so a case can make an edit the
 * way somebody would. It was read-only, which is fine while every case only
 * reads the JSON — and silently does nothing the moment one tries to write,
 * which is how the scenario case below first passed against an unedited form.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (next: string) => void }) => (
    <textarea
      aria-label="Schema"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
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

/**
 * The prompt pane is on screen, and it proposes rather than applies.
 *
 * `@formancy/builder-react` has exported `PromptPane` for a while and **no
 * application mounted it** — the same shape as the Angular builder above, and
 * noticed the same way. A feature that exists in a package and nowhere a
 * visitor can reach is documented and inert, which is the failure this
 * repository has already shipped once.
 *
 * So the playground supplies a stand-in model, exactly as it supplies a
 * stand-in camera: the person plays the model and everything after the answer
 * is real. What is pinned here is that the pane is reachable and that its
 * review step is the one thing it must never skip
 * ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
 */
describe('describing a change in words', () => {
  test('is offered in the builder, with a stand-in model', async () => {
    render(<App />)
    await builtWith('React')

    // By accessible name, like everything else here: the label is the contract.
    expect(screen.getByRole('textbox', { name: /Describe the form/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Write it' })).toBeTruthy()
  })

  test('and an answer is reviewed before anything lands', async () => {
    /*
     * The whole of 0109, end to end through the application. The stand-in
     * model is `window.prompt`, so the test answers it — and then the
     * document must be unchanged until somebody presses apply.
     */
    const user = userEvent.setup()
    render(<App />)
    await builtWith('React')

    /*
     * Asserted on the structure tree rather than on the JSON: the Build pane
     * shows one editor body at a time, so the Schema view is not on screen
     * here — and the tree is what somebody is actually looking at while they
     * decide.
     */
    const tree = screen.getAllByRole('tree', { name: /structure/i })[0]!
    const named = (): string[] =>
      within(tree).getAllByRole('treeitem').map((item) => item.textContent ?? '')
    expect(named().some((entry) => entry.includes('Telephone'))).toBe(false)

    // Undo is the thing the old behaviour relied on. It must still be
    // disabled after the model answers, because nothing has happened yet.
    expect(undoButton().disabled).toBe(true)

    vi.spyOn(window, 'prompt').mockReturnValue(
      JSON.stringify({
        specVersion: '2',
        id: 'proposed',
        title: 'Proposed',
        model: { fields: [{ key: 'phone', type: 'text', label: 'Telephone' }] },
      }),
    )
    await user.type(screen.getByRole('textbox', { name: /Describe the form/ }), 'add a phone number')
    await user.click(screen.getByRole('button', { name: 'Write it' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Review these changes/ })).toBeTruthy(),
    )
    // Proposed, not applied.
    expect(named().some((entry) => entry.includes('Telephone'))).toBe(false)
    expect(undoButton().disabled, 'something was applied before anybody agreed to it').toBe(true)

    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('treeitem')
          .some((item) => (item.textContent ?? '').includes('Telephone')),
      ).toBe(true)
    })
    expect(undoButton().disabled).toBe(false)
  })
})

/**
 * The scenario pane is on screen, and it reacts to an edit.
 *
 * The same shape as the prompt pane above: a capability that exists in a
 * package and nowhere a visitor can reach is documented and inert. What is
 * pinned here is that the panel is reachable and that it answers the question
 * it exists for — which example stopped holding — through the whole
 * application rather than in a unit test over a three-field form
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 */
describe('what the starter form is supposed to do', () => {
  test('is listed beside it, and holds', async () => {
    render(<App />)
    await builtWith('React')

    await waitFor(() => {
      const said = screen
        .getAllByRole('status')
        .map((region) => region.textContent ?? '')
        .join(' | ')
      expect(said).toContain('scenarios hold')
    })
  })

  test('and an edit in the builder that breaks one names it, rather than counting', async () => {
    /*
     * Deleting a field some scenario is about. The document still validates,
     * the engine still opens it, every other gate here is satisfied — and an
     * answer the form used to check is no longer collected. Only an example
     * with its answer written down notices, and it has to NAME the example:
     * "4 of 5 hold" sends somebody back to the document to work out which.
     *
     * `postcode` rather than `canton`, and the reason is worth recording:
     * deleting `canton` is **refused**, because a rule reads it and the
     * builder will not leave a condition pointing at nothing
     * ([0093](../../../docs/decisions/0093-a-rule-follows-the-path-it-reads.md)).
     * So the edit that breaks a scenario here is one the builder is perfectly
     * happy with, which is the honest case: the dangerous edits are the ones
     * nothing else objects to.
     */
    const user = userEvent.setup()
    render(<App />)
    await builtWith('React')
    await waitFor(() =>
      expect(
        screen.getAllByRole('status').map((region) => region.textContent ?? '').join(' | '),
      ).toContain('scenarios hold'),
    )

    const postcode = screen
      .getAllByRole('treeitem')
      .find((item) => /post\s*code/i.test(item.textContent ?? ''))
    expect(postcode, 'the starter no longer has the field this case is about').toBeDefined()
    await user.click(postcode!)
    await user.keyboard('{Delete}')

    await waitFor(() => {
      const said = screen
        .getAllByRole('status')
        .map((region) => region.textContent ?? '')
        .join(' | ')
      expect(said).toContain('a postcode has to look like one')
    })
  })
})

describe('the Language switch', () => {
  test('speaks for the builder as well as the form, in both builders', async () => {
    /*
     * One control, two claims: the form speaks the reader's language and the
     * builder the author's. Choosing German re-opens the same text in the
     * builder's German words (0114) — in the React tree and the Angular one,
     * because they share the session that carries the language.
     */
    render(<App />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Build' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de')

    expect(await screen.findByRole('tree', { name: 'Formularstruktur' })).toBeTruthy()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Builder' }), 'angular')
    await waitFor(
      () => expect(screen.getAllByRole('tree', { name: 'Formularstruktur' }).length).toBeGreaterThan(0),
      { timeout: 10_000 },
    )

    // And French, which the builder ships complete.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr')
    await waitFor(
      () =>
        expect(screen.getAllByRole('tree', { name: 'Structure du formulaire' }).length).toBeGreaterThan(0),
      { timeout: 10_000 },
    )
  })
})

/**
 * The Translations tab, in both builders.
 *
 * `TranslationsPane` and `formancy-translations-pane` ship in the two builder
 * packages and were mounted only in the admin. The starter's French is
 * half-finished on purpose, so a visitor could watch the form fall back to English
 * and could not see the other half of the feature — where a translator finds what
 * is missing and finishes it. The same documented-and-inert shape as the prompt
 * pane above.
 *
 * What is pinned is what a translator sees on choosing French: every message the
 * form refers to, in the order a reader meets them, with the French beside it where
 * there is some and a mark where there is none. The expectation is derived from the
 * starter's own catalogue rather than counted here, so a translation added to it
 * moves the expectation with it instead of breaking a number.
 */
describe('the Translations tab', () => {
  /** The pane's own mark for an untranslated message, in the words the builder ships. */
  const missing = builderTextFor('en')('translations.missing')

  const { en = {}, fr = {} } = STARTER_SCHEMA.i18n.messages
  /** One row per referenced message: its English, its French or nothing, and whether it is marked. */
  const expected = referencedMessages(STARTER_SCHEMA).map((id) => ({
    source: en[id],
    french: fr[id] ?? '',
    marked: fr[id] === undefined,
  }))

  /**
   * The table with a French column, among the tables in the Editor pane.
   *
   * Found by its column header rather than by position, because the pane's preview
   * renders the form underneath, and the form's matrix is a table too.
   */
  const translationsTable = (editor: HTMLElement): HTMLElement => {
    const table = within(editor)
      .getAllByRole('table')
      .find((candidate) => within(candidate).queryByRole('columnheader', { name: 'fr' }) !== null)
    expect(table, 'no table in the Editor pane has a French column').toBeDefined()
    return table!
  }

  /** The table as a translator reads it: the English, what is typed beside it, and the mark. */
  const rowsOf = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .filter((row) => within(row).queryByRole('rowheader') !== null)
      .map((row) => ({
        source: within(row).getByRole('rowheader').textContent,
        french: (within(row).getByRole('textbox') as HTMLInputElement).value,
        marked: within(row).queryByText(missing) !== null,
      }))

  test('the starter’s French is still half-finished, so there is something to show', () => {
    // A guard on the case below: a French catalogue somebody finished, or emptied,
    // would let it pass while showing nothing half-finished at all.
    expect(expected.some((row) => row.marked), 'the starter’s French is complete').toBe(true)
    expect(expected.some((row) => !row.marked), 'the starter has no French at all').toBe(true)
  })

  test.each(['React', 'Angular'] as const)(
    'is reached by name in the %s builder, and shows what is missing from the French',
    async (which) => {
      /*
       * Prevents the pane being in a package and nowhere a visitor can reach: no
       * Translations button, or one that opens the wrong pane, fails here before
       * anything about the French is asked.
       */
      render(<App />)
      await builtWith(which)
      // The Angular builder bootstraps asynchronously; a tab chosen before it
      // exists is a different question from whether the tab works.
      if (which === 'Angular') await angularTree()

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Translations' }))

      // Scoped to the Editor pane: the page's own Language switch in the bar has the
      // same name, and chooses the language the form is READ in rather than the one
      // being translated.
      const editor = screen.getByRole('region', { name: 'Editor' })
      const language = await waitFor(
        () => within(editor).getByRole('combobox', { name: 'Language' }),
        { timeout: 10_000 },
      )
      await user.selectOptions(language, 'fr')

      await waitFor(() => expect(rowsOf(translationsTable(editor))).toEqual(expected), {
        timeout: 10_000,
      })
    },
  )
})
