import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { computeAccessibleDescription, computeAccessibleName } from 'dom-accessibility-api'
import {
  createBuilderSession,
  createDraftRun,
  createPromptRun,
  createRelay,
  createTranslationRun,
  missingMessages,
} from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { App } from './app.js'
import { builderTextFor } from './builder-pane.js'
import { DEMOS } from './demos.js'
import { STARTER_SCHEMA } from './starter.js'
import { STARTER_SCENARIOS } from './starter-scenarios.js'
import {
  BACKWARDS_EDIT,
  DRAFTING_INTENT,
  FRENCH,
  OUT_OF_REACH,
  STARTER_SUGGESTIONS,
} from './starter-suggestions.js'
import { LEADS, trySuggestion } from './suggestions.js'

/**
 * Something to try with the page's model, on the starter.
 *
 * The playground let a visitor ask a model of their own for a change, the French the starter
 * is missing, or examples (0160) — and suggested nothing, so a visitor met an empty box and
 * no idea that adding a country is where a condition gets written backwards, or that the
 * starter's French is half-finished on purpose. What is pinned here: each suggestion is drawn
 * where its feature is, in both builders, and fills in its request without asking anything or
 * sending anything; the one chosen for the examples verdict does show it, through the relay;
 * and only the starter, whose fields they are about, has any.
 *
 * By role and accessible name, as everything in this app is queried (0034).
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (next: string) => void }) => (
    <textarea aria-label="Schema" value={value ?? ''} onChange={(event) => onChange?.(event.target.value)} />
  ),
  useMonaco: () => null,
}))

afterEach(cleanup)

// The whole playground and then the Angular builder, as in `two-builders.test.tsx`, whose
// note on this timeout applies here unchanged.
vi.setConfig({ testTimeout: 60_000 })

const BUILDERS = ['React', 'Angular'] as const

/** Open the Build pane and choose a builder; the Angular one waited for until it draws its tree. */
const builtWith = async (which: (typeof BUILDERS)[number]): Promise<void> => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Build' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Builder' }), which.toLowerCase())
  if (which === 'Angular') {
    await waitFor(() => expect(screen.getAllByRole('tree', { name: /structure/i }).length).toBeGreaterThan(0), {
      timeout: 10_000,
    })
  }
}

const editor = (): HTMLElement => screen.getByRole('region', { name: 'Editor' })
const undoButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
const relayPane = (): HTMLElement | null => screen.queryByRole('region', { name: 'Take this request to a model' })
const suggestion = (words: string): Promise<HTMLButtonElement> =>
  within(editor()).findByRole('button', { name: words }, { timeout: 10_000 }) as Promise<HTMLButtonElement>
/** Whether the suggestion with these words is disabled now. */
const disabled = (words: string): boolean =>
  (screen.getByRole('button', { name: words }) as HTMLButtonElement).disabled

/**
 * Every way a page sends something, spied — the same four `two-builders.test.tsx` spies, for
 * the same reason: `sendBeacon` defined where jsdom has none, `fetch` answering nothing.
 */
const outbound = () => {
  const beacon = vi.fn(() => true)
  const had = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  return {
    fetch: vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('a test reaches no network')),
    open: vi.spyOn(XMLHttpRequest.prototype, 'open'),
    window: vi.spyOn(window, 'open').mockReturnValue(null),
    beacon,
    restore: () => {
      vi.restoreAllMocks()
      if (had === undefined) Reflect.deleteProperty(navigator, 'sendBeacon')
      else Object.defineProperty(navigator, 'sendBeacon', had)
    },
  }
}

/** The lists of suggestions in the Editor pane, by name, each with its buttons and what they say. */
const listed = (): string[][] =>
  within(editor())
    .queryAllByRole('list')
    .filter((list) => Object.values(LEADS).includes(computeAccessibleName(list)))
    .map((list) => [
      computeAccessibleName(list),
      ...within(list)
        .getAllByRole('button')
        .flatMap((button) => [computeAccessibleName(button), computeAccessibleDescription(button)]),
    ])

