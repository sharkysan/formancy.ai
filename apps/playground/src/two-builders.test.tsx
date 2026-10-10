import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { missingMessages, referencedMessages } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { App } from './app.js'
import { TAB_NAMES, builderTextFor } from './builder-pane.js'
import { STARTER_SCHEMA } from './starter.js'
import { STARTER_SCENARIOS } from './starter-scenarios.js'
import REGISTRATION_SCENARIOS from '../../../templates/events/registration.scenarios.json'

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

/*
 * Longer than the shared `RENDER_TIMEOUT_MS`, for the reason `theme-editor.test.tsx` is:
 * a timeout here catches a hang, not the speed of somebody else's runner. These cases
 * mount the whole playground and then the Angular builder, and most of them make an edit
 * that re-renders both previews. Measured on 2026-10-10: the slowest run in about 2.1s
 * locally; under coverage on CI, "switching back keeps the document and the undo stack"
 * took 15.6s on one run and passed 20s on the next with nothing changed in its path. The
 * factor the shared constant records, up to fourteen, puts a 2s case near 30s.
 */
vi.setConfig({ testTimeout: 60_000 })

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
 * Every way a page sends something, spied. `sendBeacon` is defined first where jsdom has
 * none, so a call to it is recorded rather than thrown and lost in a handler. `fetch`
 * answers nothing, so a page that called it would not reach the network from a test.
 * And `window.open`: a pane that opened the chat itself after a copy would be the page
 * asking another site, which a link the person follows is not.
 */
const outbound = () => {
  const beacon = vi.fn(() => true)
  const had = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  return {
    fetch: vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('a test reaches no network')),
    open: vi.spyOn(XMLHttpRequest.prototype, 'open'),
    window: vi.spyOn(window, 'open').mockReturnValue(null).mockName('window.open'),
    beacon,
    restore: () => {
      vi.restoreAllMocks()
      if (had === undefined) Reflect.deleteProperty(navigator, 'sendBeacon')
      else Object.defineProperty(navigator, 'sendBeacon', had)
    },
  }
}

/**
 * The prompt pane is on screen, a person carries the model's turn, and the answer is
 * proposed rather than applied.
 *
 * `@formancy/builder-react` had exported `PromptPane` for a while and **no application
 * mounted it** — the same shape as the Angular builder above, and noticed the same way. A
 * feature that exists in a package and nowhere a visitor can reach is documented and
 * inert, which is the failure this repository has already shipped once.
 *
 * formancy.ai asks no other site for anything (0154), so its model is a person: the page
 * shows the request, the visitor copies it into a chat of their own and pastes the answer
 * back ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)). It was
 * a `window.prompt` that showed the request's last line, so nobody could use a real model
 * here. What is pinned is that the whole round trip works in either builder, that the
 * review is the one step it never skips
 * ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)), and
 * that the page itself sends nothing anywhere while it happens — every Copy pressed
 * included, since Copy is the one control that handles the request's text.
 */
