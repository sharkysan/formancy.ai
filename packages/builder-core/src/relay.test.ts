import { describe, expect, test, vi } from 'vitest'
import { canonicalize } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { authorForm, createStop, declinedAnswer } from './authoring.js'
import type { AskModel, AuthoringPrompt } from './answers.js'
import { createDraftRun } from './draft-run.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { BUILDER_MESSAGES_FR } from './messages-fr.js'
import { createBuilderText } from './messages.js'
import { MODEL_REQUEST_KINDS } from './model-requests.js'
import type { ModelRequestKind } from './model-requests.js'
import { createPromptRun } from './prompt-run.js'
import { proposalStatus } from './proposal.js'
import { createRelay, relayLeaves, relayMessage } from './relay.js'
import { draftScenarios } from './scenario-drafts.js'
import { createBuilderSession } from './session.js'
import { translateCatalogue, translationStatus } from './translate.js'
import { translationPrompt } from './translate-prompt.js'
import { createTranslationRun } from './translation-run.js'
import type { Relay, RelayTurn } from './relay.js'

/**
 * A person carrying each turn to a model and its answer back.
 *
 * On formancy.ai the site may ask no other site for anything (0154), so its model is a
 * person: the page shows the request, the visitor copies it into their own chat, and
 * pastes the answer back. Everything after the paste is the same run any host's model
 * gets — read, validated, compiled, type-checked, and held for review
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)).
 *
 * What is pinned here is that the relay changes nothing about the run except who
 * answers: the turn on screen is the prompt a host's model would have been sent, and
 * a bad copy costs the person a paste rather than one of the run's attempts.
 */
const CURRENT: FormSchema = {
  specVersion: '2',
  id: 'contact',
  title: 'Contact',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
}

const WITH_PHONE = JSON.stringify({
  ...CURRENT,
  model: { fields: [...CURRENT.model.fields, { key: 'phone', type: 'text', label: 'Phone' }] },
})

/** The turn after `previous`, once the run has asked it. */
const nextTurn = (relay: Relay, previous: RelayTurn | undefined): Promise<RelayTurn> =>
  vi.waitFor(() => {
    const turn = relay.waiting()
    if (turn === undefined || turn === previous) throw new Error('no new turn yet')
    return turn
  })

/** A host's model that records what it was sent and never answers on its own. */
const spyModel = (...answers: string[]) => {
  const prompts: AuthoringPrompt[] = []
  const model: AskModel = (prompt) => {
    prompts.push(prompt)
    const answer = answers[prompts.length - 1]
    return answer === undefined ? new Promise<string>(() => undefined) : Promise.resolve(answer)
  }
  return { model, prompts }
}

