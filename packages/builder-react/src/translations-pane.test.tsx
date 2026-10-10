import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { authorForm, createBuilderSession, createBuilderText, createRelay } from '@formancy/builder-core'
import type { AskModel, BuilderSession } from '@formancy/builder-core'
import { FORM_WORDS, FORM_WORDS_FR } from '@formancy/core/words'
import type { FormSchema } from '@formancy/spec'
import { TranslationsPane } from './translations-pane.js'

/**
 * Where somebody translates a form.
 *
 * The format and the engine were finished long before this: a label could be
 * `{ $t: "name" }` and the engine resolved it, and nothing in the builder could
 * produce one. Translated content was a feature a developer could hand-write and
 * an author could not reach — the shape the roadmap kept calling out.
 *
 * Two jobs, and they belong to different people. An **author** extracts: turns
 * the words they already typed into references, once. A **translator** works
 * through a language, and never touches the form's structure. The pane is built
 * around the second, because that is the one somebody does for an hour at a time.
 */
afterEach(cleanup)

const untranslated: FormSchema = {
  specVersion: '3',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Work email' },
      { key: 'note', type: 'textarea', label: 'Anything else?' },
    ],
  },
}

const mount = (schema: FormSchema = untranslated): ReturnType<typeof createBuilderSession> => {
  const session = createBuilderSession(schema)
  render(<TranslationsPane session={session} />)
  return session
}

describe('a form with nothing extracted yet', () => {
  test('says what is translatable and offers to make it so', async () => {
    const user = userEvent.setup()
    const session = mount()

    // An empty pane with no explanation reads as a broken tab. What is true is
    // that the form's words are literals, and one press changes that.
    expect(screen.getByText(/nothing in this form is translatable yet/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /make this form translatable/i }))

    expect(session.document().model.fields[0]?.label).toEqual({ $t: 'email.label' })
    expect(session.document().model.fields[1]?.label).toEqual({ $t: 'note.label' })
  })

  test('and the words survive it, which is the whole point', async () => {
    const user = userEvent.setup()
    const session = mount()

    await user.click(screen.getByRole('button', { name: /make this form translatable/i }))

    const messages = session.document().i18n?.messages['en'] ?? {}
    expect(messages['email.label']).toBe('Work email')
    expect(messages['note.label']).toBe('Anything else?')
  })
})

describe('translating', () => {
  const extracted = (): ReturnType<typeof createBuilderSession> => {
    const session = createBuilderSession(untranslated)
    session.extractText(['email'], 'label')
    session.extractText(['note'], 'label')
    session.addLocale('fr')
    render(<TranslationsPane session={session} />)
    return session
  }

  test('every message is a row, named by what it says rather than by its id', () => {
    extracted()

    // A translator reading `email.label` is reading the schema's name for a
    // question, not the question. The default locale's text is what tells them
    // what they are translating.
    const rows = screen.getAllByRole('row')
    expect(rows.some((row) => within(row).queryByText('Work email') !== null)).toBe(true)
  })

  test('typing a translation stores it under the chosen language', async () => {
    const user = userEvent.setup()
    const session = extracted()

    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')
    // In the TABLE. The preview renders the same question, so its control carries
    // the same accessible name — which is the ambiguity the preview introduced,
    // and the reason both halves of this file now say which half they mean.
    const table = screen.getByRole('table')
    await user.type(within(table).getByRole('textbox', { name: 'Work email' }), 'Adresse pro')

    expect(session.document().i18n?.messages['fr']?.['email.label']).toBe('Adresse pro')
  })

  test('an untranslated message is marked, so a half-done language is visible', async () => {
    const user = userEvent.setup()
    extracted()

    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')

    // Falling back silently is right at render time and wrong here: a translator
    // needs to see what is left, and "it looks fine in the preview" is exactly how
    // a language ships half-finished.
    expect(screen.getAllByText(/not translated/i).length).toBeGreaterThan(0)
  })

  test('a language can be added, which is how a translator starts one', async () => {
    const user = userEvent.setup()
    const session = extracted()

    await user.type(screen.getByRole('textbox', { name: /new language/i }), 'it')
    await user.click(screen.getByRole('button', { name: /add language/i }))

    expect(Object.keys(session.document().i18n?.messages ?? {})).toContain('it')
  })
})

