import { diffSchemas, schemaHash } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import type { AuthoringResult } from './authoring.js'
import { createBuilderText } from './messages.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { BUILDER_MESSAGES_FR } from './messages-fr.js'
import { applyProposal, proposalStatus, proposeEdit } from './proposal.js'
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
    how: 'gave-up' | 'stopped' | 'unreachable',
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
})