describe('the turn a person carries', () => {
  test('is exactly the prompt a host’s model would have been sent', async () => {
    // Otherwise the relay is a second briefing nobody checks against the first: what the
    // visitor carries and what an integrator's model receives would drift apart, and the
    // playground would demonstrate a request no host ever sends.
    const relay = createRelay()
    const spy = spyModel('{}')
    void authorForm(spy.model, 'add a phone number', { current: CURRENT })
    void authorForm(relay.ask, 'add a phone number', { current: CURRENT })

    const first = await nextTurn(relay, undefined)
    expect(first.prompt).toEqual(spy.prompts[0])
    expect(first.followUp).toBeUndefined()

    // And the second turn too, after an answer that failed its check: `{}` is an
    // object, so it is sent, and the schema refuses it.
    expect(relay.answer('{}')).toBe('accepted')
    const second = await nextTurn(relay, first)
    await vi.waitFor(() => expect(spy.prompts).toHaveLength(2))
    expect(second.prompt).toEqual(spy.prompts[1])
    expect(second.followUp).toBe(spy.prompts[1]?.followUp)
    expect(second.followUp).toBeDefined()
  })

  test('is written out as the system briefing, a blank line, and the user message, verbatim', () => {
    // One text to copy, so a person pastes the briefing and the request in one go; a
    // trimmed or re-wrapped copy would be a request the checks were not written against.
    const prompt: AuthoringPrompt = {
      kind: 'authoring',
      system: ' rules \n',
      user: '\nthe form\n',
      attempt: 1,
      limit: 3,
    }

    expect(relayMessage(prompt)).toBe(' rules \n\n\n\nthe form\n')
  })

  test('is the same object until it changes, and a listener hears each change', async () => {
    // `useSyncExternalStore` compares snapshots by identity: a fresh object on every read
    // would re-render the pane for ever. And a pane that was not told would show a turn
    // that had already been answered.
    const relay = createRelay()
    const heard = vi.fn()
    const forget = relay.subscribe(heard)
    expect(relay.waiting()).toBeUndefined()

    const run = authorForm(relay.ask, 'add a phone number', { current: CURRENT })
    const turn = await nextTurn(relay, undefined)
    expect(relay.waiting()).toBe(turn)
    expect(relay.waiting()).toBe(turn)
    expect(heard).toHaveBeenCalledTimes(1)

    relay.answer(WITH_PHONE)
    expect(relay.waiting()).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(2)
    await run

    forget()
    void authorForm(relay.ask, 'again', { current: CURRENT })
    await nextTurn(relay, undefined)
    expect(heard).toHaveBeenCalledTimes(2)
  })
})

describe('an answer pasted back', () => {
  test('that holds a working document ends the run with it, in one attempt', async () => {
    // The relay is a host's model like any other: an answer it is handed goes through the
    // checks, and the run resolves with the document for the review (0109).
    const relay = createRelay()
    const run = authorForm(relay.ask, 'add a phone number', { current: CURRENT })
    await nextTurn(relay, undefined)

    expect(relay.answer(WITH_PHONE)).toBe('accepted')

    const result = await run
    expect(result).toMatchObject({ ok: true, attempts: 1 })
  })

  test('with no JSON object in it is refused before the run sees it, and costs no attempt', async () => {
    // A copy that caught the chat's sentence and not its code block is a mistake of the
    // paste, not of the model. Sent on, it would spend one of three attempts — and a
    // round trip by hand — on telling the model it wrote no JSON when it did.
    const relay = createRelay()
    const run = authorForm(relay.ask, 'add a phone number', { current: CURRENT })
    const turn = await nextTurn(relay, undefined)

    expect(relay.answer('Sure! Here is the updated form with a phone number.')).toBe('no-object')
    expect(relay.waiting()).toBe(turn)

    relay.answer(WITH_PHONE)
    expect(await run).toMatchObject({ ok: true, attempts: 1 })
  })

  test('with no object in it is sent anyway when the person says so, and the model is told', async () => {
    // The person may know better than the pre-check — or want the model to hear that it
    // answered in prose. Either way it is the run's answer then, and the next turn says
    // what was wrong with it.
    const relay = createRelay()
    void authorForm(relay.ask, 'add a phone number', { current: CURRENT })
    const first = await nextTurn(relay, undefined)

    expect(relay.answer('I would add a phone field.', { anyway: true })).toBe('accepted')

    const second = await nextTurn(relay, first)
    expect(second.prompt.attempt).toBe(2)
    expect(second.followUp).toContain('That was not JSON')
  })

  test('that declines ends the run as declined, in one turn', async () => {
    // A decline is an answer, not a bad copy: refusing it as having no form in it would
    // leave a person unable to carry the model's "a form cannot do that" back (0158).
    const relay = createRelay()
    const run = authorForm(relay.ask, 'email me every submission', { current: CURRENT })
    await nextTurn(relay, undefined)

    expect(relay.answer(declinedAnswer('A form cannot send email.'))).toBe('accepted')

    expect(await run).toMatchObject({
      ok: false,
      ended: 'declined',
      reason: 'A form cannot send email.',
      attempts: 1,
    })
    expect(relay.waiting()).toBeUndefined()
  })

  test('when nothing is waiting is refused, and changes nothing', () => {
    // A paste with no run behind it has nothing to answer, and must not be kept for the
    // next run to find.
    const relay = createRelay()

    expect(relay.answer(WITH_PHONE)).toBe('nothing-waiting')
    expect(relay.waiting()).toBeUndefined()
  })
})

