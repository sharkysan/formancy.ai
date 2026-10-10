import { runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'
import { diffSchemas, schemaHash } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import type { AuthoringResult } from './authoring.js'
import { createBuilderText } from './messages.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { BUILDER_MESSAGES_FR } from './messages-fr.js'
import { applyProposal, proposalHeading, proposalStatus, proposeEdit } from './proposal.js'
import { comparedToLastRun } from './scenario-runs.js'
import { createBuilderSession } from './session.js'
import { base, clone } from './session.test.js'

/**
 * A model's edit, reviewed before it lands.
 *
 * `authorForm` checks an answer thoroughly — parsed, validated against the
 * spec's own schema, compiled by the engine, every expression type-checked —
 * and then the React pane **applied it**. Valid is not the same as wanted. A
 * document can satisfy every one of those checks and still have inverted the
 * condition somebody asked to loosen, or renamed a field whose answers are
 * already in a database, and the first anybody knows is a submission that went
 * somewhere unexpected.
 *
 * So the step this file adds is the one a person does: see what it did, then
 * decide. Undo was the answer before, and undo is the wrong shape here — it
 * puts back a document after the change has been read, reviewed and published
 * by somebody else in another tab.
 *
 * The change list is `diffSchemas`, which is why this comes after
 * [0108](../../../docs/decisions/0108-the-diff-reports-everything-that-changed.md):
 * until that landed the review screen for "the model rewrote your options and
 * three rules" would have been an empty list.
 */
const withPhone = (document: FormSchema): FormSchema => {
  const next = clone(document)
  next.model.fields.push({ key: 'phone', type: 'text', label: 'Phone' })
  return next
}

describe('a proposal', () => {
  test('carries what the model wrote, what it changes, and what it was written against', () => {
    const session = createBuilderSession(base)

    const proposal = proposeEdit(session.document(), withPhone(base))

    expect(proposal.document.model.fields.at(-1)?.key).toBe('phone')
    expect(proposal.changes.map((change) => change.kind)).toEqual(['field.added'])
    // The hash, not the revision. A revision moves on an undo-then-redo that
    // leaves the document exactly as it was, and refusing a proposal then
    // would be refusing one that is still perfectly current.
    expect(proposal.basedOn).toBe(schemaHash(base))
  })

  test('and nothing is applied by making one', () => {
    // The whole point. Before this, the only thing between a model's answer
    // and the document was whether it parsed.
    const session = createBuilderSession(base)

    proposeEdit(session.document(), withPhone(base))

    expect(session.document()).toEqual(base)
    expect(session.revision()).toBe(0)
  })
})

describe('applying one', () => {
  test('puts the document in as a single undoable step', () => {
    const session = createBuilderSession(base)
    const proposal = proposeEdit(session.document(), withPhone(base))

    const outcome = applyProposal(session, proposal)

    expect(outcome.ok).toBe(true)
    expect(session.document().model.fields.at(-1)?.key).toBe('phone')
    expect(session.canUndo()).toBe(true)
    session.undo()
    expect(session.document()).toEqual(base)
  })

  test('is refused when the document moved underneath it', () => {
    /*
     * The failure this exists for. A proposal is computed against a document,
     * and between the asking and the pressing somebody adds a field, drags a
     * page or imports a catalogue — in this tab or, with a shared session, in
     * another. Applying would silently discard that work, because the model
     * answers with the WHOLE document rather than a patch.
     *
     * Refused rather than merged: `@formancy/builder-core` has no three-way
     * merge and inventing one here would be guessing at which edit wins.
     */
    const session = createBuilderSession(base)
    const proposal = proposeEdit(session.document(), withPhone(base))

    session.insertField({ parent: [], index: 0 }, { key: 'reference', type: 'text' })
    const outcome = applyProposal(session, proposal)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).toMatch(/changed since/i)
    // And the edit that was actually made is still there, untouched.
    expect(session.document().model.fields[0]?.key).toBe('reference')
  })

  test('and accepted again once the document is back to what it was written against', () => {
    /*
     * The other half, and why the check is a hash rather than a revision
     * number. Undo puts the document back; the proposal was written against
     * exactly that document and is current again. A revision check would
     * refuse it for having a different number while describing the same form.
     */
    const session = createBuilderSession(base)
    const proposal = proposeEdit(session.document(), withPhone(base))

    session.insertField({ parent: [], index: 0 }, { key: 'reference', type: 'text' })
    session.undo()

    expect(applyProposal(session, proposal).ok).toBe(true)
  })

  test('and a proposal that changes nothing is refused rather than counted as an edit', () => {
    /*
     * A model asked to "tidy this up" answering with the document it was
     * given. Applying it would add an undo step that undoes nothing, and tell
     * somebody their instruction worked.
     */
    const session = createBuilderSession(base)
    const proposal = proposeEdit(session.document(), clone(base))

    expect(proposal.changes).toEqual([])
    const outcome = applyProposal(session, proposal)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).toMatch(/nothing/i)
    expect(session.revision()).toBe(0)
  })

  test('and a document the session itself refuses comes back with the session’s reason', () => {
    // `replaceDocument` validates. A proposal is checked when it is made, but
    // the session is the authority and its refusal is the one worth reading.
    const session = createBuilderSession(base)
    const broken = clone(base)
    broken.model.fields = []
    const proposal = proposeEdit(session.document(), broken)

    const outcome = applyProposal(session, proposal)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message.length).toBeGreaterThan(0)
    expect(session.document()).toEqual(base)
  })
})