describe('what each suggestion says about the starter is true of it', () => {
  test('only the starter has suggestions: they are about its fields', () => {
    // Drawn on a template they would name a canton and a delivery its form does not have.
    expect(DEMOS.find(({ id }) => id === 'starter')?.suggestions).toBe(STARTER_SUGGESTIONS)
    const others = DEMOS.filter(({ id, suggestions }) => id !== 'starter' && suggestions !== undefined)
    expect(others.map(({ id }) => id)).toEqual([])
  })

  test('the change suggested for the examples verdict touches a rule the examples pin', () => {
    // Without an example pinning the canton, an answer turning its rule round would be
    // reviewed with nothing named, and the suggestion would show nothing it says it shows.
    const rules = (STARTER_SCHEMA as unknown as FormSchema).logic?.rules ?? []
    expect(rules.filter(({ target }) => target === 'canton')).not.toEqual([])
    expect(STARTER_SCENARIOS.filter(({ visible }) => visible !== undefined && 'canton' in visible)).not.toEqual([])
  })

  test('the intent suggested is a rule the starter has, and no example of it yet', () => {
    // "The starter has this rule and no example of it": an example added for express delivery
    // would make that sentence false, and the drafts would demonstrate nothing new.
    const rules = (STARTER_SCHEMA as unknown as FormSchema).logic?.rules ?? []
    expect(rules.filter(({ target, kind }) => target === 'wantedBy' && kind === 'required')).not.toEqual([])
    const about = (scenario: Scenario): string[] => [
      ...Object.keys(scenario.changes),
      ...Object.keys(scenario.errors ?? {}),
      ...Object.keys(scenario.visible ?? {}),
      ...Object.keys(scenario.values ?? {}),
      ...(scenario.absent ?? []),
    ]
    const covering = STARTER_SCENARIOS.filter((scenario) =>
      about(scenario).some((key) => key === 'delivery' || key === 'wantedBy'),
    )
    expect(covering).toEqual([])
  })

  test('the translation suggested is one the starter is missing', () => {
    // "Half-finished on purpose": a French catalogue finished would leave the request asking for nothing.
    expect(Object.keys(STARTER_SCHEMA.i18n.messages)).toContain(FRENCH.locale)
    expect(missingMessages(STARTER_SCHEMA as unknown as FormSchema, FRENCH.locale)).not.toEqual([])
  })
})

describe('a suggestion pressed when it cannot be', () => {
  /** The page's runs and relay, over the starter, as `app.tsx` holds them. */
  const page = () => ({
    runs: { prompt: createPromptRun(), translation: createTranslationRun(), drafting: createDraftRun() },
    relay: createRelay(),
    session: createBuilderSession(STARTER_SCHEMA as unknown as FormSchema),
  })

  test('does not ask again over a translation held for review, which it would forget', async () => {
    // The buttons are disabled then, and this is what a press that got through would cost:
    // asked again, the run forgets the review the visitor carried a turn for.
    const from = page()
    const english = STARTER_SCHEMA.i18n.messages['en'] ?? {}
    const asked = from.runs.translation.translate(from.relay.ask, from.session, FRENCH.locale)
    from.relay.answer(
      JSON.stringify({
        locale: FRENCH.locale,
        defaultLocale: 'en',
        messages: missingMessages(STARTER_SCHEMA as unknown as FormSchema, FRENCH.locale).map((id) => ({
          id,
          source: english[id],
          target: `${english[id] ?? id} (fr)`,
        })),
      }),
    )
    await asked
    const held = from.runs.translation.state()
    expect(held.proposal).toBeDefined()

    trySuggestion(FRENCH, from)
    expect(from.runs.translation.state()).toBe(held)
    expect(from.relay.waiting()).toBeUndefined()
  })

  /** The starter's messages, by language, writable: the starter's own, copied. */
  type Messages = Record<string, Record<string, string>>
  const reworded = (change: (i18n: { defaultLocale: string; messages: Messages }) => void): FormSchema => {
    const form = structuredClone(STARTER_SCHEMA) as unknown as FormSchema & {
      i18n: { defaultLocale: string; messages: Messages }
    }
    change(form.i18n)
    return form
  }

  test.each([
    // Removed by hand in the Schema view: the pane offers no French to choose, and the
    // request would ask for a language the form does not have, to be carried and discarded.
    [
      'French has left the form',
      reworded((i18n) => {
        delete i18n.messages[FRENCH.locale]
      }),
    ],
    // Nothing is translated into the language a form is written in, so the pane asks nothing
    // there. (Written in French, the French catalogue is the whole form: a session opens no
    // form whose own language is missing a message.)
    [
      'French is the language the form is written in',
      reworded((i18n) => {
        i18n.defaultLocale = FRENCH.locale
        i18n.messages[FRENCH.locale] = { ...i18n.messages['en'] }
      }),
    ],
    // Finished — by Apply, or by hand: asked again, no model is, and the pane says the
    // model left every message untranslated when nobody asked one anything.
    [
      'nothing in French is missing',
      reworded((i18n) => {
        const english = i18n.messages['en'] ?? {}
        const french = i18n.messages[FRENCH.locale] ?? {}
        for (const id of missingMessages(STARTER_SCHEMA as unknown as FormSchema, FRENCH.locale)) {
          french[id] = `${english[id] ?? id} (fr)`
        }
      }),
    ],
  ])('asks for no translation where the pane would offer no Ask: %s', (_, form) => {
    const from = { ...page(), session: createBuilderSession(form) }
    trySuggestion(FRENCH, from)
    expect(from.relay.waiting(), 'a request was put on the relay that the pane would never have asked').toBeUndefined()
    expect(from.runs.translation.state().busy).toBe(false)
  })

  test('does not change the words a draft is being asked with', () => {
    // The drafting box is disabled while a draft waits; its words are the ones being asked.
    const from = page()
    from.runs.drafting.describe('Only Switzerland asks for a canton.')
    void from.runs.drafting.draft(from.relay.ask, from.session)
    expect(from.runs.drafting.state().busy).toBe(true)

    trySuggestion(DRAFTING_INTENT, from)
    expect(from.runs.drafting.state().intent).toBe('Only Switzerland asks for a canton.')
    from.runs.drafting.stop()
  })
})

