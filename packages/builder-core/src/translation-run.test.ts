import { describe, expect, test, vi } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import type { AskModel } from './answers.js'
import { createBuilderText } from './messages.js'
import { createRelay } from './relay.js'
import { createBuilderSession } from './session.js'
import { translationStatus } from './translate.js'
import { createTranslationRun, translationOn } from './translation-run.js'

/**
 * A translation's run, held where the host chooses
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 *
 * The run belonged to the translations pane's review part, which is keyed by the language
 * and taken away with the tab: a visitor who asked for the French, then looked at the form or
 * the JSON while their chat answered, came back to nothing — the turn stopped, the relay's
 * request cleared, the answer pasted afterwards with nowhere to go. 0163 fixed that for the
 * prompt pane and left this one, because a translation is a run *for a language*, and the
 * pane opens on the default one. What is pinned here is the holder: the run, its stop, the
 * language it was asked for, the proposal and the basis *Translate the rest* builds on — and
 * that a pane drawn on another language is told where the run is rather than shown it.
 */
const HALF: FormSchema = {
  specVersion: '4',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'canton', type: 'text', label: { $t: 'canton' } },
      { key: 'email', type: 'text', label: { $t: 'email' } },
      { key: 'phone', type: 'text', label: { $t: 'phone' } },
    ],
  },
  i18n: {
    defaultLocale: 'en',
    messages: {
      en: { canton: 'Canton', email: 'Email', phone: 'Phone' },
      fr: {},
      de: {},
    },
  },
}

const SOURCES = HALF.i18n!.messages['en']!

/** A catalogue file for `locale`, as a model writes one. */
const answer = (targets: Readonly<Record<string, string>>, locale = 'fr'): string =>
  JSON.stringify({
    locale,
    defaultLocale: 'en',
    messages: Object.entries(targets).map(([id, target]) => ({ id, source: SOURCES[id], target })),
  })

const FRENCH = { canton: 'Canton', email: 'Courriel', phone: 'Téléphone' }

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
  return {
    model,
    cancelled,
    release: (text: string, turn = releases.length - 1) => releases[turn]?.(text),
  }
}

/** Everything settled has run its callbacks: an answer that should be ignored has had every chance to land. */
const ticks = async (count = 20): Promise<void> => {
  for (let tick = 0; tick < count; tick += 1) await Promise.resolve()
}

/** A pane, as the holder sees one: something that subscribes, and reads the state when told. */
const attach = (run: ReturnType<typeof createTranslationRun>) => {
  const heard = vi.fn(() => run.state())
  const detach = run.subscribe(heard)
  return { heard, detach }
}