describe('what the review shows', () => {
  test('is the same list diffSchemas gives, so one thing decides what changed', () => {
    /*
     * Not a second opinion. The review screen, the publish check, draft
     * migration and the consumer CI gate must agree about what changed
     * between two documents, and the way to guarantee that is for there to be
     * one function rather than four readings.
     */
    const next = clone(base)
    next.model.fields[0]!.fields![0]!.required = false

    const proposal = proposeEdit(base, next)

    expect(proposal.changes).toEqual(diffSchemas(base, next))
    expect(proposal.changes.some((change) => change.kind === 'field.requiredRelaxed')).toBe(true)
  })

  test('and says plainly when an edit costs the answers already collected', () => {
    /*
     * The question a reviewer is actually asking: not "what is different" but
     * "what does this cost me". A removed field and a tightened bound are both
     * lossy, and both are the kind of edit a model makes while doing something
     * else it was asked for.
     */
    const next = clone(base)
    next.model.fields[0]!.fields!.pop()

    const proposal = proposeEdit(base, next)

    expect(proposal.costsAnswers).toBe(true)
    expect(proposeEdit(base, withPhone(base)).costsAnswers).toBe(false)
  })
})

/**
 * A form with one rule somebody could write either way round, and an example of each side.
 *
 * `country == "CH"` and `country != "CH"` both pass every check `authorForm` makes. Only an
 * example with its answer written down tells them apart (0110), and until this change that
 * example ran after Apply, in the scenario panel — so the review a person decided on said
 * nothing about it (0160).
 *
 * `name` is required and no example sets it, so every example needs the sample to start
 * from. Without it each one fails on `required` before and after, and nothing could ever
 * stop holding — which is how an `initialValue` dropped on the way would show up here.
 */
const travel = (canton: string): FormSchema => ({
  specVersion: '1',
  id: 'travel',
  title: 'Travel',
  model: {
    fields: [
      { key: 'name', type: 'text', required: true },
      { key: 'country', type: 'text' },
      { key: 'canton', type: 'text' },
    ],
  },
  logic: { rules: [{ target: 'canton', kind: 'visible', cel: canton }] },
})
const RIGHT = travel('country == "CH"')
const BACKWARDS = travel('country != "CH"')
const SAMPLE = { name: 'Ada' }
const SCENARIOS: readonly Scenario[] = [
  {
    name: 'Switzerland asks for a canton',
    changes: { country: 'CH' },
    valid: true,
    visible: { canton: true },
  },
  { name: 'Germany does not', changes: { country: 'DE' }, valid: true, visible: { canton: false } },
  // About another field: an edit to the canton rule must not name it either way.
  { name: 'a name is needed', changes: { name: '' }, valid: false, errors: { name: ['required'] } },
]
const EXAMPLES = { scenarios: SCENARIOS, initialValue: SAMPLE }

