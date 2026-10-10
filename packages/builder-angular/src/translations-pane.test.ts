import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession, createBuilderText } from '@formancy/builder-core'
import type { AskModel, BuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyTranslationsPane } from './translations-pane'

/**
 * Translating a form, which must behave as the React pane does.
 *
 * Two jobs belonging to different people: an author extracts once, a translator
 * works through a language. This pane is built around the second and keeps the
 * first to one button, because the first is a step and the second is the work.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const plain: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email' },
      { key: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
}

interface Mounted {
  session: BuilderSession
  click(element: Element): Promise<void>
  type(element: Element, text: string): Promise<void>
  select(element: Element, value: string): Promise<void>
  settle(): Promise<void>
}

const mount = async (form: FormSchema = plain): Promise<Mounted> => {
  const session = createBuilderSession(form)
  const view = await render(FormancyTranslationsPane, {
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
    click: async (element) => {
      await user.click(element as HTMLElement)
      await settle()
    },
    type: async (element, text) => {
      await user.type(element as HTMLElement, text)
      await settle()
    },
    select: async (element, value) => {
      await user.selectOptions(element as HTMLElement, value)
      await settle()
    },
  }
}

const table = (): HTMLElement => document.querySelector('table') as HTMLElement

describe('a form with nothing extracted yet', () => {
  test('says what is translatable and offers to make it so', async () => {
    await mount()

    expect(screen.getByText(/nothing in this form is translatable yet/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /make this form translatable/i })).toBeTruthy()
  })

  test('and the words survive it, which is the whole point', async () => {
    const { session, click } = await mount()

    await click(screen.getByRole('button', { name: /make this form translatable/i }))

    // Extraction turns a literal into a reference and keeps what it said. A
    // version that lost the words would be a version nobody could undo.
    const messages = session.document().i18n?.messages['en'] ?? {}
    expect(Object.values(messages)).toContain('Email')
  })
})

describe('translating', () => {
  const extracted = async (): Promise<Mounted> => {
    const mounted = await mount()
    await mounted.click(screen.getByRole('button', { name: /make this form translatable/i }))
    return mounted
  }

  test('every message is a row, named by what it says rather than by its id', async () => {
    await extracted()

    // A translator reading `email.label` is reading the schema's name for a
    // question rather than the question.
    expect(within(table()).getByText('Email')).toBeTruthy()
    expect(within(table()).queryByText('email.label')).toBeNull()
  })

  test('a language can be added, which is how a translator starts one', async () => {
    const { session, click, type } = await extracted()

    await type(screen.getByRole('textbox', { name: /new language/i }), 'de')
    await click(screen.getByRole('button', { name: /add language/i }))

    expect(Object.keys(session.document().i18n?.messages ?? {})).toContain('de')
  })

  test('typing a translation stores it under the chosen language', async () => {
    const { session, click, type } = await extracted()
    await type(screen.getByRole('textbox', { name: /new language/i }), 'de')
    await click(screen.getByRole('button', { name: /add language/i }))

    await type(within(table()).getByRole('textbox', { name: 'Email' }), 'E-Mail')

    expect(Object.values(session.document().i18n?.messages['de'] ?? {})).toContain('E-Mail')
  })

  test('an untranslated message is marked, so a half-done language is visible', async () => {
    // Falling back silently is right when a form is rendered and wrong here:
    // "it looked fine in the preview" is how a language ships half-finished.
    const { click, type } = await extracted()
    await type(screen.getByRole('textbox', { name: /new language/i }), 'de')
    await click(screen.getByRole('button', { name: /add language/i }))

    expect(within(table()).getAllByText(/not translated/i).length).toBeGreaterThan(0)
  })
})

describe('seeing the language being translated', () => {
  test('the preview renders the form, and the document is not edited to look at it', async () => {
    /*
     * A translator could otherwise write a language and not see it: an engine
     * resolves text in one locale, fixed for its lifetime, so the only way to
     * look was to change the document's `defaultLocale` — an edit to the form in
     * order to read it, which is then published, diffed and migrated like any
     * other edit.
     */
    const mounted = await mount()
    await mounted.click(screen.getByRole('button', { name: /make this form translatable/i }))
    const before = JSON.stringify(mounted.session.document())

    await mounted.type(screen.getByRole('textbox', { name: /new language/i }), 'de')
    await mounted.click(screen.getByRole('button', { name: /add language/i }))
    await mounted.settle()

    const preview = screen.getByLabelText(/preview in de/i)
    expect(within(preview).getByLabelText('Email')).toBeTruthy()
    // The only difference is the language that was added, never the default.
    expect(JSON.parse(before).i18n.defaultLocale).toBe(
      mounted.session.document().i18n?.defaultLocale,
    )
  })

  test('shows the translation once there is one, which is what the locale is for', async () => {
    /*
     * The case that distinguishes the preview from the pane around it. Written
     * only against the FALLBACK, these cases passed with the engine's `locale`
     * removed entirely — an untranslated language renders the default either
     * way, so asserting the English text asserts nothing about the locale.
     */
    const mounted = await mount()
    await mounted.click(screen.getByRole('button', { name: /make this form translatable/i }))
    await mounted.type(screen.getByRole('textbox', { name: /new language/i }), 'de')
    await mounted.click(screen.getByRole('button', { name: /add language/i }))
    await mounted.type(within(table()).getByRole('textbox', { name: 'Email' }), 'E-Mail')

    const preview = screen.getByLabelText(/preview in de/i)
    expect(within(preview).getByLabelText('E-Mail')).toBeTruthy()
    expect(within(preview).queryByLabelText('Email')).toBeNull()
  })

  test('and an untranslated question falls back rather than showing its id', async () => {
    // A preview showing message ids would teach a translator that the fallback
    // is broken, when the fallback is the feature.
    const mounted = await mount()
    await mounted.click(screen.getByRole('button', { name: /make this form translatable/i }))
    await mounted.type(screen.getByRole('textbox', { name: /new language/i }), 'de')
    await mounted.click(screen.getByRole('button', { name: /add language/i }))

    const preview = screen.getByLabelText(/preview in de/i)
    expect(within(preview).getByLabelText('Email')).toBeTruthy()
  })
})