describe('a translation held by the host', () => {
  test('outlives the part that asked, and its proposal reaches the next part that attaches', async () => {
    /*
     * The defect. A visitor asks for the French, carries the request to their chat, and looks
     * at the form while it answers: the part goes, and with a run that was the part's, the
     * turn went with it. Held here, nothing about a part going reaches the run — the model is
     * not told to stop — and the answer is held, with its language, for the part drawn next.
     */
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    const first = attach(run)

    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    expect(run.state()).toMatchObject({ locale: 'fr', busy: true })
    first.detach()

    slow.release(answer(FRENCH))
    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    expect(slow.cancelled).not.toHaveBeenCalled()

    attach(run)
    expect(run.state().locale).toBe('fr')
    expect(run.state().proposal?.rows.map((row) => row.now)).toEqual(['Canton', 'Courriel', 'Téléphone'])
    expect(session.revision()).toBe(0)

    expect(run.apply(session)?.ok).toBe(true)
    expect(session.document().i18n?.messages['fr']).toEqual(FRENCH)
    // Applied, it holds nothing, and no language either: a part opens where it likes again.
    expect(run.state()).toMatchObject({ locale: undefined, busy: false, proposal: undefined, result: undefined })
  })

  test('through a relay, keeps its turn waiting while no part is attached', async () => {
    // The playground's case: the relay pane above the tabs shows the turn, and the answer
    // pasted there — under Fields, after the Schema view, in the other builder — is the
    // translation's answer.
    const session = createBuilderSession(HALF)
    const relay = createRelay()
    const run = createTranslationRun()
    const part = attach(run)

    void run.translate(relay.ask, session, 'fr')
    await vi.waitFor(() => expect(relay.waiting()).toBeDefined())
    part.detach()

    expect(relay.waiting()?.prompt.user).toContain('"locale": "fr"')
    expect(relay.answer(answer(FRENCH))).toBe('accepted')
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())
  })

  test('is stopped by Stop from any part showing it, and its late answer is never held', async () => {
    // Two parts on one run — one in each builder — press the same stop. A Stop that ended
    // only the run of the part it was drawn in would leave the other waiting, and the
    // relay's turn with it.
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    const react = attach(run)
    const angular = attach(run)

    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    run.stop()

    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    expect(run.state().result).toMatchObject({ ok: false, ended: 'stopped' })
    expect(react.heard.mock.results.at(-1)?.value).toBe(run.state())
    expect(angular.heard.mock.results.at(-1)?.value).toBe(run.state())

    slow.release(answer(FRENCH))
    await ticks()
    expect(run.state().proposal).toBeUndefined()
  })

  test('an answer to a stopped run, arriving while the next one waits, is not taken for its answer', async () => {
    // SAFETY-ANALYSIS D10's variant, for a translation: stopped, asked again, and the first
    // model answers late. One stop for the holder's life would end the second run before it
    // asked; whichever answer came first would be reviewed as the second's.
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()

    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    run.stop()
    await vi.waitFor(() => expect(run.state().busy).toBe(false))

    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(2))
    slow.release(answer({ email: 'Mél' }), 0)
    await ticks()
    expect(run.state()).toMatchObject({ busy: true, proposal: undefined })

    slow.release(answer({ email: 'Courriel' }), 1)
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())
    expect(run.state().proposal?.rows.map((row) => row.now)).toEqual(['Courriel'])
  })

  test('asks for the rest over the proposal it holds, after a part has gone and another come', async () => {
    /*
     * *Translate the rest* builds on the proposal under review: asked over its document,
     * written over it, held against its basis, so the two land together. The part that drew
     * the first answer may be gone by then; the basis must not have gone with it, or the
     * rest would be asked over the form as it is and land without the first half.
     */
    const session = createBuilderSession(HALF)
    const asked: string[] = []
    const answers = [answer({ email: 'Courriel' }), answer({ canton: 'Canton', phone: 'Téléphone' })]
    const model: AskModel = (prompt) => {
      asked.push(prompt.user)
      return Promise.resolve(answers[asked.length - 1]!)
    }
    const run = createTranslationRun()
    const first = attach(run)
    await run.translate(model, session, 'fr')
    expect(run.state().proposal?.stillMissing).toEqual(['canton', 'phone'])
    first.detach()

    attach(run)
    await run.rest(model, session)

    expect(asked[1]).toContain('"id": "canton"')
    expect(asked[1]).not.toContain('"id": "email"')
    expect(run.state().proposal?.rows.map((row) => row.id)).toEqual(['email', 'canton', 'phone'])
    expect(run.apply(session)?.ok).toBe(true)
    expect(session.document().i18n?.messages['fr']).toEqual(FRENCH)
    // One step for both halves.
    session.undo()
    expect(session.document()).toEqual(HALF)
  })

  test('applies nothing while the rest waits, so the rest is held for its language when it comes', async () => {
    /*
     * The first answer stays on screen while *Translate the rest* waits. Applied then, it
     * would land, forget the language with it and draw no part busy — and the rest, answering
     * afterwards, would be held for no language, so every language would be handed a French
     * review. The panes disable Apply while a run waits; the holder must not need them to.
     */
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    slow.release(answer({ email: 'Courriel' }))
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())

    void run.rest(slow.model, session)
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(2))

    expect(run.apply(session)).toBeUndefined()
    expect(session.revision()).toBe(0)
    expect(run.state()).toMatchObject({ locale: 'fr', busy: true })

    slow.release(answer({ canton: 'Canton', phone: 'Téléphone' }))
    await vi.waitFor(() => expect(run.state().busy).toBe(false))
    expect(run.state().locale).toBe('fr')
    expect(run.state().proposal?.rows.map((row) => row.id)).toEqual(['email', 'canton', 'phone'])
  })

  test('asks for no rest without a proposal to build on, and nothing at all while a run waits', async () => {
    // A rest with no basis would be a first answer under another name; a second ask while
    // one waits would be two turns for one language, and the relay refuses the second.
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()

    await run.rest(slow.model, session)
    expect(slow.model).not.toHaveBeenCalled()

    void run.translate(slow.model, session, 'fr')
    void run.translate(slow.model, session, 'de')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    await ticks()
    expect(slow.model).toHaveBeenCalledTimes(1)
    expect(run.state().locale).toBe('fr')
  })
})