describe('a stopped run', () => {
  test('clears the turn, and an answer pasted after it is refused and never proposed', async () => {
    // The hazard SAFETY-ANALYSIS D10 names for a stop, through a person: the visitor stops,
    // the chat answers anyway, and they paste it. Kept, it would be the answer to whatever
    // they ask next.
    const relay = createRelay()
    const stop = createStop()
    const run = authorForm(relay.ask, 'add a phone number', { current: CURRENT, stop })
    await nextTurn(relay, undefined)
    const heard = vi.fn()
    relay.subscribe(heard)

    stop.stop()

    expect(relay.waiting()).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(relay.answer(WITH_PHONE)).toBe('nothing-waiting')
    expect(await run).toMatchObject({ ok: false, ended: 'stopped' })

    // And the next run asks afresh rather than finding that answer waiting.
    const next = authorForm(relay.ask, 'add a phone number', { current: CURRENT })
    const turn = await nextTurn(relay, undefined)
    expect(turn.prompt.attempt).toBe(1)
    relay.answer(WITH_PHONE)
    expect(await next).toMatchObject({ ok: true, attempts: 1 })
  })
})

describe('one turn at a time', () => {
  test('a second run asking while one waits is refused as busy, whichever asks, and the first keeps its turn', async () => {
    /*
     * Queued silently, the second request would wait behind a turn the person may never
     * answer, and an answer pasted for one could be taken as the other's. Refused, the
     * second run ends at once — as busy. It ended as a model that could not be reached,
     * which is untrue: nothing was asked. And its reason was the relay's English, shown
     * under a German or French builder, because a host's reason is shown as written.
     *
     * Both directions, because the playground asks one relay from two panes: a draft
     * asked for while a model's edit waits, and an edit asked for while a draft waits
     * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
     */
    const relay = createRelay()
    const editing = authorForm(relay.ask, 'add a phone number', { current: CURRENT })
    const editTurn = await nextTurn(relay, undefined)

    const drafting = await draftScenarios(relay.ask, CURRENT, 'An email is asked for.')

    expect(drafting).toMatchObject({ ok: false, ended: 'busy', attempts: 1 })
    expect(drafting).not.toHaveProperty('reason')
    expect(relay.waiting()).toBe(editTurn)
    relay.answer(WITH_PHONE)
    expect(await editing).toMatchObject({ ok: true })

    const drafts = draftScenarios(relay.ask, CURRENT, 'An email is asked for.')
    const draftTurn = await nextTurn(relay, editTurn)

    const second = await authorForm(relay.ask, 'add a fax number', { current: CURRENT })

    expect(second).toMatchObject({ ok: false, ended: 'busy', attempts: 1 })
    expect(second).not.toHaveProperty('reason')
    expect(relay.waiting()).toBe(draftTurn)
    relay.answer(JSON.stringify({ scenarios: [{ name: 'Email', changes: { email: 'a@b.ch' }, valid: true }] }))
    expect(await drafts).toMatchObject({ ok: true })
  })

  test('a translation asked while a model’s edit waits is refused as busy, and so is an edit asked while a translation waits', async () => {
    /*
     * The translations pane asks on the same loop, and a host may hand it the relay its
     * prompt pane asks (0161). A translation refused that way ended busy, and its status
     * had no sentence for busy: the part said nothing, and offered Ask again as though the
     * press had been lost. Both directions, and each sentence is the one the prompt pane
     * says, because the two runs met the same relay.
     */
    const worded = {
      ...CURRENT,
      model: { fields: [{ key: 'email', type: 'text', label: { $t: 'email' } }] },
      i18n: { defaultLocale: 'en', messages: { en: { email: 'Email' }, de: {} } },
    } as unknown as FormSchema
    const text = createBuilderText()
    const relay = createRelay()
    const editing = authorForm(relay.ask, 'add a phone number', { current: CURRENT })
    const editTurn = await nextTurn(relay, undefined)

    const translating = await translateCatalogue(relay.ask, worded, 'de')

    expect(translating).toMatchObject({ ok: false, ended: 'busy', attempts: 1 })
    expect(translating).not.toHaveProperty('reason')
    expect(translationStatus({ busy: false, result: translating, proposal: undefined, refusal: undefined }, text)).toBe(
      text('prompt.status.busy'),
    )
    expect(relay.waiting()).toBe(editTurn)
    relay.answer(WITH_PHONE)
    expect(await editing).toMatchObject({ ok: true })

    const translation = translateCatalogue(relay.ask, worded, 'de')
    const translationTurn = await nextTurn(relay, editTurn)

    const second = await authorForm(relay.ask, 'add a fax number', { current: CURRENT })

    expect(second).toMatchObject({ ok: false, ended: 'busy', attempts: 1 })
    expect(second).not.toHaveProperty('reason')
    expect(proposalStatus({ busy: false, result: second, proposal: undefined, refusal: undefined }, text)).toBe(
      text('prompt.status.busy'),
    )
    expect(relay.waiting()).toBe(translationTurn)
    relay.answer(
      JSON.stringify({ locale: 'de', defaultLocale: 'en', messages: [{ id: 'email', source: 'Email', target: 'E-Mail' }] }),
    )
    expect(await translation).toMatchObject({ ok: true })
  })

  test('holds across the three runs a host may hold, whichever waits, with no pane attached to any', async () => {
    /*
     * Held by the host, each run outlives its pane, so a turn can wait for any of the three
     * while the visitor is anywhere — a translation's while they ask for an edit under Fields,
     * a draft's while they ask for French (0164). The relay still carries one turn: the run
     * that asks second ends busy and the one waiting keeps its turn, whichever two they are.
     */
    const worded = {
      ...CURRENT,
      model: { fields: [{ key: 'email', type: 'text', label: { $t: 'email' } }] },
      i18n: { defaultLocale: 'en', messages: { en: { email: 'Email' }, fr: {} } },
    } as unknown as FormSchema
    const session = createBuilderSession(worded)
    const relay = createRelay()
    const prompt = createPromptRun()
    const translation = createTranslationRun()
    const drafts = createDraftRun()
    prompt.instruct('add a phone number')
    drafts.describe('Email is optional.')

    void translation.translate(relay.ask, session, 'fr')
    const waiting = await nextTurn(relay, undefined)

    await prompt.write(relay.ask, session)
    await drafts.draft(relay.ask, session)

    expect(prompt.state().result).toMatchObject({ ok: false, ended: 'busy' })
    expect(drafts.state().result).toMatchObject({ ok: false, ended: 'busy' })
    expect(relay.waiting()).toBe(waiting)
    expect(translation.state().busy).toBe(true)

    relay.answer(
      JSON.stringify({ locale: 'fr', defaultLocale: 'en', messages: [{ id: 'email', source: 'Email', target: 'Courriel' }] }),
    )
    await vi.waitFor(() => expect(translation.state().proposal).toBeDefined())

    // And the other way round: a draft waiting refuses a translation.
    void drafts.draft(relay.ask, session)
    const drafting = await nextTurn(relay, waiting)
    translation.discard()
    await translation.translate(relay.ask, session, 'fr')
    expect(translation.state().result).toMatchObject({ ok: false, ended: 'busy' })
    expect(relay.waiting()).toBe(drafting)
  })
})