describe('messages nothing refers to', () => {
  test('are shown rather than deleted, with what they said', async () => {
    // A field can come back, and a year of somebody's translations should not
    // disappear because a key changed.
    const session = createBuilderSession(plain)
    session.extractAllText()
    session.removeField(['email'])
    const view = await render(FormancyTranslationsPane, {
      componentInputs: { session },
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()

    const kept = document.querySelector('[data-formancy-part="translations-orphaned"]')
    expect(kept?.textContent).toMatch(/Email/)
  })
})

describe('the catalogue leaving and coming back, as it does in React', () => {
  /*
   * The same block exists in `packages/builder-react/src/translations-pane.test.tsx`,
   * and that is the point: **the round trip is where the two panes can diverge
   * without anybody finding out.** They name the downloaded file, choose the
   * accepted types and report a bad file independently, so a difference in any
   * of those is a translator being handed two products.
   *
   * Both panes were weakly covered here — 61% and 70% of their lines — and the
   * uncovered block was the download and the upload in each. The core's
   * `exportCatalogue`/`importCatalogue` were already covered; what was not was
   * the plumbing a person touches, which is also the plumbing that can silently
   * do nothing. A button that builds a blob and never clicks looks exactly like
   * a working download.
   */
  const translated = async () => {
    const session = createBuilderSession(plain)
    session.extractAllText()
    session.setMessage('fr', 'email.label', 'Adresse professionnelle')
    const view = await render(FormancyTranslationsPane, {
      componentInputs: { session },
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()

    // The pane opens on the default language; everything here is about the one
    // being translated. React's block learned the same thing by getting
    // `contact.en.json` when it expected `.fr.json`.
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')
    await view.fixture.whenStable()
    return { session, view, user }
  }

  const downloadSpies = () => {
    const clicked: string[] = []
    const urls: string[] = []
    const revoked: string[] = []
    let text = ''
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      // The real signature takes a `MediaSource` too; narrowed here because only
      // a `Blob` is ever passed and the text is what the case is about.
      const file = blob as Blob
      void file.text().then((read) => {
        text = read
      })
      const url = `blob:fake/${String(urls.length)}`
      urls.push(url)
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => void revoked.push(url))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })
    return { clicked, urls, revoked, read: () => text }
  }

  test('downloads a file named for the form and the language, as React does', async () => {
    const { session, user } = await translated()
    const spies = downloadSpies()

    await user.click(screen.getByRole('button', { name: /download/i }))
    await Promise.resolve()
    await Promise.resolve()

    // The same name the React pane produces. If these two ever disagreed, two
    // deployments of one product would hand a translator differently named files
    // for the same work.
    expect(spies.clicked).toEqual([`${session.document().id}.fr.json`])
    expect(spies.urls.length, 'nothing was offered to download').toBe(1)
    expect(spies.revoked, 'the object URL was never revoked').toEqual(spies.urls)
  })

  test('and the file carries the source beside every target', async () => {
    const { user } = await translated()
    const spies = downloadSpies()

    await user.click(screen.getByRole('button', { name: /download/i }))
    await Promise.resolve()
    await Promise.resolve()

    const file = JSON.parse(spies.read()) as {
      locale?: string
      defaultLocale?: string
      messages?: Array<{ id: string; source: string; target: string }>
    }
    expect(file.locale).toBe('fr')
    expect(file.defaultLocale, 'a target with no source language is a target against nothing').toBeDefined()
    expect(file.messages?.length, 'the catalogue went out empty').toBeGreaterThan(0)
    expect(Object.keys(file.messages?.[0] ?? {}).sort()).toEqual(['id', 'source', 'target'])
  })

  test('an uploaded catalogue reaches the document', async () => {
    const { session } = await translated()
    const id = session.exportCatalogue('fr').messages[0]?.id
    expect(id, 'nothing was extracted to translate').toBeDefined()

    const file = new File(
      [
        JSON.stringify({
          locale: 'fr',
          defaultLocale: 'en',
          messages: [{ id: id as string, source: 'x', target: 'Bonjour' }],
        }),
      ],
      'contact.fr.json',
      { type: 'application/json' },
    )
    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [file] } })

    await waitFor(() => {
      expect(
        session.exportCatalogue('fr').messages.find((message) => message.id === id)?.target,
      ).toBe('Bonjour')
    })
  })

  test('and a file that is not one of ours is reported rather than swallowed', async () => {
    /*
     * The worst available outcome is silence: a translator uploads an
     * afternoon's work, nothing happens, nothing says why. The handler catches
     * inside a promise, which is the shape that swallows an error the moment the
     * `catch` is dropped — and nothing proved it was there, in either renderer.
     */
    const { view } = await translated()

    fireEvent.change(screen.getByLabelText(/upload/i), {
      target: { files: [new File(['this is not json'], 'notes.txt', { type: 'text/plain' })] },
    })

    await waitFor(() => {
      // Synchronous on purpose: `waitFor`'s callback is typed to return nothing,
      // and it re-runs until the assertion holds — which is what settles the
      // fixture here without an `await` inside it.
      const said = document.querySelector('[data-formancy-part="translations-problem"]')
      expect(said, 'an unreadable file was accepted in silence').not.toBeNull()
      expect((said?.textContent ?? '').length).toBeGreaterThan(0)
    })
  })

  test('and a JSON file that is not a catalogue is reported with the session’s reason', async () => {
    // The pane dropped every outcome `importCatalogue` returned, so a refusal
    // from the session was a silent no-op after an upload.
    await translated()

    fireEvent.change(screen.getByLabelText(/upload/i), {
      target: { files: [new File(['{"hello":1}'], 'other.json', { type: 'application/json' })] },
    })

    await waitFor(() => {
      const said = document.querySelector('[data-formancy-part="translations-problem"]')
      expect(said?.textContent?.trim()).toBe(createBuilderText()('refuse.notACatalogue'))
    })
  })

  test('and a file that is not JSON says so in the builder’s words, not the parser’s', async () => {
    await translated()

    fireEvent.change(screen.getByLabelText(/upload/i), {
      target: { files: [new File(['this is not json'], 'notes.txt', { type: 'text/plain' })] },
    })

    await waitFor(() => {
      const said = document.querySelector('[data-formancy-part="translations-problem"]')
      expect(said?.textContent?.trim()).toBe(createBuilderText()('translations.unreadable'))
    })
  })

  test('and choosing no file at all does nothing', async () => {
    const { session } = await translated()
    const before = JSON.stringify(session.document())

    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [] } })
    await Promise.resolve()

    expect(JSON.stringify(session.document())).toBe(before)
  })
})