describe('what the part asks with', () => {
  test('asks as many times as the part was told to', async () => {
    // A host's `attempts` reaches the run through the holder: one that dropped it would ask
    // three times — through a relay, three round trips by hand — after the host said once.
    const model = vi.fn<AskModel>(() => Promise.resolve('not a catalogue'))
    const run = createTranslationRun()

    await run.translate(model, createBuilderSession(HALF), 'fr', { attempts: 1 })

    expect(model).toHaveBeenCalledTimes(1)
    expect(run.state().result).toMatchObject({ ok: false, ended: 'gave-up', attempts: 1 })
  })
})

describe('a translation drawn on another language', () => {
  test('says where it waits, and holds nothing out to review or apply there', async () => {
    /*
     * A translations pane opens on the default language, and a person may choose any other
     * while a French run waits. Drawn there as it is, the French review would be headed
     * French over a preview in German, and Apply under German would land French. So a part
     * on another language is given none of it — only the language it waits under, which the
     * status names.
     */
    const session = createBuilderSession(HALF)
    const text = createBuilderText()
    const slow = held()
    const run = createTranslationRun()
    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    const english = translationOn(run.state(), 'en', session.document())
    expect(english).toEqual({
      busy: false,
      result: undefined,
      proposal: undefined,
      refusal: undefined,
      elsewhere: { locale: 'fr', busy: true, gone: false },
    })
    expect(translationStatus(english, text)).toBe(text('translate.status.elsewhereAsking', { locale: 'fr' }))

    slow.release(answer(FRENCH))
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())
    const german = translationOn(run.state(), 'de', session.document())
    expect(german.proposal).toBeUndefined()
    expect(german.elsewhere).toEqual({ locale: 'fr', busy: false, gone: false })
    expect(translationStatus(german, text)).toBe(text('translate.status.elsewhereHeld', { locale: 'fr' }))

    // Under its own language it is the run as it is.
    expect(translationOn(run.state(), 'fr', session.document())).toMatchObject({ proposal: run.state().proposal, elsewhere: undefined })
  })

  test('whose language has left the form is said so on every language, and found again when it is added', async () => {
    /*
     * A pane draws only the languages the form has, and falls back to the default when the
     * one chosen is gone. A run for Italian, asked and then undone with the language, could
     * be chosen nowhere: every language said "choose it", none offered Stop, and the turn
     * waited for good. A part given no run never gets here — keyed by the language, it
     * stopped its own run when the language went. So the view says the language has gone,
     * and a part offers there what it cannot reach by choosing (both builders' held-runs.test).
     */
    const ITALIAN = { canton: 'Cantone', email: 'E-mail', phone: 'Telefono' }
    const session = createBuilderSession(HALF)
    const text = createBuilderText()
    const slow = held()
    const run = createTranslationRun()
    session.addLocale('it')
    void run.translate(slow.model, session, 'it')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    session.undo()
    for (const locale of ['en', 'fr', 'de']) {
      const there = translationOn(run.state(), locale, session.document())
      expect(there.elsewhere).toEqual({ locale: 'it', busy: true, gone: true })
      expect(translationStatus(there, text)).toBe(text('translate.status.goneAsking', { locale: 'it' }))
    }
    // Nor does a form with no catalogue left at all, the extraction that made it undone too.
    const { i18n: _catalogue, ...bare } = HALF
    expect(translationOn(run.state(), 'en', bare).elsewhere).toEqual({ locale: 'it', busy: true, gone: true })

    // Added again, it can be chosen: followed under its own language, named under the others.
    session.addLocale('it')
    expect(translationOn(run.state(), 'it', session.document())).toMatchObject({ busy: true, elsewhere: undefined })
    expect(translationOn(run.state(), 'en', session.document()).elsewhere).toEqual({
      locale: 'it',
      busy: true,
      gone: false,
    })

    slow.release(answer(ITALIAN, 'it'))
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())
    session.undo()
    const english = translationOn(run.state(), 'en', session.document())
    expect(english).toMatchObject({ proposal: undefined, elsewhere: { locale: 'it', busy: false, gone: true } })
    expect(translationStatus(english, text)).toBe(text('translate.status.goneHeld', { locale: 'it' }))

    // What the held sentence promises: added again, the review is there, and it applies.
    session.addLocale('it')
    expect(translationOn(run.state(), 'it', session.document()).proposal).toBe(run.state().proposal)
    expect(run.apply(session)?.ok).toBe(true)
    expect(session.document().i18n?.messages['it']).toEqual(ITALIAN)
  })

  test('says nothing elsewhere about a run that came to nothing to review, so the language drawn can ask', async () => {
    // A French run that was stopped holds nothing to act on. Drawn under German as waiting
    // there, it would keep a person from asking for German over a run that is over.
    const session = createBuilderSession(HALF)
    const run = createTranslationRun()
    const stopped: AskModel = (_prompt, turn) => new Promise<string>(() => turn.onCancel(() => undefined))
    void run.translate(stopped, session, 'fr')
    run.stop()
    await vi.waitFor(() => expect(run.state().busy).toBe(false))

    expect(translationOn(run.state(), 'de', session.document())).toEqual({
      busy: false,
      result: undefined,
      proposal: undefined,
      refusal: undefined,
      elsewhere: undefined,
    })
  })
})

