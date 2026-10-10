import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession, createDraftRun, createTranslationRun } from '@formancy/builder-core'
import type { AskModel } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { ScenarioPane } from './scenario-pane.js'
import { TranslationsPane } from './translations-pane.js'

/**
 * A translation and a drafting run the host holds, drawn by panes that come and go
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 *
 * The prompt pane's run could be the host's since 0163; the translations pane's review and
 * the scenario pane's drafting still held their own and stopped them when they went — so a
 * turn carried by hand ended whenever the visitor looked elsewhere while their chat answered.
 * What the holders decide is `@formancy/builder-core`'s and tested there; what is held here
 * is that these panes draw a held run rather than their own, that going stops nothing, and
 * that the pane drawn next shows what the run came to — on the language or the form it is for.
 * `packages/builder-angular/src/held-runs.test.ts` makes the same assertions.
 */
afterEach(cleanup)

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

const ITALIAN = JSON.stringify({
  locale: 'it',
  defaultLocale: 'en',
  messages: [
    { id: 'canton', source: 'Canton', target: 'Cantone' },
    { id: 'email', source: 'Email', target: 'E-mail' },
  ],
})

/** The pane's own Language select, which chooses the language being translated. */
const language = (): HTMLSelectElement => screen.getByRole('combobox', { name: 'Language' })