/**
 * The name made optional: a change the diff calls `compatible`, since no answer already
 * collected is lost by it. Every rule change is `lossy`, so this is the edit that stops an
 * example holding without also costing answers.
 */
const nameOptional = (document: FormSchema): FormSchema => {
  const next = clone(document)
  delete next.model.fields[0]!.required
  return next
}

describe('what the form’s examples make of a proposal', () => {
  test('a rule turned the wrong way round names the examples that would stop holding', () => {
    /*
     * The failure this exists for. The inverted rule is valid, compiles and type-checks,
     * so the review showed one changed rule and nothing else — and the person pressed
     * Apply on the strength of it. The examples knew, and said so only afterwards.
     */
    const proposal = proposeEdit(RIGHT, BACKWARDS, EXAMPLES)

    expect(proposal.examples?.regressions).toEqual([
      'Switzerland asks for a canton',
      'Germany does not',
    ])
    expect(proposal.examples?.repaired).toEqual([])
  })

  test('a rule put right names the examples that would hold again', () => {
    // The other direction, so a review is not only ever bad news: somebody asking a model
    // to fix a rule sees, before applying, that the fix is a fix.
    const proposal = proposeEdit(BACKWARDS, RIGHT, EXAMPLES)

    expect(proposal.examples?.repaired).toEqual([
      'Switzerland asks for a canton',
      'Germany does not',
    ])
    expect(proposal.examples?.regressions).toEqual([])
  })

  test('an example already failing is not one this edit would stop', () => {
    /*
     * The form arrived with the rule backwards, and the model was asked for a phone
     * number. Naming the two canton examples as stopping would blame the edit for what it
     * found, and a review that does that on every proposal is a review people stop reading.
     */
    const proposal = proposeEdit(BACKWARDS, withPhone(BACKWARDS), EXAMPLES)

    expect(proposal.examples).toEqual({ regressions: [], repaired: [] })
  })

  test('with no examples there is no verdict, rather than one that says all is well', () => {
    // A form nobody wrote examples for has not passed them. An empty verdict here would
    // read as "nothing stops holding" for a check that never ran.
    expect(proposeEdit(RIGHT, BACKWARDS).examples).toBeUndefined()
  })

  test('and an empty list of examples is no examples, not a verdict that all hold', () => {
    /*
     * What a host passes for a form nobody wrote examples for: the playground hands every
     * such form `[]`. Running none and comparing nothing gives `{ regressions: [],
     * repaired: [] }`, which reads to any caller of `EditProposal` as "nothing stops
     * holding" — the verdict the case above refuses, reached through the other door.
     */
    expect(proposeEdit(RIGHT, BACKWARDS, { scenarios: [] }).examples).toBeUndefined()
    expect(
      proposeEdit(RIGHT, BACKWARDS, { scenarios: [], initialValue: SAMPLE }).examples,
    ).toBeUndefined()
  })

  test('is the scenario panel’s own verdict: runScenarios, then comparedToLastRun', () => {
    /*
     * Not a second opinion. The panel compares the run after an edit with the run before
     * it; a proposal compares the proposed document's run with the current one's, through
     * the same two functions, so the review cannot call something a regression that the
     * panel would not once it is applied. The cases above are literal and this one is the
     * equation, so a change to `comparedToLastRun` reddens those and not this.
     */
    const options = { initialValue: SAMPLE }

    expect(proposeEdit(RIGHT, BACKWARDS, EXAMPLES).examples).toEqual(
      comparedToLastRun(
        runScenarios(RIGHT, SCENARIOS, options),
        runScenarios(BACKWARDS, SCENARIOS, options),
      ),
    )
  })

  test('and applying one that stops an example holding is still the person’s to decide', () => {
    /*
     * Not a refusal. A rule changed on purpose stops its old example holding — the example
     * was written for the rule as it was — and refusing would make the examples a lock on
     * the form rather than a check on it. The review says so; the person decides.
     */
    const session = createBuilderSession(RIGHT)
    const proposal = proposeEdit(session.document(), BACKWARDS, EXAMPLES)

    expect(proposal.examples?.regressions).toHaveLength(2)
    expect(applyProposal(session, proposal).ok).toBe(true)
    expect(session.document()).toEqual(BACKWARDS)
  })

  test('runs the examples in the mode asked for', () => {
    /*
     * A check marked to run on the server is what the publish gate and the submission
     * endpoint run, and not the browser. A proposal adding one that the sample's name
     * fails breaks nothing in the client and every example on the server — and a review
     * that always ran the client would call that edit harmless.
     */
    const strict = clone(RIGHT)
    strict.logic!.rules.push({
      target: 'name',
      kind: 'validate',
      cel: 'size(name) > 3',
      code: 'tooShort',
      runsOn: 'server',
    })

    expect(proposeEdit(RIGHT, strict, EXAMPLES).examples?.regressions).toEqual([])
    expect(proposeEdit(RIGHT, strict, { ...EXAMPLES, mode: 'server' }).examples?.regressions).toEqual(
      SCENARIOS.map(({ name }) => name),
    )
  })
})

