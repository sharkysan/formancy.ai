import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { referencedMessages } from '@formancy/builder-core'
import { App } from './app.js'
import { TAB_NAMES, builderTextFor } from './builder-pane.js'
import { STARTER_SCHEMA } from './starter.js'
import { STARTER_SCENARIOS } from './starter-scenarios.js'

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

/**
 * The examples, in both builders, from one list the page keeps.
 *
 * The scenarios are the host's (0111): the pane lists, reruns and removes, and the page
 * decides where the list lives. Here it lived nowhere. The React pane was handed the
 * constant and no `onChange`, so it drew no Remove button, and the Angular builder — whose
 * host says its panels mirror the React pane's — mounted no scenario panel at all. The page
 * now keeps the list as it keeps the blocks (0135): one list, for this visit, handed to both.
 */
describe('the examples, in either builder', () => {
  /** The scenario panel on screen, by its accessible name. The Angular one mounts late. */
  const scenarioPanel = async (): Promise<HTMLElement> =>
    waitFor(() => screen.getByRole('region', { name: 'Scenarios' }), { timeout: 10_000 })

  /** What the panel offers to remove — one button per example, named after it. */
  const removable = (panel: HTMLElement): string[] =>
    within(panel)
      .queryAllByRole('button', { name: /^Remove / })
      .map((button) => (button.textContent ?? '').trim())

  /** The Remove buttons the starter's examples should have, less any taken away. */
  const offered = (...without: string[]): string[] =>
    STARTER_SCENARIOS.filter(({ name }) => !without.includes(name)).map(({ name }) => `Remove ${name}`)

  test('the Angular builder lists them as well, and they hold', async () => {
    // An evaluator choosing Angular saw no examples at all: the one panel that catches a
    // rule written backwards was missing from the builder that claims parity.
    render(<App />)
    await builtWith('Angular')

    const panel = await scenarioPanel()
    await waitFor(() => {
      expect(within(panel).getByRole('status').textContent).toContain('scenarios hold')
    })
    // And it can remove one: a panel drawn read-only would be the React defect again.
    expect(removable(panel)).toEqual(offered())
  })

  test('Remove in the React builder takes the example off the list', async () => {
    // The React pane drew no Remove button, because nothing was listening for the change —
    // and a host that listened and kept a constant would draw one that did nothing.
    const user = userEvent.setup()
    render(<App />)
    await builtWith('React')
    const panel = await scenarioPanel()
    const gone = STARTER_SCENARIOS[1]!.name

    await user.click(within(panel).getByRole('button', { name: `Remove ${gone}` }))

    await waitFor(() => expect(removable(panel)).toEqual(offered(gone)))
  })

  test('and an example removed in the React builder is gone from the Angular one', async () => {
    // One list, handed to both: an Angular panel reading its own copy would bring a removed
    // example back the moment somebody switched builder.
    const user = userEvent.setup()
    render(<App />)
    await builtWith('React')
    const gone = STARTER_SCENARIOS[1]!.name
    await user.click(within(await scenarioPanel()).getByRole('button', { name: `Remove ${gone}` }))

    await builtWith('Angular')

    const panel = await scenarioPanel()
    await waitFor(() => expect(removable(panel)).toEqual(offered(gone)), { timeout: 10_000 })
  })

  test('and the other way round: removed in the Angular builder, gone from the React one', async () => {
    // The Angular pane hands the shorter list back through an output, across the bootstrap
    // boundary; nothing else would say that crossing had been dropped.
    const user = userEvent.setup()
    render(<App />)
    await builtWith('Angular')
    const angular = await scenarioPanel()
    await waitFor(() => expect(removable(angular)).toEqual(offered()), { timeout: 10_000 })
    const gone = STARTER_SCENARIOS[2]!.name

    await user.click(within(angular).getByRole('button', { name: `Remove ${gone}` }))
    // The Angular panel draws the page's list rather than its own, so this is the round trip.
    await waitFor(() => expect(removable(angular)).toEqual(offered(gone)))

    await builtWith('React')

    expect(removable(await scenarioPanel())).toEqual(offered(gone))
  })

  test('and an example removed stays removed after the Schema view and back, in both builders', async () => {
    // Why the list is the page's and not the Build pane's: switching to Schema unmounts the
    // Build pane, so a list kept anywhere under it, even one handed to both builders, would
    // start again from the starter's and bring the removed example back on the way in.
    const user = userEvent.setup()
    render(<App />)
    await builtWith('React')
    const gone = STARTER_SCENARIOS[1]!.name
    await user.click(within(await scenarioPanel()).getByRole('button', { name: `Remove ${gone}` }))

    await user.click(screen.getByRole('button', { name: 'Schema' }))
    // Off screen, or the way back below would be no way back at all.
    expect(screen.queryByRole('region', { name: 'Scenarios' })).toBeNull()

    await builtWith('React')
    expect(removable(await scenarioPanel())).toEqual(offered(gone))
    await builtWith('Angular')
    const angular = await scenarioPanel()
    await waitFor(() => expect(removable(angular)).toEqual(offered(gone)), { timeout: 10_000 })
  })
  test('the Angular panel never says there are none while the page has some', async () => {
    // The Angular builder started with an empty list and was handed the page's after it had
    // drawn, so every mount first drew the empty state — and its status is a live region, so
    // "No scenarios." could be announced before "All … hold", on every switch to Angular.
    const none = builderTextFor('en')('scenarios.none')
    const said: string[] = []
    const listening = new MutationObserver(() => {
      const panel = screen.queryByRole('region', { name: 'Scenarios' })
      const status = panel === null ? null : within(panel).queryByRole('status')
      if (status?.textContent) said.push(status.textContent)
    })
    listening.observe(document.body, { subtree: true, childList: true, characterData: true })

    render(<App />)
    await builtWith('Angular')
    const panel = await scenarioPanel()
    await waitFor(() => expect(within(panel).getByRole('status').textContent).toContain('hold'))
    listening.disconnect()

    expect(said).not.toContain(none)
  })
})