describe('what a held translation came to', () => {
  test('is kept, with the refusal, when the form moved while it waited', async () => {
    // A run that outlives its part outlives edits made elsewhere: here a person typed the
    // canton's French while the model answered. Apply refuses it (0109), and it stays.
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    slow.release(answer(FRENCH))
    await vi.waitFor(() => expect(run.state().proposal).toBeDefined())

    session.setMessage('fr', 'canton', 'Canton suisse')
    const outcome = run.apply(session)

    expect(outcome?.ok).toBe(false)
    expect(run.state()).toMatchObject({ locale: 'fr', refusal: session.text('proposal.stale') })
    expect(run.state().proposal).toBeDefined()
    expect(session.document().i18n?.messages['fr']).toEqual({ canton: 'Canton suisse' })
  })

  test('is discarded whole, and so is a run still waiting, whose answer is then never held', async () => {
    // A host forgets a translation when it opens another form: the playground does when
    // another demo is chosen. The relay's turn is cleared and nothing later is held.
    const session = createBuilderSession(HALF)
    const slow = held()
    const run = createTranslationRun()
    void run.translate(slow.model, session, 'fr')
    await vi.waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))

    run.discard()

    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    slow.release(answer(FRENCH))
    await ticks()
    expect(run.state()).toEqual({
      locale: undefined,
      busy: false,
      result: undefined,
      proposal: undefined,
      refusal: undefined,
    })
  })

  test('is the same object until it changes, and apply with nothing held does nothing', () => {
    // What React's useSyncExternalStore requires of a snapshot; and a second Apply, or one
    // from a part drawn over a run applied elsewhere, must not count as a revision.
    const session = createBuilderSession(HALF)
    const run = createTranslationRun()
    const before = run.state()
    run.stop()
    run.discard()
    expect(run.state()).toBe(before)
    expect(run.apply(session)).toBeUndefined()
    expect(session.revision()).toBe(0)
  })
})