describe('something to try, on the starter', () => {
  test.each(BUILDERS)(
    'in the %s builder, each fills in its request where its feature is — and asks nothing, applies nothing and sends nothing',
    async (which) => {
      /*
       * A suggestion that pressed Write for the visitor would carry a turn they had not read,
       * and one that called anything would be the page asking another site (0154). So: each
       * fills in the box its pane reads, the relay stays empty, Undo stays off, and none of the
       * four ways a page sends something is called. The translation's request is the language,
       * so it is asked — onto the relay, for the visitor to carry — and the pane opens on it.
       */
      const sent = outbound()
      try {
        const user = userEvent.setup()
        render(<App />)
        await builtWith(which)

        for (const { words } of [BACKWARDS_EDIT, OUT_OF_REACH]) {
          await user.click(await suggestion(words))
          expect((screen.getByRole('textbox', { name: /Describe the form/ }) as HTMLTextAreaElement).value).toBe(words)
        }
        const panel = screen.getByRole('region', { name: 'Scenarios' })
        await user.click(await suggestion(DRAFTING_INTENT.words))
        expect(
          (within(panel).getByRole('textbox', { name: /What should this form do/ }) as HTMLTextAreaElement).value,
        ).toBe(DRAFTING_INTENT.words)
        expect(relayPane(), 'a suggestion asked the model rather than filling in the box').toBeNull()

        await user.click(screen.getByRole('button', { name: 'Translations' }))
        await user.click(await suggestion(FRENCH.words))
        const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
        const request = within(relay).getByRole('textbox', { name: 'The request' }) as HTMLTextAreaElement
        expect(request.value).toContain(`"locale": "${FRENCH.locale}"`)
        // Opened on the language asked for, where the review will be, rather than on English
        // with a line saying where the French went.
        await waitFor(() =>
          expect((within(editor()).getByRole('combobox', { name: 'Language' }) as HTMLSelectElement).value).toBe(
            FRENCH.locale,
          ),
        )

        expect(undoButton().disabled, 'a suggestion changed the form').toBe(true)
        expect(sent.fetch).not.toHaveBeenCalled()
        expect(sent.open).not.toHaveBeenCalled()
        expect(sent.beacon).not.toHaveBeenCalled()
        expect(sent.window).not.toHaveBeenCalled()
      } finally {
        sent.restore()
      }
    },
  )

  test.each(BUILDERS)(
    'in the %s builder, the change answered backwards through the relay is named by the starter’s examples before Apply',
    async (which) => {
      /*
       * The reason this change is the one suggested. Answered with the canton rule turned
       * round — valid, compiled, and backwards — the review names every example that pins the
       * canton while nothing has landed. (Not only those: every example starts from a German
       * sample, which the backwards rule now asks for a canton.) The names are the starter's
       * own, read off its examples: typed here, a renamed example would leave this asserting
       * a sentence nobody shows.
       */
      const pinned = STARTER_SCENARIOS.filter(({ visible }) => visible !== undefined && 'canton' in visible)
      expect(pinned, 'no example pins the canton, so nothing below can name one').not.toEqual([])
      const backwards = JSON.parse(JSON.stringify(STARTER_SCHEMA)) as {
        model: { fields: { key: string; options?: unknown[] }[] }
        logic: { rules: { target: string; cel?: string }[] }
      }
      backwards.model.fields.find(({ key }) => key === 'country')?.options?.push({ value: 'AT', label: 'Austria' })
      for (const rule of backwards.logic.rules.filter(({ target }) => target === 'canton')) rule.cel = 'country != "CH"'

      const user = userEvent.setup()
      render(<App />)
      await builtWith(which)
      await user.click(await suggestion(BACKWARDS_EDIT.words))
      await user.click(screen.getByRole('button', { name: 'Write it' }))

      const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
      expect((within(relay).getByRole('textbox', { name: 'The request' }) as HTMLTextAreaElement).value).toContain(
        BACKWARDS_EDIT.words,
      )
      await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
      await user.paste(JSON.stringify(backwards))
      await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))

      const review = await waitFor(() => screen.getByRole('region', { name: /would stop holding/ }), {
        timeout: 10_000,
      })
      const heading = within(review).getByRole('heading').textContent ?? ''
      expect(pinned.filter(({ name }) => !heading.includes(name))).toEqual([])
      expect(review.textContent).toContain(BACKWARDS_EDIT.words)
      expect(undoButton().disabled, 'something was applied before anybody agreed to it').toBe(true)
    },
  )

  test.each(BUILDERS)(
    'in the %s builder, none is pressable while the run it would fill waits — and the translation not while its review is held',
    async (which) => {
      /*
       * A change suggested while a turn waits would do nothing: the box is the run's words
       * then. A translation suggested while one waits would do nothing either, and once its
       * answer is under review it would ask again and forget the review the visitor carried a
       * turn for.
       */
      const user = userEvent.setup()
      render(<App />)
      await builtWith(which)
      await user.click(await suggestion(OUT_OF_REACH.words))
      await user.click(screen.getByRole('button', { name: 'Write it' }))
      await screen.findByRole('region', { name: 'Take this request to a model' })
      await waitFor(() => expect(disabled(BACKWARDS_EDIT.words)).toBe(true))
      await user.click(screen.getByRole('button', { name: 'Stop' }))
      await waitFor(() => expect(disabled(BACKWARDS_EDIT.words)).toBe(false))

      await user.click(screen.getByRole('button', { name: 'Translations' }))
      await user.click(await suggestion(FRENCH.words))
      await waitFor(() => expect(disabled(FRENCH.words)).toBe(true))

      const english = STARTER_SCHEMA.i18n.messages['en'] ?? {}
      const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
      await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
      await user.paste(
        JSON.stringify({
          locale: 'fr',
          defaultLocale: 'en',
          messages: missingMessages(STARTER_SCHEMA as unknown as FormSchema, 'fr').map((id) => ({
            id,
            source: english[id],
            target: `${english[id] ?? id} (fr)`,
          })),
        }),
      )
      await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))
      await within(editor()).findByRole('region', { name: /^Review these translations into fr/ }, { timeout: 10_000 })
      expect(disabled(FRENCH.words)).toBe(true)
    },
  )

  test.each(BUILDERS)(
    'in the %s builder, the translation can be pressed exactly when the pane on French offers its own Ask — not after Apply, and again after Undo',
    async (which) => {
      /*
       * The suggestion is what the pane's Ask on French does, so it is pressable when that
       * Ask is and not otherwise. Left pressable once the French is applied, it asked nobody
       * and the pane said the model had left every message untranslated: no model had been
       * asked anything. Undo changes what is missing and not the run, so a list that heard
       * only the run would stay disabled with the French half-finished again. Each state is
       * read off the pane's own Ask, found by the catalogue's words for it — and seen there
       * first, so "no Ask" cannot hold of a pane drawn under words it never had.
       */
      const user = userEvent.setup()
      render(<App />)
      await builtWith(which)
      await user.click(screen.getByRole('button', { name: 'Translations' }))
      await user.selectOptions(
        await within(editor()).findByRole('combobox', { name: 'Language' }, { timeout: 10_000 }),
        FRENCH.locale,
      )
      const missing = missingMessages(STARTER_SCHEMA as unknown as FormSchema, FRENCH.locale)
      const ask = builderTextFor('en')('translate.ask', { count: missing.length })
      const paneAsks = (): boolean => within(editor()).queryByRole('button', { name: ask }) !== null

      await within(editor()).findByRole('button', { name: ask }, { timeout: 10_000 })
      expect(disabled(FRENCH.words), 'the pane offers Ask on French and the suggestion does not').toBe(false)

      await user.click(await suggestion(FRENCH.words))
      const english = STARTER_SCHEMA.i18n.messages['en'] ?? {}
      const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
      await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
      await user.paste(
        JSON.stringify({
          locale: FRENCH.locale,
          defaultLocale: 'en',
          messages: missing.map((id) => ({ id, source: english[id], target: `${english[id] ?? id} (fr)` })),
        }),
      )
      await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))
      const review = await within(editor()).findByRole(
        'region',
        { name: /^Review these translations into fr/ },
        { timeout: 10_000 },
      )
      await user.click(within(review).getByRole('button', { name: 'Apply these translations' }))
      await waitFor(() => expect(undoButton().disabled).toBe(false))

      expect(paneAsks(), 'the French is finished, and the pane still offers to ask for it').toBe(false)
      await waitFor(() =>
        expect(disabled(FRENCH.words), 'nothing in French is missing, and the suggestion still asks for it').toBe(
          true,
        ),
      )

      await user.click(undoButton())
      await within(editor()).findByRole('button', { name: ask }, { timeout: 10_000 })
      await waitFor(() =>
        expect(disabled(FRENCH.words), 'the French is half-finished again, and the suggestion did not hear it').toBe(
          false,
        ),
      )
    },
  )

  test.each(BUILDERS)('in the %s builder, they are reached from the keyboard and pressed with it', async (which) => {
    // Real buttons in the tab order, after the builder's own chooser and before the box they
    // fill: a suggestion only a pointer could press would leave a keyboard with an empty box.
    const user = userEvent.setup()
    render(<App />)
    await builtWith(which)
    await suggestion(BACKWARDS_EDIT.words)
    screen.getByRole('combobox', { name: 'Builder' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: BACKWARDS_EDIT.words }))
    await user.keyboard('{Enter}')
    expect((screen.getByRole('textbox', { name: /Describe the form/ }) as HTMLTextAreaElement).value).toBe(
      BACKWARDS_EDIT.words,
    )
  })

  test('the same suggestions, in either builder, on every tab that has any', async () => {
    /*
     * The suggestions are the page's, drawn by each builder beside its own panes, so nothing
     * but this compares the two drawings: the same lists under the same names, the same
     * buttons in the same order, each described by what it shows.
     */
    const drawn: Record<(typeof BUILDERS)[number], string[][]> = { React: [], Angular: [] }
    for (const which of BUILDERS) {
      const user = userEvent.setup()
      render(<App />)
      await builtWith(which)
      await suggestion(BACKWARDS_EDIT.words)
      const fields = listed()
      await user.click(screen.getByRole('button', { name: 'Translations' }))
      await suggestion(FRENCH.words)
      drawn[which] = [...fields, ...listed()]
      cleanup()
    }
    expect(drawn.React.map(([name]) => name)).toEqual([LEADS.prompt, LEADS.drafting, LEADS.translation])
    expect(drawn.React.flat()).toEqual(
      expect.arrayContaining(STARTER_SUGGESTIONS.flatMap(({ words, shows }) => [words, shows])),
    )
    expect(drawn.Angular).toEqual(drawn.React)
  })

  test.each(BUILDERS)('in the %s builder, another demo shows none', async (which) => {
    // They name the starter's canton, delivery and French; on the wizard they would offer a
    // change to fields it does not have.
    const user = userEvent.setup()
    render(<App />)
    await builtWith(which)
    await suggestion(BACKWARDS_EDIT.words)
    const named = (): string[] => within(editor()).getAllByRole('treeitem').map((item) => item.textContent ?? '')
    expect(named().filter((item) => item.includes('Voucher code'))).not.toEqual([])

    await user.selectOptions(screen.getByRole('combobox', { name: 'Demo' }), 'wizard')
    // Drawn, and drawn for the wizard — a tree without the starter's fields, and its prompt
    // pane there — or "none" would hold of a builder that had not drawn yet.
    await waitFor(
      () => {
        expect(named().length).toBeGreaterThan(0)
        expect(named().filter((item) => item.includes('Voucher code'))).toEqual([])
      },
      { timeout: 10_000 },
    )
    await within(editor()).findByRole('textbox', { name: /Describe the form/ }, { timeout: 10_000 })
    expect(listed()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Translations' }))
    await within(editor()).findByRole('combobox', { name: 'Language' }, { timeout: 10_000 })
    expect(listed()).toEqual([])
    expect(
      STARTER_SUGGESTIONS.filter(({ words }) => screen.queryByRole('button', { name: words }) !== null),
    ).toEqual([])
  })
})