/**
 * The same panes, in either builder.
 *
 * The Angular host chose its panels by hand, and its comment said they mirrored the React
 * pane's while the Fields tab had no prompt pane and the Arrangement tab no layout node
 * properties — and nothing compared them, so the missing examples panel was found by
 * reading, not by a test. This compares what each builder draws on every tab, so the next
 * pane mounted in one builder alone fails here instead of waiting to be noticed.
 *
 * Compared by the parts the two builders emit (`data-formancy-part`), not by role and name:
 * neither the prompt pane nor the layout node's properties is a named region, and the parts
 * are the contract both builders share by design — the themes dress them, and
 * `workbench.test` already derives them from both packages' sources.
 */
describe('the same panes, in either builder', () => {
  /** Every part drawn in the Editor pane, as a set. */
  const partsOnScreen = (): string[] => {
    const editor = screen.getByRole('region', { name: 'Editor' })
    return [
      ...new Set(
        [...editor.querySelectorAll('[data-formancy-part]')].map(
          (element) => element.getAttribute('data-formancy-part') ?? '',
        ),
      ),
    ].sort()
  }

  test.each(Object.values(TAB_NAMES))('on the %s tab', async (tab) => {
    const drawn: Record<'React' | 'Angular', string[]> = { React: [], Angular: [] }
    for (const which of ['React', 'Angular'] as const) {
      render(<App />)
      await builtWith(which)
      if (which === 'Angular') await angularTree()
      await userEvent.setup().click(screen.getByRole('button', { name: tab }))
      // Settled, not merely mounted: the Angular tree draws a tab's panes after the click,
      // and a pane that reports a selection draws its properties a beat later.
      await waitFor(
        () => {
          drawn[which] = partsOnScreen()
          expect(drawn[which].length).toBeGreaterThan(0)
        },
        { timeout: 10_000 },
      )
      await new Promise((settle) => setTimeout(settle, 300))
      drawn[which] = partsOnScreen()
      cleanup()
    }
    expect(drawn.Angular).toEqual(drawn.React)
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
