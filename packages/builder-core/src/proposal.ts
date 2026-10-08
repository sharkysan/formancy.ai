import { diffSchemas, schemaHash } from '@formancy/spec'
import type { Change, FormSchema } from '@formancy/spec'
import type { BuilderText } from './messages.js'
import type { BuilderSession, CommandOutcome } from './session.js'

/**
 * A model's edit, held still so somebody can look at it.
 *
 * `authorForm` checks an answer as hard as anything here checks anything: it
 * is parsed, validated against the spec's own JSON Schema, compiled by the
 * real engine and every expression type-checked, and the model is told what
 * was wrong and asked again until it works
 * ([0056](../../../docs/decisions/0056-agents-get-the-checks.md)). Then the
 * pane applied it.
 *
 * **Valid is not the same as wanted.** A document passes every one of those
 * checks with the condition inverted that somebody asked to loosen, or with a
 * field renamed whose answers are already in a database. Undo was the answer
 * to that, and undo is the wrong shape: it puts a document back *after* the
 * change has been read, previewed, and in a shared session published by
 * somebody else.
 *
 * So: propose, show what it does, decide. The change list is `diffSchemas`,
 * which is the same function the publish check, draft migration and the
 * consumer CI gate read — one thing decides what changed, rather than a review
 * screen holding a second opinion
 * ([0108](../../../docs/decisions/0108-the-diff-reports-everything-that-changed.md)).
 *
 * Nothing here talks to a model. `authorForm` does that; this takes the
 * document it produced.
 */
export interface EditProposal {
  /**
   * The document this was written against, by hash.
   *
   * A hash rather than `session.revision()`: a revision moves on an
   * undo-then-redo that leaves the document exactly as it was, and refusing a
   * proposal then would refuse one that is still current. What matters is
   * whether the form changed, not how many commands were run.
   */
  readonly basedOn: string
  readonly document: FormSchema
  /** What it does, as the rest of the system would describe it. */
  readonly changes: readonly Change[]
  /**
   * Whether any of it costs the answers already collected.
   *
   * The question a reviewer is actually asking. Derived from the severities
   * rather than stored beside them, so the two cannot disagree.
   */
  readonly costsAnswers: boolean
}

/** Hold a model's answer against the document it was written for. */
export function proposeEdit(current: FormSchema, proposed: FormSchema): EditProposal {
  const changes = diffSchemas(current, proposed)
  return {
    basedOn: schemaHash(current),
    document: proposed,
    changes,
    costsAnswers: changes.some((change) => change.severity !== 'compatible'),
  }
}

/**
 * Put a reviewed proposal into the session, or say why not.
 *
 * Three refusals, and each is a thing that actually happens:
 *
 * **The document moved underneath it.** Between the asking and the pressing,
 * somebody added a field, dragged a page or imported a catalogue — in this tab
 * or, with a shared session, another. A model answers with the WHOLE document
 * rather than a patch, so applying would silently discard that work. Refused
 * rather than merged: there is no three-way merge here and inventing one would
 * be guessing at which edit wins.
 *
 * **It changes nothing.** A model asked to tidy a form up answering with the
 * form it was given. Applying would add an undo step that undoes nothing and
 * tell somebody their instruction worked.
 *
 * **The session refuses it.** `replaceDocument` validates, and the session is
 * the authority; its reason is the one worth reading.
 */
export function applyProposal(session: BuilderSession, proposal: EditProposal): CommandOutcome {
  /*
   * The whole document, so the pointer is the document. Every other refusal
   * here names the thing it refused — a field, a layout node — and neither of
   * these is about a position: one is about the form having moved, the other
   * about the proposal having nothing in it.
   */
  const now = schemaHash(session.document())
  if (now !== proposal.basedOn) {
    return {
      ok: false,
      path: '',
      message: session.text('proposal.stale'),
    }
  }

  if (proposal.changes.length === 0) {
    return { ok: false, path: '', message: session.text('proposal.empty') }
  }

  return session.replaceDocument(proposal.document)
}

/**
 * The one sentence a prompt pane's live region carries.
 *
 * A four-way choice both builders wrote out by hand. The order matters: a
 * refusal outranks a proposal, because it is about the button somebody just
 * pressed. How many goes the model took is said when it took more than one: a
 * model that needed correcting is one to read more carefully, and this is the
 * moment somebody is deciding how closely.
 */
export function proposalStatus(
  state: {
    busy: boolean
    attempts: number | undefined
    failed: boolean
    proposal: EditProposal | undefined
    refusal: string | undefined
  },
  text: BuilderText,
): string {
  if (state.busy) return text('prompt.status.writing')
  if (state.refusal !== undefined) return text('prompt.status.refused', { reason: state.refusal })
  if (state.proposal !== undefined) {
    const count = state.proposal.changes.length
    const costs = state.proposal.costsAnswers
    const attempts = state.attempts ?? 1
    if (attempts > 1) {
      return text(costs ? 'prompt.status.readyAfterCosts' : 'prompt.status.readyAfter', {
        count,
        attempts,
      })
    }
    return text(costs ? 'prompt.status.readyCosts' : 'prompt.status.ready', { count })
  }
  if (state.failed) return text('prompt.status.failed', { count: state.attempts ?? 1 })
  return ''
}