describe('describing a change in words', () => {
  /** What a chat answered, pasted back: a whole document with a phone number in it. */
  const ANSWER = JSON.stringify({
    specVersion: '2',
    id: 'proposed',
    title: 'Proposed',
    model: { fields: [{ key: 'phone', type: 'text', label: 'Telephone' }] },
  })

  test('is offered in the builder', async () => {
    render(<App />)
    await builtWith('React')

    // By accessible name, like everything else here: the label is the contract.
    expect(screen.getByRole('textbox', { name: /Describe the form/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Write it' })).toBeTruthy()
    // And nothing to carry until something is asked.
    expect(screen.queryByRole('region', { name: 'Take this request to a model' })).toBeNull()
  })

  test.each(['React', 'Angular'] as const)(
    'in the %s builder: the request is copied, an answer that fails is retried, the one that works is reviewed, and the page sends nothing itself',
    async (which) => {
      /*
       * The whole of it, end to end through the application: describe a change, copy the
       * request, paste an answer that is not a form, copy what was wrong and then the whole
       * request again, paste the answer that works, read the review, apply. The tree must
       * not change until Apply. And through all of it the page makes no request of its own
       * — a relay that posted the prompt anywhere, or opened the chat itself on a copy,
       * would be the call to another site this replaces. Every Copy is pressed, in either
       * builder: the jsdom round trip once pressed none, and a pane that sent the request
       * on Copy passed it.
       */
      const sent = outbound()
      try {
        const user = userEvent.setup()
        render(<App />)
        await builtWith(which)
        if (which === 'Angular') await angularTree()
        // After every `userEvent.setup()`, which puts its own clipboard on the navigator.
        const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)

        /*
         * Asserted on the structure tree rather than on the JSON: the Build pane shows one
         * editor body at a time, so the Schema view is not on screen here — and the tree
         * is what somebody is actually looking at while they decide.
         */
        const named = (): string[] =>
          screen.getAllByRole('treeitem').map((item) => item.textContent ?? '')
        expect(named().some((entry) => entry.includes('Telephone'))).toBe(false)
        expect(undoButton().disabled).toBe(true)

        await user.type(
          await screen.findByRole('textbox', { name: /Describe the form/ }, { timeout: 10_000 }),
          'add a phone number',
        )
        await user.click(screen.getByRole('button', { name: 'Write it' }))

        // The request, as the person will carry it: the instruction in it, and a chat to
        // take it to whose address carries nothing of it.
        const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
        const request = within(relay).getByRole('textbox', { name: 'The request' }) as HTMLTextAreaElement
        expect(request.value).toContain('add a phone number')
        const chat = within(relay).getByRole('link', { name: 'Open Claude in a new tab' }) as HTMLAnchorElement
        expect(chat.href).toBe('https://claude.ai/new')

        // Copy: the briefing first, then the request the box shows.
        await user.click(within(relay).getByRole('button', { name: 'Copy the request' }))
        await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
        const copied = write.mock.calls[0]![0]
        expect(copied.endsWith(`\n\n${request.value}`)).toBe(true)
        expect(copied.length).toBeGreaterThan(request.value.length + 2)

        // An object that is not a form: an answer, so it costs a turn, and the chat is asked
        // again — what was wrong alone for the chat that holds it, the whole request for a new one.
        await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
        await user.paste('{}')
        await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))
        const retry = await screen.findByRole('region', { name: 'Take this request to a model' })
        await user.click(await within(retry).findByRole('button', { name: 'Copy what was wrong' }))
        await user.click(within(retry).getByRole('button', { name: 'New chat? Copy the whole request' }))
        await waitFor(() => expect(write).toHaveBeenCalledTimes(3))
        const [, wrong, whole] = write.mock.calls.map(([text]) => text)
        expect(whole!.length).toBeGreaterThan(wrong!.length)

        await user.click(within(retry).getByRole('textbox', { name: 'The model’s answer' }))
        await user.paste(ANSWER)
        await user.click(within(retry).getByRole('button', { name: 'Check this answer' }))

        await waitFor(() =>
          expect(screen.getByRole('heading', { name: /Review these changes/ })).toBeTruthy(),
        )
        expect(screen.queryByRole('region', { name: 'Take this request to a model' })).toBeNull()
        // Proposed, not applied.
        expect(named().some((entry) => entry.includes('Telephone'))).toBe(false)
        expect(undoButton().disabled, 'something was applied before anybody agreed to it').toBe(true)

        await user.click(screen.getByRole('button', { name: 'Apply these changes' }))

        await waitFor(() => expect(named().some((entry) => entry.includes('Telephone'))).toBe(true))
        expect(undoButton().disabled).toBe(false)

        expect(sent.fetch).not.toHaveBeenCalled()
        expect(sent.open).not.toHaveBeenCalled()
        expect(sent.beacon).not.toHaveBeenCalled()
        expect(sent.window).not.toHaveBeenCalled()
      } finally {
        sent.restore()
      }
    },
  )
})

