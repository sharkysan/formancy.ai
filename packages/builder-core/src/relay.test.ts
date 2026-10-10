import { describe, expect, test, vi } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { authorForm, createStop, declinedAnswer } from './authoring.js'
import type { AskModel, AuthoringPrompt } from './answers.js'
import { createBuilderText } from './messages.js'
import { proposalStatus } from './proposal.js'
import { createRelay, relayMessage } from './relay.js'
import { draftScenarios } from './scenario-drafts.js'
import { translateCatalogue, translationStatus } from './translate.js'
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
    const prompt: AuthoringPrompt = { system: ' rules \n', user: '\nthe form\n', attempt: 1, limit: 3 }

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
})
