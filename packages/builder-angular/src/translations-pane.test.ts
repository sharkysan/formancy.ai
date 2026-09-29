import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
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