/**
 * The starter's examples, run against a model's answer before it lands (0159).
 *
 * The page keeps each form's examples and its sample, and hands them to both builders'
 * scenario panes; it now hands them to both prompt panes as well. Without that, the pane
 * can run nothing: an answer that turns the canton rule round passes every check the model
 * loop makes, the review lists one changed rule, and "Switzerland asks for a canton" is
 * named as broken only after Apply, by the scenario pane.
 *
 * The answer arrives the way a visitor's does, pasted into the page's relay (0160), so
 * what is checked is the prompt pane the page actually mounts, asking the model it
 * actually has.
 */
describe('a model’s answer, against the form’s examples', () => {
  /** The starter with its canton rules the wrong way round: valid, compiled — and backwards. */
  const backwardsCanton = (): unknown => {
    const next = JSON.parse(JSON.stringify(STARTER_SCHEMA)) as {
      logic: { rules: { target: string; cel?: string }[] }
    }
    const turned = next.logic.rules.filter((rule) => rule.target === 'canton')
    expect(turned, 'the starter no longer has the canton rule this case turns round').not.toEqual([])
    for (const rule of turned) rule.cel = 'country != "CH"'
    return next
  }
  const pinned = STARTER_SCENARIOS.find(({ name }) => name === 'Switzerland asks for a canton')

  test.each(['React', 'Angular'] as const)(
    'in the %s builder, the review names the example it would break, before Apply',
    async (which) => {
      expect(pinned, 'the starter no longer pins the canton rule').toBeDefined()
      const user = userEvent.setup()
      render(<App />)
      await builtWith(which)
      if (which === 'Angular') await angularTree()

      const instruction = await waitFor(
        () => screen.getByRole('textbox', { name: /Describe the form/ }),
        { timeout: 10_000 },
      )
      await user.type(instruction, 'ask for a canton outside Switzerland')
      await user.click(screen.getByRole('button', { name: 'Write it' }))

      // The model is the page's relay: the visitor pastes the chat's answer back, and so
      // does this — the starter with its canton rule turned round.
      const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
      await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
      await user.paste(JSON.stringify(backwardsCanton()))
      await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))

      const review = await waitFor(
        () => screen.getByRole('region', { name: /would stop holding/ }),
        { timeout: 10_000 },
      )
      expect(within(review).getByRole('heading').textContent).toContain(pinned!.name)
      // Before Apply: named while nothing has landed, and Apply still there to press.
      expect(undoButton().disabled, 'something was applied before anybody agreed to it').toBe(true)
      expect(
        (within(review).getByRole('button', { name: 'Apply these changes' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false)
    },
  )
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
 * What the scenario panel says in its own live region: the first in reading order. Drafting,
 * which the page draws inside the panel too (0162), has one of its own beneath the list.
 */
const panelSays = (panel: HTMLElement): string => within(panel).getAllByRole('status')[0]?.textContent ?? ''

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
      expect(panelSays(panel)).toContain('scenarios hold')
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
  /*
   * Each form its own examples.
   *
   * The starter's examples were the page's only list, so opening the wizard or a template
   * ran them against a form that has none of their fields: a panel full of failures about
   * questions nobody could see, on every form but one — while each template carries its
   * own examples and a sample to start them from, and the playground showed neither.
   */
  test.each(['React', 'Angular'] as const)(
    'a template brings its own examples, and they hold, in the %s builder',
    async (which) => {
      const user = userEvent.setup()
      render(<App />)
      await user.selectOptions(screen.getByRole('combobox', { name: 'Demo' }), 'events-registration')
      await builtWith(which)

      const panel = await scenarioPanel()
      // Derived from the template's own file, so a scenario added there moves this too.
      await waitFor(
        () =>
          expect(removable(panel)).toEqual(
            REGISTRATION_SCENARIOS.map(({ name }) => `Remove ${name}`),
          ),
        { timeout: 10_000 },
      )
      // And they hold — which they only do from the template's sample, not from nothing.
      expect(panelSays(panel)).toBe(
        builderTextFor('en')('scenarios.allHold', { count: REGISTRATION_SCENARIOS.length }),
      )
    },
  )

  test('the wizard, which has none, says so rather than failing the starter’s', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Demo' }), 'wizard')
    await builtWith('React')

    const panel = await scenarioPanel()
    expect(panelSays(panel)).toBe(builderTextFor('en')('scenarios.none'))
  })

  test('an example removed from one form is still gone after a visit to another', async () => {
    // Kept per form: a list reset on every switch would bring a removed example back, and
    // one shared by every form is the defect above.
    const user = userEvent.setup()
    render(<App />)
    await builtWith('React')
    const gone = STARTER_SCENARIOS[0]!.name
    await user.click(within(await scenarioPanel()).getByRole('button', { name: `Remove ${gone}` }))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Demo' }), 'events-registration')
    await waitFor(() =>
      expect(removable(screen.getByRole('region', { name: 'Scenarios' }))).toHaveLength(
        REGISTRATION_SCENARIOS.length,
      ),
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Demo' }), 'starter')
    await waitFor(() => expect(removable(screen.getByRole('region', { name: 'Scenarios' }))).toEqual(offered(gone)))
  })

  test('the Angular panel never says there are none while the page has some', async () => {
    // The Angular builder started with an empty list and was handed the page's after it had
    // drawn, so every mount first drew the empty state — and its status is a live region, so
    // "No scenarios." could be announced before "All … hold", on every switch to Angular.
    const none = builderTextFor('en')('scenarios.none')
    const said: string[] = []
    const listening = new MutationObserver(() => {
      const panel = screen.queryByRole('region', { name: 'Scenarios' })
      const status = panel === null ? undefined : within(panel).queryAllByRole('status')[0]
      if (status?.textContent) said.push(status.textContent)
    })
    listening.observe(document.body, { subtree: true, childList: true, characterData: true })

    render(<App />)
    await builtWith('Angular')
    const panel = await scenarioPanel()
    await waitFor(() => expect(panelSays(panel)).toContain('hold'))
    listening.disconnect()

    expect(said).not.toContain(none)
  })
})

/**
 * Examples drafted from what the visitor says, through the page's relay (0162).
 *
 * The page hands its relay to both builders' scenario panes, and a draft kept goes into the
 * page's examples for the open form, as one removed leaves them. What is pinned through the
 * whole application, in either builder: the request carried to a chat holds what the visitor
 * said and none of the starter's rules; nothing reaches the list until Keep; a draft that
 * does not hold can be kept, and the panel then lists it as not holding — the person has
 * said the example is right and the form is not; and the page sends nothing anywhere while
 * it happens, every Copy pressed included.
 */
describe('examples drafted from what the visitor says', () => {
  /** Holds against the starter. */
  const HOLDS = {
    name: 'Germany is not asked for a canton',
    changes: { country: 'DE' },
    valid: true,
    visible: { canton: false },
  }
  /** Does not: the visitor's words, read by a model as asking every country for a region. */
  const FAILS = {
    name: 'Germany is asked for its canton too',
    because: 'every country has regions',
    changes: { country: 'DE' },
    valid: false,
    visible: { canton: true },
    errors: { canton: ['required'] },
  }

  test.each(['React', 'Angular'] as const)(
    'in the %s builder: the request withholds the rules, a draft that fails is kept, the panel lists it, and the page sends nothing',
    async (which) => {
      const sent = outbound()
      try {
        const user = userEvent.setup()
        render(<App />)
        await builtWith(which)
        if (which === 'Angular') await angularTree()
        // After every `userEvent.setup()`, which puts its own clipboard on the navigator.
        const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)

        const panel = await waitFor(() => screen.getByRole('region', { name: 'Scenarios' }), { timeout: 10_000 })
        await waitFor(() => expect(panelSays(panel)).toContain('scenarios hold'), { timeout: 10_000 })
        await user.type(
          within(panel).getByRole('textbox', { name: /What should this form do/ }),
          'Only Switzerland asks for a canton.',
        )
        await user.click(within(panel).getByRole('button', { name: 'Draft examples' }))

        // The request a visitor carries: their words, and no rule of the form — a model shown
        // `country == "CH"` writes the example that rule passes (0162). Read from what Copy
        // put on the clipboard, which is the briefing and the request together: the request
        // box shows the second half alone, and a rule in the first would leave with the
        // visitor while that box looked clean.
        const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
        await user.click(within(relay).getByRole('button', { name: 'Copy the request' }))
        await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
        const carried = String(write.mock.calls[0]?.[0])
        expect(carried).toContain('Only Switzerland asks for a canton.')
        const rules = (STARTER_SCHEMA.logic?.rules ?? []).flatMap((rule) => (rule.cel === undefined ? [] : [rule.cel]))
        expect(rules.length, 'the starter has no rules for this case to withhold').toBeGreaterThan(0)
        expect(rules.filter((cel) => carried.includes(cel) || carried.includes(JSON.stringify(cel).slice(1, -1)))).toEqual([])

        await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
        await user.paste(JSON.stringify({ scenarios: [HOLDS, FAILS] }))
        await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))

        const drafts = await within(panel).findByRole('list', { name: 'Drafted examples' }, { timeout: 10_000 })
        expect(within(drafts).getByText(/Does not hold against the form as it is/)).toBeTruthy()
        // Drafted, not kept: the panel's own list has neither.
        expect(within(panel).queryByRole('button', { name: `Remove ${FAILS.name}` })).toBeNull()
        expect(within(panel).queryByRole('button', { name: `Remove ${HOLDS.name}` })).toBeNull()

        await user.click(within(panel).getByRole('button', { name: `Keep ${FAILS.name}` }))

        await waitFor(
          () => expect(within(panel).getByRole('button', { name: `Remove ${FAILS.name}` })).toBeTruthy(),
          { timeout: 10_000 },
        )
        expect(panelSays(panel)).toBe(
          builderTextFor('en')('scenarios.someFail', { count: 1, total: STARTER_SCENARIOS.length + 1 }),
        )
        expect(within(panel).queryByRole('button', { name: `Remove ${HOLDS.name}` })).toBeNull()

        expect(sent.fetch).not.toHaveBeenCalled()
        expect(sent.open).not.toHaveBeenCalled()
        expect(sent.beacon).not.toHaveBeenCalled()
        expect(sent.window).not.toHaveBeenCalled()
      } finally {
        sent.restore()
      }
    },
  )
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

