import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession, createBuilderText } from '@formancy/builder-core'
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