/**
 * What the pane says leaves with a request, and whether it is true
 * ([0167](../../../docs/decisions/0167-the-relay-says-what-each-request-carries.md)).
 *
 * The pane said one sentence for every request: *"Copy puts the whole request on your
 * clipboard, including the form"*. True of a form's edit, and an overstatement for a
 * translation (0161) and a request for examples (0162), which each carry part of the form
 * and never its rules. Now each kind of request has its own sentence. A sentence about what
 * leaves the page that is wrong in either direction is one this repository will not make.
 *
 * **What is checked, and what is read.** Each kind's case lists the claims its sentence
 * makes and checks every one against the request its run actually builds — never against
 * the words. The words are pinned beside that list, in English, German and French, which
 * is the only tie between the two: nothing here parses a sentence. Reworded in any
 * language, a sentence fails the case that lists its claims, and whoever reworded it has
 * to read that list again against the new words, and change the list, the words or the
 * request until all three agree.
 */
describe('what the pane says leaves with a request', () => {
  /**
   * A form whose rules can each be found if they leak: a condition with a quote in it,
   * which JSON escapes, a check's name and a validation's code, all used nowhere else.
   */
  const STAY = {
    specVersion: '4',
    id: 'stay',
    title: 'Your stay',
    model: {
      fields: [
        {
          key: 'country',
          type: 'select',
          label: { $t: 'country' },
          options: [
            { value: 'CH', label: { $t: 'country.CH' } },
            { value: 'DE', label: { $t: 'country.DE' } },
          ],
        },
        { key: 'canton', type: 'text', label: { $t: 'canton' } },
      ],
    },
    logic: {
      rules: [
        { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
        { target: 'canton', kind: 'validate', cel: 'size(canton) > 1', code: 'cantonTooShort' },
        { target: 'canton', kind: 'check', check: 'cantonIsRegistered' },
      ],
    },
    i18n: {
      defaultLocale: 'en',
      messages: {
        en: {
          country: 'Country of residence',
          'country.CH': 'Switzerland',
          'country.DE': 'Germany',
          canton: 'Canton of residence',
        },
        de: { country: 'Wohnsitzland' },
      },
    },
  } as unknown as FormSchema
  const RULES = STAY.logic?.rules ?? []
  /** What a rule says, as written and as JSON writes it inside a string. */
  const spellings = (words: string): string[] => [words, JSON.stringify(words).slice(1, -1)]
  /** Every condition and check name, in either spelling: what "none of its rules" excludes. */
  const RULE_WORDS = RULES.flatMap((rule) => [rule.cel, rule.check])
    .filter((words): words is string => words !== undefined)
    .flatMap(spellings)
  /** The words the form says in its own language, read from its catalogue. */
  const WORDS = Object.values(STAY.i18n?.messages['en'] ?? {})

  /** The turn a run hands the relay, as a pane shows it; the run is then declined to an end. */
  async function turnOf(run: (ask: AskModel) => Promise<unknown>): Promise<RelayTurn> {
    const relay = createRelay()
    const ran = run(relay.ask)
    const turn = await nextTurn(relay, undefined)
    relay.answer(declinedAnswer('Only looked at.'))
    await ran
    return turn
  }

  const LANGUAGES = [
    createBuilderText(),
    createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE }),
    createBuilderText({ locale: 'fr', messages: BUILDER_MESSAGES_FR }),
  ]
  /** A kind's sentence in English, German and French, as the pane draws it. */
  const sentences = (kind: ModelRequestKind): string[] => LANGUAGES.map((text) => relayLeaves(kind, text))

  test.each(LANGUAGES.map((text) => [text('relay.title'), text] as const))(
    'is a sentence of its own for each kind of request, in “%s”',
    (_, text) => {
      // One sentence for two kinds is the defect this replaces: whichever kind it was written
      // for, it is wrong about the other. And a German or French sentence that is the English
      // one is a person told what leaves in a language they did not choose.
      const english = createBuilderText()
      const said = MODEL_REQUEST_KINDS.map((kind) => relayLeaves(kind, text))
      expect(new Set(said).size).toBe(MODEL_REQUEST_KINDS.length)
      for (const sentence of said) {
        expect(sentence.trim()).not.toBe('')
        expect(sentence).not.toMatch(/[{}]/)
      }
      if (text('relay.title') !== english('relay.title')) {
        const inEnglish = MODEL_REQUEST_KINDS.map((kind) => relayLeaves(kind, english))
        expect(said.filter((sentence, index) => sentence === inEnglish[index])).toEqual([])
      }
    },
  )

  /** What the pane says leaves with an edit — the claims the next two cases check. */
  const AUTHORING = [
    'This pane sends the request nowhere. Besides what the model is told about the format, the request carries your description and, when it changes a form, that whole form, its rules included. What you copy goes on your clipboard, and pasting it into a chat gives it to that service under your own account.',
    'Dieser Bereich sendet die Anfrage nirgendwohin. Außer dem, was dem Modell über das Format gesagt wird, enthält die Anfrage deine Beschreibung und, wenn sie ein Formular ändert, das ganze Formular samt seinen Regeln. Was du kopierst, landet in deiner Zwischenablage; fügst du es in einen Chat ein, gibst du es diesem Dienst unter deinem eigenen Konto.',
    'Ce panneau n’envoie la demande nulle part. Outre ce que le modèle apprend du format, la demande contient votre description et, si elle modifie un formulaire, tout ce formulaire, règles comprises. Ce que vous copiez va dans votre presse-papiers ; le coller dans une conversation le confie à ce service, sous votre propre compte.',
  ]

  test('for a form’s edit, the person’s words and the whole form, its rules included — and that is what it carries', async () => {
    // The request is the whole document. A sentence that said less would have the person
    // hand a chat the form's rules, its translations and every option believing otherwise.
    // The sentence is pinned: reworded, it fails here, beside the list it is read against.
    expect(sentences('authoring')).toEqual(AUTHORING)
    const turn = await turnOf((ask) => authorForm(ask, 'Ask for a postcode too.', { current: STAY }))

    expect(turn.prompt.kind).toBe('authoring')
    expect(turn.message).toContain('Ask for a postcode too.')
    expect(turn.message).toContain(canonicalize(STAY))
    // Which holds every rule, as the document's JSON writes it.
    const ruled = RULES.flatMap((rule) => [rule.cel, rule.check, rule.code])
      .filter((words): words is string => words !== undefined)
      .map((words) => JSON.stringify(words).slice(1, -1))
    expect(ruled.filter((words) => !turn.message.includes(words))).toEqual([])
  })

  test('for a form written from nothing, the person’s words alone — the form only “when it changes one”', async () => {
    // With no form to change there is none to send, and a sentence that named one would
    // overstate. The request's own part is then exactly what was typed.
    expect(sentences('authoring')).toEqual(AUTHORING)
    const turn = await turnOf((ask) => authorForm(ask, 'A contact form.'))

    expect(turn.prompt.kind).toBe('authoring')
    expect(turn.prompt.user).toBe('A contact form.')
  })

  /** What the pane says leaves with a translation — the claims the next case checks. */
  const TRANSLATION = [
    'This pane sends the request nowhere. Besides what the model is told about the format, the request carries the messages this language is missing, where the form uses each, and the form’s translations into this language so far, but none of its rules. What you copy goes on your clipboard, and pasting it into a chat gives it to that service under your own account.',
    'Dieser Bereich sendet die Anfrage nirgendwohin. Außer dem, was dem Modell über das Format gesagt wird, enthält die Anfrage die Meldungen, die dieser Sprache fehlen, wo das Formular jede davon verwendet, und seine bisherigen Übersetzungen in diese Sprache, aber keine seiner Regeln. Was du kopierst, landet in deiner Zwischenablage; fügst du es in einen Chat ein, gibst du es diesem Dienst unter deinem eigenen Konto.',
    'Ce panneau n’envoie la demande nulle part. Outre ce que le modèle apprend du format, la demande contient les messages qui manquent à cette langue, l’endroit où le formulaire utilise chacun et ses traductions existantes dans cette langue, mais aucune de ses règles. Ce que vous copiez va dans votre presse-papiers ; le coller dans une conversation le confie à ce service, sous votre propre compte.',
  ]

  test('for a translation, the missing messages, where each is used and the translations so far, and none of the rules — and that is what it carries', async () => {
    // Said of the whole form, as it was, it overstated (0161); said of less than this, it
    // would understate. Each claim is read off the request the run sent; the sentence that
    // makes them is pinned, so a sentence reworded fails here, beside this list.
    expect(sentences('translation')).toEqual(TRANSLATION)
    const turn = await turnOf((ask) => translateCatalogue(ask, STAY, 'de'))
    const asked = translationPrompt(STAY, 'de')

    expect(turn.prompt.kind).toBe('translation')
    expect(asked.rows.length).toBeGreaterThan(0)
    for (const row of asked.rows) {
      expect(turn.message).toContain(JSON.stringify(row.source))
      expect(turn.message).toContain(JSON.stringify(row.context))
    }
    for (const done of Object.values(STAY.i18n?.messages['de'] ?? {})) expect(turn.message).toContain(done)
    expect(RULE_WORDS.filter((words) => turn.message.includes(words))).toEqual([])
    expect(turn.message).not.toContain('cantonTooShort')
    expect(turn.message).not.toContain(canonicalize(STAY))
  })

  /** What the pane says leaves with a request for examples — the claims the next case checks. */
  const SCENARIOS = [
    'This pane sends the request nowhere. Besides what the model is told about the format, the request carries the form’s title, its fields with their labels and options, the error codes it can report, the answers examples start from, the names of its examples and what you said it should do, but none of its rules. What you copy goes on your clipboard, and pasting it into a chat gives it to that service under your own account.',
    'Dieser Bereich sendet die Anfrage nirgendwohin. Außer dem, was dem Modell über das Format gesagt wird, enthält die Anfrage den Titel des Formulars, seine Felder mit ihren Beschriftungen und Optionen, die Fehlercodes, die es melden kann, die Antworten, von denen die Beispiele ausgehen, die Namen seiner Beispiele und was es laut dir tun soll, aber keine seiner Regeln. Was du kopierst, landet in deiner Zwischenablage; fügst du es in einen Chat ein, gibst du es diesem Dienst unter deinem eigenen Konto.',
    'Ce panneau n’envoie la demande nulle part. Outre ce que le modèle apprend du format, la demande contient le titre du formulaire, ses champs avec leurs libellés et leurs options, les codes d’erreur qu’il peut signaler, les réponses dont partent les exemples, les noms de ses exemples et ce que vous avez dit qu’il doit faire, mais aucune de ses règles. Ce que vous copiez va dans votre presse-papiers ; le coller dans une conversation le confie à ce service, sous votre propre compte.',
  ]

  test('for examples, the title, the fields with labels and options, the codes, the start, the names and the words, and none of the rules — and that is what it carries', async () => {
    // The drafting part says the request never carries a rule (0162); the relay pane, said
    // of the whole form, contradicted it beside it. Each claim is read off the request; the
    // sentence that makes them is pinned, so a sentence reworded fails here, beside this list.
    expect(sentences('scenarios')).toEqual(SCENARIOS)
    const existing = [{ name: 'Germany asks for no canton', changes: { country: 'DE' }, valid: true }]
    const start = { country: 'DE' }
    const turn = await turnOf((ask) =>
      draftScenarios(ask, STAY, 'Only Switzerland asks for a canton.', { initialValue: start, existing }),
    )

    expect(turn.prompt.kind).toBe('scenarios')
    for (const words of [STAY.title, ...WORDS, 'cantonTooShort', existing[0]!.name, JSON.stringify(start)]) {
      expect(turn.message).toContain(words)
    }
    expect(turn.message).toContain('Only Switzerland asks for a canton.')
    expect(RULE_WORDS.filter((words) => turn.message.includes(words))).toEqual([])
    expect(turn.message).not.toContain(canonicalize(STAY))
  })
})