describe('a translation the host holds', () => {
  test('outlives the pane that asked, and the pane drawn next opens on its language and reviews it', async () => {
    /*
     * The defect: French asked for, the tab left while the chat answered, and the turn gone
     * with the pane. And the pane opens on the default language, where no review is drawn —
     * so one that only kept the run would come back to English and show nothing of it.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    const { unmount } = render(<TranslationsPane session={session} ask={slow.model} run={run} />)
    await user.selectOptions(language(), 'fr')
    await user.click(screen.getByRole('button', { name: 'Ask a model for the 2 missing messages' }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    unmount()
    expect(slow.cancelled).not.toHaveBeenCalled()
    slow.release(FRENCH)
    await waitFor(() => expect(run.state().proposal).toBeDefined())

    render(<TranslationsPane session={session} ask={slow.model} run={run} />)
    expect(language().value).toBe('fr')
    const review = screen.getByRole('region', { name: /^Review these translations into fr/ })
    expect(session.revision()).toBe(0)
    await user.click(within(review).getByRole('button', { name: 'Apply these translations' }))
    expect(session.document().i18n?.messages['fr']).toEqual({ canton: 'Canton', email: 'Courriel' })
  })

  test('a run still waiting is drawn waiting, and Stop there ends it', async () => {
    // The pane drawn next has the Stop now: one that drew the run idle would offer Ask over a
    // turn still with the person, and could not stop it.
    const user = userEvent.setup()
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    const { unmount } = render(<TranslationsPane session={session} ask={slow.model} run={run} />)
    await user.selectOptions(language(), 'fr')
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))
    unmount()
    // Long enough for a run the unmount had stopped to have said so.
    await new Promise((resolve) => setTimeout(resolve, 10))

    render(<TranslationsPane session={session} ask={slow.model} run={run} />)
    await user.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Stopped. Nothing was applied.'))
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })

  test('on another language it says where the run is, and offers nothing of it there', async () => {
    /*
     * A French review drawn under German would be headed French over a German preview, and
     * its Apply would land French. So under any other language — the default too — the pane
     * says where the run waits, and draws no review, no Stop and no Ask to replace it.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    render(<TranslationsPane session={session} ask={slow.model} run={run} />)
    await user.selectOptions(language(), 'fr')
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))

    await user.selectOptions(language(), 'de')
    expect(screen.getByRole('status').textContent).toBe(
      session.text('translate.status.elsewhereAsking', { locale: 'fr' }),
    )
    expect(screen.queryByRole('button', { name: /Ask a model|Stop/ })).toBeNull()
    expect(slow.cancelled).not.toHaveBeenCalled()

    slow.release(FRENCH)
    await user.selectOptions(language(), 'en')
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        session.text('translate.status.elsewhereHeld', { locale: 'fr' }),
      ),
    )
    expect(screen.queryByRole('region', { name: /^Review these translations/ })).toBeNull()

    await user.selectOptions(language(), 'fr')
    expect(screen.getByRole('region', { name: /^Review these translations into fr/ })).toBeTruthy()
  })

  test('whose language has left the form can be stopped, or discarded, from every language', async () => {
    /*
     * The pane draws only the languages the form has, and falls back to the default when the
     * one chosen goes. A run for Italian, asked and then undone with the language, was drawn
     * nowhere as itself: every language said "choose it", none offered Stop or Discard, and
     * the model was never told to stop. A part given no run cannot get here — keyed by the
     * language, it stops its own when the language goes.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    render(<TranslationsPane session={session} ask={slow.model} run={run} />)
    const adding = async (): Promise<void> => {
      await user.type(screen.getByRole('textbox', { name: 'New language' }), 'it')
      await user.click(screen.getByRole('button', { name: 'Add language' }))
    }
    await adding()
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    act(() => void session.undo())
    expect(language().value).toBe('en')
    const asking = session.text('translate.status.goneAsking', { locale: 'it' })
    expect(screen.getByRole('status').textContent).toBe(asking)
    await user.selectOptions(language(), 'fr')
    expect(screen.getByRole('status').textContent).toBe(asking)
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    // Over, it is drawn as nothing, and French can ask.
    await screen.findByRole('button', { name: 'Ask a model for the 2 missing messages' })

    // Added again it is Italian's, asked and answered there; undone once more, its review is
    // offered Discard rather than "choose it".
    await adding()
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))
    slow.release(ITALIAN)
    await screen.findByRole('region', { name: /^Review these translations into it/ })
    act(() => void session.undo())
    const holding = session.text('translate.status.goneHeld', { locale: 'it' })
    expect(screen.getByRole('status').textContent).toBe(holding)
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(run.state()).toMatchObject({ locale: undefined, proposal: undefined })
    expect(screen.queryByText(holding)).toBeNull()
  })

  test('a pane given none still stops its own run when it goes', async () => {
    // 0157 and 0161 unchanged for a host that gives no run: a part nobody can see does not
    // keep a request running for an answer nothing will show.
    const user = userEvent.setup()
    const slow = held()
    const { unmount } = render(<TranslationsPane session={createBuilderSession(HALF)} ask={slow.model} />)
    await user.selectOptions(language(), 'fr')
    await user.click(screen.getByRole('button', { name: /Ask a model/ }))

    unmount()

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

  test('outlive the pane that asked, and the pane drawn next over a new session of the form keeps one', async () => {
    /*
     * The defect, in the playground's shape: Draft pressed, the Schema view looked at while
     * the chat answered, and Build shown again — over a new session of the same text. Tagged
     * with the session, the drafts were dropped on the way back even when the run survived.
     */
    const user = userEvent.setup()
    const slow = held()
    const drafting = createDraftRun()
    const onChange = vi.fn()
    const { unmount } = render(
      <ScenarioPane session={createBuilderSession(FORM)} scenarios={[]} onChange={onChange} ask={slow.model} drafting={drafting} />,
    )
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'Only other asks why.')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    unmount()
    expect(slow.cancelled).not.toHaveBeenCalled()
    slow.release(ANSWER)
    await waitFor(() => expect(drafting.state().drafts).toHaveLength(1))

    render(
      <ScenarioPane session={createBuilderSession(FORM)} scenarios={[]} onChange={onChange} ask={slow.model} drafting={drafting} />,
    )
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: /What should this form do/ }).value).toBe(
      'Only other asks why.',
    )
    const drafts = screen.getByRole('list', { name: 'Drafted examples' })
    expect(within(drafts).getByText('Holds against the form as it is.')).toBeTruthy()
    await user.click(within(drafts).getByRole('button', { name: `Keep ${HOLDS.name}` }))
    expect(onChange).toHaveBeenCalledWith([HOLDS])
  })

  test('are not drawn over another form', async () => {
    // Another form's list is not the place for these drafts: Keep would add them to it.
    const user = userEvent.setup()
    const drafting = createDraftRun()
    const { unmount } = render(
      <ScenarioPane
        session={createBuilderSession(FORM)}
        scenarios={[]}
        onChange={() => undefined}
        ask={() => Promise.resolve(ANSWER)}
        drafting={drafting}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'Only other asks why.')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await screen.findByRole('list', { name: 'Drafted examples' })
    unmount()

    render(
      <ScenarioPane
        session={createBuilderSession({ ...FORM, id: 'expenses' })}
        scenarios={[]}
        onChange={() => undefined}
        ask={() => Promise.resolve(ANSWER)}
        drafting={drafting}
      />,
    )
    expect(screen.queryByRole('list', { name: 'Drafted examples' })).toBeNull()
  })

  test('a run still waiting is drawn waiting, and Stop there ends it', async () => {
    // The pane drawn next has the Stop now: one that drew the run idle would offer Draft over
    // a turn still with the person, and could not stop it.
    const user = userEvent.setup()
    const session = createBuilderSession(FORM)
    const slow = held()
    const drafting = createDraftRun()
    const { unmount } = render(
      <ScenarioPane session={session} scenarios={[]} onChange={() => undefined} ask={slow.model} drafting={drafting} />,
    )
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'anything')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 10))

    render(<ScenarioPane session={session} scenarios={[]} onChange={() => undefined} ask={slow.model} drafting={drafting} />)
    await user.click(screen.getByRole('button', { name: 'Stop drafting' }))

    const statuses = await screen.findAllByRole('status')
    await waitFor(() =>
      expect(statuses.some((status) => status.textContent === 'Stopped. Nothing was drafted.')).toBe(true),
    )
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })
})