/**
 * Asking a model for what a language is missing (0161), as the React pane does.
 *
 * Given a model, the pane asks for exactly the messages the language lacks, and holds the
 * answer for review message by message — the source beside what was there and what is
 * proposed, a mark on anything to look at, the form as the proposal would leave it — until
 * Apply. Queried inside the review by its name: the pane's own table and preview carry the
 * same words.
 */
describe('asking a model for what is missing', () => {
  const half: FormSchema = {
    specVersion: '4',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        {
          key: 'country',
          type: 'select',
          label: { $t: 'country' },
          options: [
            { value: 'CH', label: { $t: 'country.ch' } },
            { value: 'DE', label: { $t: 'country.de' } },
          ],
        },
        { key: 'canton', type: 'text', label: { $t: 'canton' } },
        { key: 'email', type: 'text', label: { $t: 'email' } },
      ],
    },
    i18n: {
      defaultLocale: 'en',
      messages: {
        en: { country: 'Country', 'country.ch': 'Switzerland', 'country.de': 'Germany', canton: 'Canton', email: 'Email' },
        fr: { country: 'Pays', 'country.ch': 'Suisse' },
        // Started and empty: a third language to move to, which is not the default.
        de: {},
      },
    },
  }
  const FRENCH: Readonly<Record<string, string>> = {
    'country.de': 'Allemagne',
    canton: 'Canton',
    email: 'Courriel',
  }
  const SOURCES = half.i18n!.messages['en']!

  /** A catalogue file answering every id given, as a model would write it. */
  const answer = (targets: Readonly<Record<string, string>>): string =>
    JSON.stringify({
      locale: 'fr',
      defaultLocale: 'en',
      messages: Object.entries(targets).map(([id, target]) => ({ id, source: SOURCES[id], target })),
    })

  const mountWith = async (ask?: AskModel) => {
    const session = createBuilderSession(half)
    const view = await render(FormancyTranslationsPane, {
      // As the prompt pane's tests mount it: a session and a function.
      inputs: { session, ...(ask === undefined ? {} : { ask }) } as Record<string, unknown>,
      providers: [provideZonelessChangeDetection()],
    })
    await view.fixture.whenStable()
    return { session, user: userEvent.setup() }
  }
  const choose = async (user: ReturnType<typeof userEvent.setup>, locale: string): Promise<void> => {
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), locale)
  }
  const review = (): Promise<HTMLElement> =>
    waitFor(() => screen.getByRole('region', { name: /^Review these translations into fr/ }))

  test('offers nothing without a model, as the prompt pane does', async () => {
    // As in the React pane: a button that cannot work is worse than none.
    const { user } = await mountWith()
    await choose(user, 'fr')

    expect(screen.queryByRole('button', { name: /Ask a model/ })).toBeNull()
  })

  test('and nothing in the default language, which has nothing to translate into', async () => {
    // Prevents an Ask over the language every source is written in: a request to translate
    // the English into English.
    await mountWith(() => Promise.resolve(answer(FRENCH)))

    expect(screen.queryByRole('button', { name: /Ask a model/ })).toBeNull()
  })

  test('asks for the missing messages, and shows the answer beside what was there before anything lands', async () => {
    // Prevents a model's French landing unread, as in the React pane.
    const asked: string[] = []
    const { session, user } = await mountWith((prompt) => {
      asked.push(prompt.user)
      return Promise.resolve(answer(FRENCH))
    })
    await choose(user, 'fr')

    await user.click(await waitFor(() => screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' })))
    const region = await review()

    expect(asked).toHaveLength(1)
    expect(within(region).getByRole('heading').textContent?.trim()).toBe(
      'Review these translations into fr — some are marked to look at',
    )
    const rows = within(within(region).getByRole('table'))
      .getAllByRole('row')
      .filter((row) => within(row).queryByRole('rowheader') !== null)
      .map((row) => [
        within(row).getByRole('rowheader').textContent?.trim(),
        ...within(row).getAllByRole('cell').map((cell) => cell.textContent?.trim()),
      ])
    expect(rows).toEqual([
      ['Germany', 'Not translated', 'Allemagne', ''],
      ['Canton', 'Not translated', 'Canton', 'The same as the source'],
      ['Email', 'Not translated', 'Courriel', ''],
    ])
    const proposed = within(region).getByRole('region', { name: 'Preview in fr, as proposed' })
    await waitFor(() => expect(within(proposed).getByRole('textbox', { name: 'Courriel' })).toBeTruthy())
    expect(session.revision()).toBe(0)
    expect(screen.getByRole('status').textContent?.trim()).toBe(
      'Ready to review: 3 translations. Nothing has been applied.',
    )
  })

  test('applies it as one undo step, and the language is no longer missing anything', async () => {
    // Prevents an Apply that writes part of the answer, takes more than one undo to take
    // back, or leaves the review and Ask on screen for a language with nothing left to ask.
    const { session, user } = await mountWith(() => Promise.resolve(answer(FRENCH)))
    await choose(user, 'fr')
    await user.click(await waitFor(() => screen.getByRole('button', { name: /Ask a model/ })))

    await user.click(within(await review()).getByRole('button', { name: 'Apply these translations' }))

    expect(session.document().i18n?.messages['fr']).toMatchObject(FRENCH)
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull())
    expect(screen.queryByRole('button', { name: /Ask a model/ })).toBeNull()
    session.undo()
    expect(session.document()).toEqual(half)
  })

  test('discards it, and nothing is written', async () => {
    // Prevents a Discard that writes anything, or leaves the review on screen to be applied
    // later against a form that has moved on.
    const { session, user } = await mountWith(() => Promise.resolve(answer(FRENCH)))
    await choose(user, 'fr')
    await user.click(await waitFor(() => screen.getByRole('button', { name: /Ask a model/ })))

    await user.click(within(await review()).getByRole('button', { name: 'Discard' }))

    expect(session.revision()).toBe(0)
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull())
  })

  test('offers the rest when the model left some out, and the two land together', async () => {
    // As in the React pane: a model told to leave what it is unsure of empty will. The
    // rest is asked for over the first answer, and both land in one Apply.
    const asked: string[] = []
    const answers = [answer({ email: 'Courriel' }), answer({ 'country.de': 'Allemagne', canton: 'Canton' })]
    const { session, user } = await mountWith((prompt) => {
      asked.push(prompt.user)
      return Promise.resolve(answers[asked.length - 1]!)
    })
    await choose(user, 'fr')
    await user.click(await waitFor(() => screen.getByRole('button', { name: /Ask a model/ })))
    const first = await review()
    expect(screen.getByRole('status').textContent).toContain('2 messages are still missing.')

    await user.click(within(first).getByRole('button', { name: 'Translate the rest' }))

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: /^Review these translations/ })).getAllByRole('row'),
      ).toHaveLength(4),
    )
    expect(asked[1]).toContain('"id": "canton"')
    expect(asked[1]).not.toContain('"id": "email"')
    await user.click(screen.getByRole('button', { name: 'Apply these translations' }))
    expect(session.document().i18n?.messages['fr']).toMatchObject(FRENCH)
    session.undo()
    expect(session.document()).toEqual(half)
  })

  test('offers Ask again when the model left every message empty', async () => {
    // As in the React pane: a proposal that writes nothing has nothing to apply or
    // discard, and held as a review, the part drew no button at all.
    const answers = [answer({ 'country.de': '', canton: '', email: '' }), answer(FRENCH)]
    let turns = 0
    const { user } = await mountWith(() => Promise.resolve(answers[turns++]!))
    await choose(user, 'fr')
    await user.click(await waitFor(() => screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' })))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent?.trim()).toBe(
        'The model left every message untranslated. Nothing has been applied. 3 messages are still missing.',
      ),
    )
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()

    await user.click(await waitFor(() => screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' })))

    expect(within(await review()).getByRole('button', { name: 'Apply these translations' })).toBeTruthy()
    expect(turns).toBe(2)
  })

  test('says what was dropped when a person translated everything the model wrote, and offers the rest', async () => {
    // As in the React pane: the part said the model left every message untranslated, drew
    // the list that would have said otherwise only inside a review it did not draw, and
    // drew no button.
    const held: { session?: BuilderSession } = {}
    const mountedPane = await mountWith(() => {
      held.session!.setMessage('fr', 'canton', 'Canton')
      held.session!.setMessage('fr', 'email', 'Adresse électronique')
      return Promise.resolve(answer({ canton: 'Canton', email: 'Courriel' }))
    })
    held.session = mountedPane.session
    await choose(mountedPane.user, 'fr')
    await mountedPane.user.click(
      await waitFor(() => screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' })),
    )

    await waitFor(() =>
      expect(screen.getByRole('status').textContent?.trim()).toBe(
        'The model translated 2 messages, and none was written: nobody asked for them, or a person has translated them since. Nothing has been applied. 1 message is still missing.',
      ),
    )
    expect(screen.getByText(/^\s*Not written, because/).textContent?.trim()).toBe(
      `Not written, because nobody asked for them or a person has translated them since: ${held.session.text.list(['canton', 'email'])}`,
    )
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ask a model for the 1 missing message' })).toBeTruthy(),
    )
    expect(held.session.document().i18n?.messages['fr']?.['email']).toBe('Adresse électronique')
  })

  test('refuses to apply once the form has moved, and keeps the review on screen', async () => {
    // Prevents the proposal written against one form landing on another: a person typed
    // the canton's French while the review was open, as in the React pane.
    const { session, user } = await mountWith(() => Promise.resolve(answer(FRENCH)))
    await choose(user, 'fr')
    await user.click(await waitFor(() => screen.getByRole('button', { name: /Ask a model/ })))
    const region = await review()
    session.setMessage('fr', 'canton', 'Canton suisse')

    await user.click(within(region).getByRole('button', { name: 'Apply these translations' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent?.trim()).toBe(`Not applied. ${session.text('proposal.stale')}`),
    )
    expect(session.document().i18n?.messages['fr']?.['canton']).toBe('Canton suisse')
    expect(screen.getByRole('region', { name: /^Review these translations/ })).toBeTruthy()
  })

  test('stops the run when the language changes, and the answer that comes later is not proposed', async () => {
    // German, not the default, so the review would still be drawn if it outlived its language.
    let release: (text: string) => void = () => undefined
    let cancelled = false
    const { user } = await mountWith(
      (_prompt, turn) =>
        new Promise<string>((resolve) => {
          release = resolve
          turn.onCancel(() => {
            cancelled = true
          })
        }),
    )
    await choose(user, 'fr')
    await user.click(await waitFor(() => screen.getByRole('button', { name: /Ask a model/ })))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy())

    await choose(user, 'de')
    release(answer(FRENCH))
    await waitFor(() => expect(cancelled).toBe(true))

    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ask a model for the 5 missing messages' })).toBeTruthy(),
    )
  })
})
