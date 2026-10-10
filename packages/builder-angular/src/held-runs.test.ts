import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, waitFor, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createBuilderSession, createDraftRun, createTranslationRun } from '@formancy/builder-core'
import type { AskModel, DraftRun, TranslationRun } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyScenarioPane } from './scenario-pane.js'
import { FormancyTranslationsPane } from './translations-pane.js'

/**
 * The same assertions as packages/builder-react/src/held-runs.test.tsx.
 *
 * A translation and a drafting run the host holds, drawn by panes that are destroyed and
 * drawn again ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 * Destroyed, a pane that held its own run stopped it, so a turn carried by hand ended
 * whenever the visitor looked elsewhere. What is held here is that these panes draw a held
 * run rather than their own, that being destroyed stops nothing, and that the pane drawn
 * next shows what the run came to — on the language or the form it is for.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The pane taken off the screen, and the module freed for the next one to be drawn. */
const takeAway = (fixture: { destroy(): void }): void => {
  fixture.destroy()
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
}

/** A model that waits to be told what to say, and records whether it was told to stop. */
const held = () => {
  const releases: Array<(answer: string) => void> = []
  const cancelled = vi.fn()
  const model = vi.fn<AskModel>(
    (_prompt, turn) =>
      new Promise<string>((resolve) => {
        releases.push(resolve)
        turn.onCancel(cancelled)
      }),
  )
  return { model, cancelled, release: (text: string) => releases.at(-1)?.(text) }
}

const HALF: FormSchema = {
  specVersion: '4',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'canton', type: 'text', label: { $t: 'canton' } },
      { key: 'email', type: 'text', label: { $t: 'email' } },
    ],
  },
  i18n: {
    defaultLocale: 'en',
    messages: { en: { canton: 'Canton', email: 'Email' }, fr: {}, de: {} },
  },
}

const FRENCH = JSON.stringify({
  locale: 'fr',
  defaultLocale: 'en',
  messages: [
    { id: 'canton', source: 'Canton', target: 'Canton' },
    { id: 'email', source: 'Email', target: 'Courriel' },
  ],
})

const translations = (session: ReturnType<typeof createBuilderSession>, ask: AskModel, run?: TranslationRun) =>
  render(FormancyTranslationsPane, {
    inputs: { session, ask, ...(run === undefined ? {} : { run }) } as Record<string, unknown>,
    providers: [provideZonelessChangeDetection()],
  })

/** The pane's own Language select, which chooses the language being translated. */
const language = (): HTMLSelectElement => screen.getByRole('combobox', { name: 'Language' })