describe('messages nothing refers to', () => {
  test('are shown rather than deleted, with what they said', () => {
    const session = createBuilderSession(untranslated)
    session.extractText(['email'], 'label')
    session.setMessage('fr', 'email.label', 'Adresse professionnelle')
    session.removeField(['email'])
    render(<TranslationsPane session={session} />)

    // A year of somebody's translations disappearing because a field was renamed
    // is the kind of loss a builder never recovers trust from.
    expect(screen.getByText(/no longer used/i)).toBeTruthy()
    expect(screen.getByText('email.label')).toBeTruthy()
  })
})

describe('seeing the language being translated', () => {
  /*
   * The half that was named as missing when the pane shipped: a translator could
   * write a language and not see it, because the engine resolves text in one
   * locale fixed for its lifetime — so the only way to look at a translation was
   * to change the document's default, which is an edit to the form in order to
   * read it.
   *
   * A translator who cannot see their work checks it by reading the table they
   * just typed into, which is not checking.
   */
  const translated = (): ReturnType<typeof createBuilderSession> => {
    const session = createBuilderSession(untranslated)
    session.extractAllText()
    session.setMessage('fr', 'email.label', 'Adresse professionnelle')
    render(<TranslationsPane session={session} />)
    return session
  }

  test('the preview shows the form in the language being worked on', async () => {
    const user = userEvent.setup()
    translated()

    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')

    // Inside the PREVIEW, not anywhere on the pane. The table's own inputs carry
    // the source text as their accessible name, so an unscoped query here passes
    // with no preview at all — which is this repository's most frequent guard
    // failure, found again while writing these three.
    const preview = await screen.findByRole('region', { name: /preview/i })
    expect(within(preview).getByRole('textbox', { name: 'Adresse professionnelle' })).toBeTruthy()
  })

  test('and its button is the visitor’s word in that language, not the builder’s', async () => {
    // The pane named the preview's button from the builder's catalogue, so an English
    // builder previewing French showed "Submit" under French questions — a word no visitor
    // sees, decided a second time beside the renderer's own.
    const user = userEvent.setup()
    translated()

    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')

    const preview = await screen.findByRole('region', { name: /preview/i })
    expect(within(preview).getByRole('button', { name: FORM_WORDS_FR['form.submit'] })).toBeTruthy()
    expect(within(preview).queryByRole('button', { name: FORM_WORDS['form.submit'] })).toBeNull()
  })

  test('and an untranslated question falls back rather than showing its id', async () => {
    const user = userEvent.setup()
    translated()

    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')

    // `note.label` has no French. A preview showing the id would teach a
    // translator that the fallback is broken, when the fallback is the feature.
    const preview = screen.getByRole('region', { name: /preview/i })
    expect(within(preview).getByRole('textbox', { name: 'Anything else?' })).toBeTruthy()
    expect(within(preview).queryByText('note.label')).toBeNull()
  })

  test('the document is not edited to look at it', async () => {
    const user = userEvent.setup()
    const session = translated()
    const before = session.document()

    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')

    // Changing `defaultLocale` would have been the cheap way to do this, and it
    // is an edit to the form in order to read it — published, diffed and
    // migrated like any other.
    expect(session.document()).toBe(before)
  })
})

