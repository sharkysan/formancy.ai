import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
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