describe('a translation the host holds', () => {
  test('outlives the pane that asked, and the pane drawn next opens on its language and reviews it', async () => {
    // As in React: the pane opens on the default language, where no review is drawn, so one
    // that only kept the run would come back to English and show nothing of it.
    const user = userEvent.setup()
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    const { fixture } = await translations(session, slow.model, run)
    await user.selectOptions(language(), 'fr')
    await user.click(await screen.findByRole('button', { name: 'Ask a model for the 2 missing messages' }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    takeAway(fixture)
    expect(slow.cancelled).not.toHaveBeenCalled()
    slow.release(FRENCH)
    await waitFor(() => expect(run.state().proposal).toBeDefined())

    await translations(session, slow.model, run)
    expect(language().value).toBe('fr')
    const review = await screen.findByRole('region', { name: /^Review these translations into fr/ })
    expect(session.revision()).toBe(0)
    await user.click(within(review).getByRole('button', { name: 'Apply these translations' }))
    expect(session.document().i18n?.messages['fr']).toEqual({ canton: 'Canton', email: 'Courriel' })
  })

  test('a run still waiting is drawn waiting, and Stop there ends it', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    const { fixture } = await translations(session, slow.model, run)
    await user.selectOptions(language(), 'fr')
    await user.click(await screen.findByRole('button', { name: /Ask a model/ }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    takeAway(fixture)
    // Long enough for a run the destroy had stopped to have said so.
    await new Promise((resolve) => setTimeout(resolve, 10))

    await translations(session, slow.model, run)
    await user.click(await screen.findByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(screen.getByRole('status').textContent?.trim()).toBe('Stopped. Nothing was applied.'))
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })

  test('on another language it says where the run is, and offers nothing of it there', async () => {
    // A French review drawn under German would be headed French over a German preview, and
    // its Apply would land French.
    const user = userEvent.setup()
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    await translations(session, slow.model, run)
    await user.selectOptions(language(), 'fr')
    await user.click(await screen.findByRole('button', { name: /Ask a model/ }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    await user.selectOptions(language(), 'de')
    await waitFor(() =>
      expect(screen.getByRole('status').textContent?.trim()).toBe(
        session.text('translate.status.elsewhereAsking', { locale: 'fr' }),
      ),
    )
    expect(screen.queryByRole('button', { name: /Ask a model|Stop/ })).toBeNull()
    expect(slow.cancelled).not.toHaveBeenCalled()

    slow.release(FRENCH)
    await user.selectOptions(language(), 'en')
    await waitFor(() =>
      expect(screen.getByRole('status').textContent?.trim()).toBe(
        session.text('translate.status.elsewhereHeld', { locale: 'fr' }),
      ),
    )
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()

    await user.selectOptions(language(), 'fr')
    await screen.findByRole('region', { name: /^Review these translations into fr/ })
  })

  test('a pane given none still stops its own run when it is destroyed', async () => {
    // 0157 and 0161 unchanged for a host that binds no run.
    const user = userEvent.setup()
    const slow = held()
    const { fixture } = await translations(createBuilderSession(HALF), slow.model)
    await user.selectOptions(language(), 'fr')
    await user.click(await screen.findByRole('button', { name: /Ask a model/ }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    fixture.destroy()

    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })
})

describe('drafts the host holds', () => {
  const FORM: FormSchema = {
    specVersion: '2',
    id: 'leave',
    title: 'Leave',
    model: {
      fields: [
        {
          key: 'kind',
          type: 'radio',
          label: 'Kind',
          options: [
            { value: 'holiday', label: 'Holiday' },
            { value: 'other', label: 'Other' },
          ],
        },
        { key: 'reason', type: 'text', label: 'Reason' },
      ],
    },
    logic: { rules: [{ target: 'reason', kind: 'visible', cel: "kind == 'other'" }] },
  }
  const HOLDS: Scenario = { name: 'other asks why', changes: { kind: 'other' }, valid: true, visible: { reason: true } }
  const ANSWER = JSON.stringify({ scenarios: [HOLDS] })

  const scenarios = (
    session: ReturnType<typeof createBuilderSession>,
    ask: AskModel,
    drafting: DraftRun,
    changed: (next: readonly Scenario[]) => void = () => undefined,
  ) =>
    render(FormancyScenarioPane, {
      inputs: { session, scenarios: [], removable: true, ask, drafting } as Record<string, unknown>,
      on: { scenariosChange: changed },
      providers: [provideZonelessChangeDetection()],
    })

  test('outlive the pane that asked, and the pane drawn next over a new session of the form keeps one', async () => {
    // The playground's shape: Draft pressed, the Schema view looked at, and Build shown again
    // over a new session of the same text.
    const user = userEvent.setup()
    const slow = held()
    const drafting = createDraftRun()
    const changed = vi.fn()
    const { fixture } = await scenarios(createBuilderSession(FORM), slow.model, drafting, changed)
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'Only other asks why.')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    takeAway(fixture)
    expect(slow.cancelled).not.toHaveBeenCalled()
    slow.release(ANSWER)
    await waitFor(() => expect(drafting.state().drafts).toHaveLength(1))

    await scenarios(createBuilderSession(FORM), slow.model, drafting, changed)
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: /What should this form do/ }).value).toBe(
      'Only other asks why.',
    )
    const drafts = await screen.findByRole('list', { name: 'Drafted examples' })
    expect(within(drafts).getByText('Holds against the form as it is.')).toBeTruthy()
    await user.click(within(drafts).getByRole('button', { name: `Keep ${HOLDS.name}` }))
    expect(changed).toHaveBeenCalledWith([HOLDS])
  })

  test('are not drawn over another form', async () => {
    const user = userEvent.setup()
    const drafting = createDraftRun()
    const { fixture } = await scenarios(createBuilderSession(FORM), () => Promise.resolve(ANSWER), drafting)
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'Only other asks why.')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await screen.findByRole('list', { name: 'Drafted examples' })
    takeAway(fixture)

    await scenarios(createBuilderSession({ ...FORM, id: 'expenses' }), () => Promise.resolve(ANSWER), drafting)
    await screen.findByRole('button', { name: 'Draft examples' })
    expect(screen.queryByRole('list', { name: 'Drafted examples' })).toBeNull()
  })

  test('a run still waiting is drawn waiting, and Stop there ends it', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(FORM)
    const slow = held()
    const drafting = createDraftRun()
    const { fixture } = await scenarios(session, slow.model, drafting)
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'anything')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    takeAway(fixture)
    await new Promise((resolve) => setTimeout(resolve, 10))

    await scenarios(session, slow.model, drafting)
    await user.click(await screen.findByRole('button', { name: 'Stop drafting' }))

    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((status) => status.textContent?.trim() === 'Stopped. Nothing was drafted.'),
      ).toBe(true),
    )
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })
})