describe('taking a catalogue out and bringing it back', () => {
  /*
   * A team with a translation vendor works in a file. The pane's table is for
   * somebody translating in the product; this is for somebody who is not in the
   * product at all.
   *
   * jsdom has no download and no file picker worth driving, so what these hold is
   * the part that is ours: the file the pane produces, and what it does with one
   * handed back. The click that saves it is one line of DOM and is not what goes
   * wrong.
   */
  const ready = (): ReturnType<typeof createBuilderSession> => {
    const session = createBuilderSession(untranslated)
    session.extractAllText('en')
    session.addLocale('fr')
    render(<TranslationsPane session={session} />)
    return session
  }

  test('the file offered carries the source beside every target', async () => {
    const user = userEvent.setup()
    const session = ready()
    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')

    // Read off the session rather than off a download: the button hands this
    // exact object to the browser, and asserting the object is asserting what
    // leaves the building.
    const file = session.exportCatalogue('fr')

    expect(screen.getByRole('button', { name: /download/i })).toBeTruthy()
    expect(file.messages.map((message) => message.source)).toEqual([
      'Work email',
      'Anything else?',
    ])
  })

  test('a returned file is applied, and what was odd about it is shown', async () => {
    const user = userEvent.setup()
    const session = ready()
    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')

    // The same call the file input makes once it has read the bytes.
    session.importCatalogue({
      locale: 'fr',
      defaultLocale: 'en',
      messages: [
        { id: 'email.label', source: 'Work email', target: 'Courriel' },
        { id: 'gone.label', source: 'Gone', target: 'Parti' },
      ],
    })
    render(<TranslationsPane session={session} />)

    expect(session.document().i18n?.messages['fr']?.['email.label']).toBe('Courriel')
    // Shown rather than counted silently: an id the form no longer has means the
    // file was exported before somebody deleted a field, and a reviewer has to
    // know which one.
    expect(screen.getAllByText(/gone\.label/).length).toBeGreaterThan(0)
  })
})

describe('the catalogue leaving and coming back', () => {
  /*
   * The round trip is the feature: a catalogue goes out as a file carrying the
   * source beside every target, a translator works on it somewhere else, and it
   * comes back. `exportCatalogue` and `importCatalogue` are covered in
   * `session.test.ts`; **the plumbing in this pane was covered by nothing** —
   * lines 136–143 and 155–166, which is the download and the upload.
   *
   * That gap matters more than its size. A button that builds a blob and never
   * clicks the link looks exactly like a working download: the browser shows
   * nothing either way. And an upload handler that throws inside a promise
   * leaves a translator's afternoon of work silently discarded, which is the
   * outcome the `catch` below exists to prevent and which nothing proved it did.
   */
  const downloadSpies = () => {
    const clicked: Array<{ name: string }> = []
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
      clicked.push({ name: this.download })
    })
    return { clicked, urls, revoked, read: () => text }
  }

  /** Its own session, because the helper above is local to another block. */
  const mountTranslated = async (): Promise<ReturnType<typeof createBuilderSession>> => {
    const session = createBuilderSession(untranslated)
    session.extractAllText()
    session.setMessage('fr', 'email.label', 'Adresse professionnelle')
    render(<TranslationsPane session={session} />)
    // The pane opens on the default language, and everything below is about the
    // one being translated. The first version of these cases skipped this and
    // got `contact.en.json`, which is how it learned that the file is named
    // after the language on screen rather than after the one with work in it.
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: /language/i }), 'fr')
    return session
  }

  test('downloads a file named for the form and the language', async () => {
    /*
     * The name is the only thing a translator sees before they open it, and two
     * languages of one form must not arrive as the same file. `createObjectURL`
     * does not exist in jsdom and clicking an anchor would navigate, so both are
     * stubbed; what is asserted is what somebody ends up with.
     */
    const user = userEvent.setup()
    const session = await mountTranslated()
    const spies = downloadSpies()

    await user.click(screen.getByRole('button', { name: /download/i }))
    await Promise.resolve()
    await Promise.resolve()

    expect(spies.clicked.map(({ name }) => name)).toEqual([`${session.document().id}.fr.json`])
    expect(spies.urls.length, 'nothing was offered to download').toBe(1)
    expect(spies.revoked, 'the object URL was never revoked').toEqual(spies.urls)
  })

  test('and the file carries the source beside every target, which is what a memory matches on', async () => {
    /*
     * A list of ids and blanks tells a translator nothing, and a translation
     * memory matches on source text. This is the claim the roadmap makes about
     * the format, asserted against the bytes that leave the page rather than
     * against the function that built them.
     */
    const user = userEvent.setup()
    await mountTranslated()
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
    // The other half of the trip, and the half with somebody's work in it.
    const session = await mountTranslated()
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
      'order.fr.json',
      { type: 'application/json' },
    )
    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [file] } })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(
      session.exportCatalogue('fr').messages.find((message) => message.id === id)?.target,
    ).toBe('Bonjour')
  })

  test('and a file that is not one of ours is reported rather than swallowed', async () => {
    /*
     * The worst available outcome is a silent no-op: a translator uploads an
     * afternoon's work, nothing happens, and nothing says why. The handler
     * catches inside a promise, which is precisely the shape that swallows an
     * error if the `catch` is ever dropped — and nothing proved it was there.
     */
    await mountTranslated()

    const file = new File(['this is not json'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [file] } })

    /*
     * `waitFor`, because the handler reads the file in a promise and sets state
     * from inside it — outside `act`, so an assertion on the next line reads the
     * markup from before. Third time that has caught me this week; it is the
     * default shape of a mistake in a promise-driven handler.
     *
     * The named part rather than a wording: the message is whatever
     * `JSON.parse` threw, which differs between engines. What must hold is that
     * something is said at all.
     */
    await waitFor(() => {
      const said = document.querySelector('[data-formancy-part="translations-problem"]')
      expect(said, 'an unreadable file was accepted in silence').not.toBeNull()
      expect((said?.textContent ?? '').length).toBeGreaterThan(0)
    })
  })

  test('and a JSON file that is not a catalogue is reported with the session’s reason', async () => {
    /*
     * It threw "file.messages is not iterable" inside the session, and this pane
     * showed that to a translator as the reason. With the session refusing it in
     * words instead, the pane has to show the refusal — which it did not: it
     * dropped every outcome `importCatalogue` returned.
     */
    await mountTranslated()

    const file = new File(['{"hello":1}'], 'other.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [file] } })

    await waitFor(() => {
      const said = document.querySelector('[data-formancy-part="translations-problem"]')
      expect(said?.textContent).toBe(createBuilderText()('refuse.notACatalogue'))
    })
  })

  test('and a file that is not JSON says so in the builder’s words, not the parser’s', async () => {
    await mountTranslated()

    const file = new File(['this is not json'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [file] } })

    await waitFor(() => {
      const said = document.querySelector('[data-formancy-part="translations-problem"]')
      expect(said?.textContent).toBe(createBuilderText()('translations.unreadable'))
    })
  })

  test('and choosing no file at all does nothing, rather than importing undefined', async () => {
    // A file input fires `change` when a picker is cancelled on some platforms.
    // The early return is one line and the alternative is parsing `undefined`.
    const session = await mountTranslated()
    const before = JSON.stringify(session.document())

    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [] } })
    await Promise.resolve()

    expect(JSON.stringify(session.document())).toBe(before)
  })
})