/**
 * The Translations tab asks a model for what the French is missing, through the page's relay.
 *
 * The starter's French is half-finished on purpose, and the tab marked every message
 * missing from it — and nothing helped fill them. Now both builders' Translations panes ask
 * the page's relay (0160) for exactly those, the visitor carries the request to a chat of
 * their own and pastes the answer back, and the answer is reviewed message by message before
 * it lands (0161). What is pinned is the whole round trip in either builder: the turn shown
 * where the prompt pane's is, the review before anything is applied, Apply, and the form pane
 * reading the French — with the page sending nothing anywhere itself.
 */
describe('a model asked for the French the starter is missing', () => {
  const SOURCES = STARTER_SCHEMA.i18n.messages['en'] ?? {}
  const missing = missingMessages(STARTER_SCHEMA as unknown as FormSchema, 'fr')
  /** What a chat answered: every missing message, one of them in words this case looks for. */
  const ANSWER = JSON.stringify({
    locale: 'fr',
    defaultLocale: 'en',
    messages: missing.map((id) => ({
      id,
      source: SOURCES[id],
      target: id === 'wantedBy' ? 'Souhaité pour le' : `${SOURCES[id] ?? id} (fr)`,
    })),
  })

  /**
   * Every expression, code and check the starter's rules hold, as written and as JSON
   * writes them. Read off the rules rather than typed: the request is JSON, which escapes
   * the quote in `country == "CH"`, so the one phrase this case looked for could never
   * match a rule that leaked, and the whole document sent along passed it in both builders.
   */
  const RULES = ((STARTER_SCHEMA as unknown as FormSchema).logic?.rules ?? [])
    .flatMap((rule) => [rule.cel, rule.code, rule.check])
    .filter((words): words is string => words !== undefined)
  const inJson = (words: string): string => JSON.stringify(words).slice(1, -1)
  const RULE_WORDS = RULES.flatMap((words) => [words, inJson(words)])

  test('the starter still leaves the message this case looks for untranslated', () => {
    // A guard on the case below: a French catalogue that already said it would let the
    // form pane read French without anything being applied.
    expect(missing).toContain('wantedBy')
    // And the starter has rules to leak, some spelt differently in JSON, or the case below
    // that looks for them in the request checks nothing.
    expect(RULES.some((words) => inJson(words) !== words)).toBe(true)
  })

  test.each(['React', 'Angular'] as const)(
    'in the %s builder: asked through the relay, reviewed, applied, and read in the form pane — and the page sends nothing itself',
    async (which) => {
      const sent = outbound()
      try {
        const user = userEvent.setup()
        render(<App />)
        await builtWith(which)
        if (which === 'Angular') await angularTree()
        await user.click(screen.getByRole('button', { name: 'Translations' }))
        const editor = screen.getByRole('region', { name: 'Editor' })
        await user.selectOptions(
          await waitFor(() => within(editor).getByRole('combobox', { name: 'Language' }), { timeout: 10_000 }),
          'fr',
        )

        await user.click(
          await within(editor).findByRole(
            'button',
            { name: `Ask a model for the ${String(missing.length)} missing messages` },
            { timeout: 10_000 },
          ),
        )

        // The turn is the relay's, drawn at the top of the builder as the prompt pane's is:
        // the French asked for, by the language's tag, and the form's words, not its rules.
        const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
        const request = within(relay).getByRole('textbox', { name: 'The request' }) as HTMLTextAreaElement
        expect(request.value).toContain('"locale": "fr"')
        expect(RULE_WORDS.filter((words) => request.value.includes(words))).toEqual([])

        await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
        await user.paste(ANSWER)
        await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))

        const review = await within(editor).findByRole(
          'region',
          { name: /^Review these translations into fr/ },
          { timeout: 10_000 },
        )
        // Every missing message a row, and nothing applied yet.
        const rows = within(within(review).getByRole('table')).getAllByRole('row')
        expect(rows).toHaveLength(missing.length + 1)
        expect(undoButton().disabled, 'something was applied before anybody agreed to it').toBe(true)

        await user.click(within(review).getByRole('button', { name: 'Apply these translations' }))
        await waitFor(() => expect(undoButton().disabled).toBe(false))

        // The form pane, read in French: the message the model wrote, where English stood.
        await user.selectOptions(screen.getAllByRole('combobox', { name: 'Language' })[0]!, 'fr')
        const form = await waitFor(() => screen.getByRole('region', { name: 'React' }), { timeout: 10_000 })
        await waitFor(() => expect(within(form).getByLabelText('Souhaité pour le')).toBeTruthy(), {
          timeout: 10_000,
        })

        expect(sent.fetch).not.toHaveBeenCalled()
        expect(sent.open).not.toHaveBeenCalled()
        expect(sent.beacon).not.toHaveBeenCalled()
        expect(sent.window).not.toHaveBeenCalled()
      } finally {
        sent.restore()
      }
    },
  )
})