describe('what the prompt pane says', () => {
  const english = createBuilderText()
  const idle = {
    busy: false,
    result: undefined,
    proposal: undefined,
    refusal: undefined,
  }
  /** A run's ending, as `authorForm` reports it. */
  const ended = (
    how: Extract<AuthoringResult, { ok: false }>['ended'],
    attempts: number,
    reason?: string,
  ): AuthoringResult => ({
    ok: false,
    attempts,
    problems: [],
    lastAnswer: '',
    ended: how,
    ...(reason === undefined ? {} : { reason }),
  })
  const written = (attempts: number): AuthoringResult => ({
    ok: true,
    document: withPhone(base),
    attempts,
  })

  test('a refusal outranks a proposal, because it is about the button just pressed', () => {
    const proposal = proposeEdit(base, withPhone(base))

    expect(proposalStatus({ ...idle, proposal, refusal: 'The form changed.' }, english)).toBe(
      'Not applied. The form changed.',
    )
  })

  test('counts changes in the language’s plural, which "1 changes, none of which" did not', () => {
    const one = proposeEdit(base, withPhone(base))

    expect(proposalStatus({ ...idle, proposal: one, result: written(1) }, english)).toBe(
      english('prompt.status.ready', { count: 1 }),
    )
    expect(english('prompt.status.ready', { count: 1 })).toContain('1 change, which does not')
  })

  test('says how many goes the model took when it took more than one', () => {
    const proposal = proposeEdit(base, withPhone(base))

    expect(proposalStatus({ ...idle, proposal, result: written(3) }, english)).toContain(
      'after 3 attempts',
    )
  })

  test('and says nothing was applied when every attempt failed', () => {
    expect(proposalStatus({ ...idle, result: ended('gave-up', 2) }, english)).toBe(
      english('prompt.status.failed', { count: 2 }),
    )
    expect(proposalStatus(idle, english)).toBe('')
  })

  test('a model that could not be reached is said to be that, with the host’s reason', () => {
    /*
     * The panes built this failure by hand with `attempts: 0`, and the status
     * read "0 attempts, and the document still did not work" — so a person
     * reworded an instruction that had never reached a model, while the network
     * was down or the key was refused.
     */
    const said = proposalStatus({ ...idle, result: ended('unreachable', 1, 'fetch failed') }, english)

    expect(said).toBe('Nothing was applied. The model could not be reached: fetch failed')
    expect(said).not.toMatch(/attempt|did not work/)
  })

  test('a run the person stopped is said to be stopped, not failed', () => {
    // A stop after two corrections is not a document that failed twice.
    const said = proposalStatus({ ...idle, result: ended('stopped', 2) }, english)

    expect(said).toBe('Stopped. Nothing was applied.')
  })

  test('a model that could not be reached and gave no reason is said without one, in each language', () => {
    // The sentence with a reason, given none, showed its placeholder: "…could not
    // be reached: {reason}", which a person reads as the builder broken.
    const unsaid = { ...idle, result: ended('unreachable', 1) }
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    const french = createBuilderText({ locale: 'fr', messages: BUILDER_MESSAGES_FR })

    expect(proposalStatus(unsaid, english)).toBe(
      'Nothing was applied. The model could not be reached.',
    )
    expect(proposalStatus(unsaid, german)).toBe(
      'Nichts wurde übernommen. Das Modell war nicht erreichbar.',
    )
    expect(proposalStatus(unsaid, french)).toBe(
      'Rien n’a été appliqué. Le modèle n’a pas pu être joint.',
    )
  })

  test('and both are said in the author’s language', () => {
    // The catalogues are complete by type; this is that the status reads them.
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    const french = createBuilderText({ locale: 'fr', messages: BUILDER_MESSAGES_FR })
    const unreachable = { ...idle, result: ended('unreachable', 1, 'fetch failed') }
    const stopped = { ...idle, result: ended('stopped', 1) }

    expect(proposalStatus(unreachable, german)).toBe(
      german('prompt.status.unreachable', { reason: 'fetch failed' }),
    )
    expect(proposalStatus(stopped, german)).toBe(german('prompt.status.stopped'))
    expect(proposalStatus(unreachable, french)).toBe(
      french('prompt.status.unreachable', { reason: 'fetch failed' }),
    )
    expect(proposalStatus(stopped, french)).toBe(french('prompt.status.stopped'))
    expect(german('prompt.status.stopped')).not.toBe(english('prompt.status.stopped'))
    expect(french('prompt.status.stopped')).not.toBe(english('prompt.status.stopped'))
  })

  test('names the examples that would stop holding, and those that would hold again', () => {
    /*
     * The live region is what a screen-reader user hears when the review appears. A
     * regression that only the scenario panel announced, after Apply, is one they learn
     * about once the rule is already in the form.
     */
    const stops = proposeEdit(RIGHT, BACKWARDS, EXAMPLES)
    const mends = proposeEdit(BACKWARDS, RIGHT, EXAMPLES)
    // A rule changed is `lossy` in the diff, so both say it affects answers.
    const ready = english('prompt.status.readyCosts', { count: 1 })

    expect(proposalStatus({ ...idle, proposal: stops, result: written(1) }, english)).toBe(
      `${ready} Would stop holding if applied: Switzerland asks for a canton and Germany does not.`,
    )
    expect(proposalStatus({ ...idle, proposal: mends, result: written(1) }, english)).toBe(
      `${ready} Would hold again if applied: Switzerland asks for a canton and Germany does not.`,
    )
    // And nothing extra when the examples have nothing to say about it.
    expect(
      proposalStatus({ ...idle, proposal: proposeEdit(RIGHT, withPhone(RIGHT), EXAMPLES) }, english),
    ).toBe(english('prompt.status.ready', { count: 1 }))
  })

  test('the review’s heading names what would stop holding, since it names the region', () => {
    /*
     * The heading is the review's accessible name, so it is what somebody hears on
     * arriving at the thing they are deciding about. "Review these changes" over an
     * edit that stops an example holding is the sentence that let one through.
     */
    const stops = proposeEdit(RIGHT, nameOptional(RIGHT), EXAMPLES)

    expect(stops.costsAnswers).toBe(false)
    expect(proposalHeading(stops, english)).toBe(
      'Review these changes — 1 scenario would stop holding: a name is needed',
    )
    expect(proposalHeading(proposeEdit(RIGHT, nameOptional(RIGHT)), english)).toBe(
      'Review these changes',
    )
    // A repair is good news, said in the status; the heading is what to decide on. (Making
    // the name required again is a tightening, so this one costs answers.)
    expect(proposalHeading(proposeEdit(nameOptional(RIGHT), RIGHT, EXAMPLES), english)).toBe(
      english('prompt.review.costs'),
    )
  })

  test('and says both when an edit costs answers and stops an example holding', () => {
    /*
     * The inverted rule, which is both: a rule changed is lossy, and two examples stop
     * holding. A heading chosen from the two that existed would have dropped one of them,
     * and the one it kept would have been the costs — the sentence that was already there
     * and let the inversion through.
     */
    const proposal = proposeEdit(RIGHT, BACKWARDS, EXAMPLES)

    expect(proposalHeading(proposal, english)).toBe(
      'Review these changes — some affect answers already collected, and 2 scenarios would stop holding: Switzerland asks for a canton and Germany does not',
    )
    expect(proposalHeading(proposeEdit(RIGHT, BACKWARDS), english)).toBe(
      english('prompt.review.costs'),
    )
  })

  test('and all of it in the author’s language', () => {
    // The catalogues are complete by type; this is that the review reads them, and that
    // the list is joined the way the language joins one.
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    const french = createBuilderText({ locale: 'fr', messages: BUILDER_MESSAGES_FR })
    const one = proposeEdit(RIGHT, nameOptional(RIGHT), EXAMPLES)
    const both = proposeEdit(RIGHT, BACKWARDS, EXAMPLES)
    const mends = proposeEdit(BACKWARDS, RIGHT, EXAMPLES)

    expect(proposalHeading(one, german)).toBe(
      'Diese Änderungen prüfen – 1 Szenario würde nicht mehr gelten: a name is needed',
    )
    expect(proposalHeading(one, french)).toBe(
      'Examiner ces modifications — 1 scénario ne tiendrait plus\u00a0: a name is needed',
    )
    expect(proposalHeading(both, german)).toBe(
      'Diese Änderungen prüfen – einige betreffen bereits erfasste Antworten, und 2 Szenarien würden nicht mehr gelten: Switzerland asks for a canton und Germany does not',
    )
    expect(proposalHeading(both, french)).toBe(
      'Examiner ces modifications — certaines touchent des réponses déjà recueillies, et 2 scénarios ne tiendraient plus\u00a0: Switzerland asks for a canton et Germany does not',
    )
    expect(proposalStatus({ ...idle, proposal: both }, german)).toContain(
      'Würde bei Übernahme nicht mehr gelten: Switzerland asks for a canton und Germany does not.',
    )
    expect(proposalStatus({ ...idle, proposal: both }, french)).toContain(
      'Ne tiendrait plus une fois appliqué\u00a0: Switzerland asks for a canton et Germany does not.',
    )
    expect(proposalStatus({ ...idle, proposal: mends }, german)).toContain(
      'Würde bei Übernahme wieder gelten: Switzerland asks for a canton und Germany does not.',
    )
    expect(proposalStatus({ ...idle, proposal: mends }, french)).toContain(
      'Tiendrait de nouveau une fois appliqué\u00a0: Switzerland asks for a canton et Germany does not.',
    )
  })

  test('a model that declined is said to have declined, in each language', () => {
    /*
     * Not "the document still did not work", which sends a person to reword an
     * instruction the format cannot satisfy however it is worded. The model's reason
     * is not in the sentence: the pane shows it in place of the problem list, as the
     * model wrote it, and saying it twice would read it twice to a screen reader.
     */
    const declined = { ...idle, result: ended('declined', 1, 'A form cannot send email.') }
    const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
    const french = createBuilderText({ locale: 'fr', messages: BUILDER_MESSAGES_FR })

    expect(proposalStatus(declined, english)).toBe('Nothing was applied. The model declined this request.')
    expect(proposalStatus(declined, german)).toBe(german('prompt.status.declined'))
    expect(proposalStatus(declined, french)).toBe(french('prompt.status.declined'))
    expect(german('prompt.status.declined')).not.toBe(english('prompt.status.declined'))
    expect(french('prompt.status.declined')).not.toBe(english('prompt.status.declined'))
  })
})