/**
 * Asking a model for what a language is missing (0161).
 *
 * The pane marked every missing message and nothing helped fill them. Given a model, it
 * asks for exactly those, and holds the answer for review message by message — the source
 * beside what was there and what is proposed, a mark on anything to look at, and the form
 * as the proposal would leave it — before anything lands. Queried inside the review by its
 * name: the pane's own table and preview carry the same words.
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

  const mount = (ask?: AskModel) => {
    const session = createBuilderSession(half)
    const view = render(<TranslationsPane session={session} {...(ask === undefined ? {} : { ask })} />)
    return { session, ...view }
  }
  const french = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr')
  }
  const review = (): Promise<HTMLElement> =>
    screen.findByRole('region', { name: /^Review these translations into fr/ })

  test('offers nothing without a model, as the prompt pane does', async () => {
    // A button that cannot work is worse than none: without `ask` the pane is the pane it was.
    const user = userEvent.setup()
    mount()
    await french(user)

    expect(screen.queryByRole('button', { name: /Ask a model/ })).toBeNull()
  })

  test('and nothing in the default language, which has nothing to translate into', () => {
    // Prevents an Ask over the language every source is written in: a request to translate
    // the English into English.
    mount(() => Promise.resolve(answer(FRENCH)))

    expect(screen.queryByRole('button', { name: /Ask a model/ })).toBeNull()
  })

  test('asks for the missing messages, and shows the answer beside what was there before anything lands', async () => {
    // Prevents a model's French landing unread: the review is the source, what was there,
    // what is proposed and what to look at — and the form as it would read — and the
    // document is untouched until Apply.
    const user = userEvent.setup()
    const asked: string[] = []
    const { session } = mount((prompt) => {
      asked.push(prompt.user)
      return Promise.resolve(answer(FRENCH))
    })
    await french(user)

    await user.click(screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' }))
    const region = await review()

    expect(asked).toHaveLength(1)
    // The name says something in it is marked: "Canton" is the same as its source.
    expect(region.getAttribute('aria-labelledby')).not.toBeNull()
    expect(within(region).getByRole('heading').textContent).toBe(
      'Review these translations into fr — some are marked to look at',
    )
    const rows = within(within(region).getByRole('table'))
      .getAllByRole('row')
      .filter((row) => within(row).queryByRole('rowheader') !== null)
      .map((row) => [within(row).getByRole('rowheader').textContent, ...within(row).getAllByRole('cell').map((cell) => cell.textContent)])
    expect(rows).toEqual([
      ['Germany', 'Not translated', 'Allemagne', ''],
      ['Canton', 'Not translated', 'Canton', 'The same as the source'],
      ['Email', 'Not translated', 'Courriel', ''],
    ])
    // The form as the proposal would leave it, in French.
    const proposed = within(region).getByRole('region', { name: 'Preview in fr, as proposed' })
    expect(within(proposed).getByRole('textbox', { name: 'Courriel' })).toBeTruthy()
    // And around it the visitor's French, not the builder's English "Submit".
    expect(within(proposed).getByRole('button', { name: FORM_WORDS_FR['form.submit'] })).toBeTruthy()
    // Proposed, not applied.
    expect(session.revision()).toBe(0)
    expect(screen.getByRole('status').textContent).toBe(
      'Ready to review: 3 translations. Nothing has been applied.',
    )
  })

  test('applies it as one undo step, and the language is no longer missing anything', async () => {
    // Prevents an Apply that writes part of the answer, takes more than one undo to take
    // back, or leaves the review and Ask on screen for a language with nothing left to ask.
    const user = userEvent.setup()
    const { session } = mount(() => Promise.resolve(answer(FRENCH)))
    await french(user)
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))

    await user.click(within(await review()).getByRole('button', { name: 'Apply these translations' }))

    expect(session.document().i18n?.messages['fr']).toMatchObject(FRENCH)
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ask a model/ })).toBeNull()
    session.undo()
    expect(session.document()).toEqual(half)
  })

  test('discards it, and nothing is written', async () => {
    // Prevents a Discard that writes anything, or leaves the review on screen to be applied
    // later against a form that has moved on.
    const user = userEvent.setup()
    const { session } = mount(() => Promise.resolve(answer(FRENCH)))
    await french(user)
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))

    await user.click(within(await review()).getByRole('button', { name: 'Discard' }))

    expect(session.revision()).toBe(0)
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()
  })

  test('offers the rest when the model left some out, and the two land together', async () => {
    // A model told to leave what it is unsure of empty will. The rest is asked for over
    // the first answer, and the review holds both until one Apply.
    const user = userEvent.setup()
    const asked: string[] = []
    const answers = [answer({ email: 'Courriel' }), answer({ 'country.de': 'Allemagne', canton: 'Canton' })]
    const { session } = mount((prompt) => {
      asked.push(prompt.user)
      return Promise.resolve(answers[asked.length - 1]!)
    })
    await french(user)
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))
    expect(screen.getByRole('status').textContent).toContain('2 messages are still missing.')

    await user.click(within(await review()).getByRole('button', { name: 'Translate the rest' }))

    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: /^Review these translations/ })).getAllByRole('row')).toHaveLength(4),
    )
    // The second request asked for the rest alone.
    expect(asked[1]).toContain('"id": "canton"')
    expect(asked[1]).not.toContain('"id": "email"')
    await user.click(screen.getByRole('button', { name: 'Apply these translations' }))
    expect(session.document().i18n?.messages['fr']).toMatchObject(FRENCH)
    session.undo()
    expect(session.document()).toEqual(half)
  })

  test('offers Ask again when the model left every message empty', async () => {
    // A model told to leave a target empty when unsure may leave them all. That proposal
    // writes nothing, so there is nothing to apply or discard; held as a review, the part
    // drew no button at all, and only another language or tab got a person out of it.
    const user = userEvent.setup()
    const answers = [answer({ 'country.de': '', canton: '', email: '' }), answer(FRENCH)]
    let turns = 0
    mount(() => Promise.resolve(answers[turns++]!))
    await french(user)
    await user.click(screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'The model left every message untranslated. Nothing has been applied. 3 messages are still missing.',
      ),
    )
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' }))

    expect(within(await review()).getByRole('button', { name: 'Apply these translations' })).toBeTruthy()
    expect(turns).toBe(2)
  })

  test('says what was dropped when a person translated everything the model wrote, and offers the rest', async () => {
    // The model translated both messages, and a person typed both while it answered, so
    // nothing is written. The part said "the model left every message untranslated", drew
    // the list that would have said otherwise only inside a review it did not draw, and
    // drew no button.
    const user = userEvent.setup()
    const held: { session?: BuilderSession } = {}
    held.session = mount(() => {
      held.session!.setMessage('fr', 'canton', 'Canton')
      held.session!.setMessage('fr', 'email', 'Adresse électronique')
      return Promise.resolve(answer({ canton: 'Canton', email: 'Courriel' }))
    }).session
    await french(user)
    await user.click(screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'The model translated 2 messages, and none was written: nobody asked for them, or a person has translated them since. Nothing has been applied. 1 message is still missing.',
      ),
    )
    expect(screen.getByText(/^Not written, because/).textContent).toBe(
      `Not written, because nobody asked for them or a person has translated them since: ${held.session.text.list(['canton', 'email'])}`,
    )
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ask a model for the 1 missing message' })).toBeTruthy()
    expect(held.session.document().i18n?.messages['fr']?.['email']).toBe('Adresse électronique')
  })

  test('refuses to apply once the form has moved, and keeps the review on screen', async () => {
    // Prevents the proposal written against one form landing on another: here a person
    // typed the canton's French while the review was open.
    const user = userEvent.setup()
    const { session } = mount(() => Promise.resolve(answer(FRENCH)))
    await french(user)
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))
    const region = await review()
    session.setMessage('fr', 'canton', 'Canton suisse')

    await user.click(within(region).getByRole('button', { name: 'Apply these translations' }))

    expect(screen.getByRole('status').textContent).toBe(`Not applied. ${session.text('proposal.stale')}`)
    expect(session.document().i18n?.messages['fr']?.['canton']).toBe('Canton suisse')
    expect(screen.getByRole('region', { name: /^Review these translations/ })).toBeTruthy()
  })

  test('stops the run when the language changes, and the answer that comes later is not proposed', async () => {
    // The review belongs to the language it was asked for. Choosing another while the
    // model is answering ends the run, as taking the pane away does (0157) — German here,
    // not the default, where nothing would be drawn to keep the run alive anyway.
    const user = userEvent.setup()
    let release: (text: string) => void = () => undefined
    let cancelled = false
    mount(
      (_prompt, turn) =>
        new Promise<string>((resolve) => {
          release = resolve
          turn.onCancel(() => {
            cancelled = true
          })
        }),
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr')
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de')
    release(answer(FRENCH))
    await waitFor(() => expect(cancelled).toBe(true))

    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ask a model for the 5 missing messages' })).toBeTruthy()
  })

  test('says another request is waiting while the relay carries the prompt pane’s turn, and takes nothing from it', async () => {
    // A host may hand this pane the relay its prompt pane asks, and a relay carries one turn
    // at a time (0160). Asked while the prompt pane's turn waited, the run ended busy and
    // the status said nothing: the button came back as though the press had been lost.
    const user = userEvent.setup()
    const relay = createRelay()
    const { session } = mount(relay.ask)
    // The prompt pane's run, as it asks: the relay's one turn.
    const editing = authorForm(relay.ask, 'add a phone number', { current: half })
    const editTurn = await waitFor(() => relay.waiting() ?? expect.fail('no turn yet'))
    await french(user)

    await user.click(screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(session.text('prompt.status.busy')))
    expect(relay.waiting()).toBe(editTurn)
    // Offered again, for when that turn is done — and then it asks.
    relay.answer(JSON.stringify(half))
    await editing
    await user.click(screen.getByRole('button', { name: 'Ask a model for the 3 missing messages' }))
    await waitFor(() => expect(relay.waiting()?.prompt.user).toContain('"id": "email"'))
  })
})
