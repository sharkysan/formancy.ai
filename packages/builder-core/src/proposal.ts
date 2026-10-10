import { runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'
import { diffSchemas, schemaHash } from '@formancy/spec'
import type { Change, FormSchema } from '@formancy/spec'
import type { AuthoringResult } from './authoring.js'
import type { BuilderText } from './messages.js'
import { comparedToLastRun } from './scenario-runs.js'
import type { ScenarioRunChange } from './scenario-runs.js'
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
  /**
   * What the form's examples make of it: which held against the current document and
   * would not against this one, and which would hold again. Undefined when no examples
   * were given — none passed, or an empty list — which is not the same as none stopping
   * ([0159](../../../docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).
   */
  readonly examples: ScenarioRunChange | undefined
}

/**
 * The form's examples, as a scenario pane takes them: the list, where each one starts,
 * and the engine's mode.
 */
export interface ProposalExamples {
  readonly scenarios: readonly Scenario[]
  /** Where every example starts — the form's sample. */
  readonly initialValue?: Readonly<Record<string, unknown>> | undefined
  /** `client` by default; `server` is what the publish gate and the submission endpoint run. */
  readonly mode?: 'client' | 'server' | undefined
}

/**
 * Hold a model's answer against the document it was written for.
 *
 * **With the form's examples, run against both.** The one check that can tell a working
 * condition from the one that was asked for is an example with its answer written down
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)), and it
 * ran only after Apply, in the scenario panel. An inverted rule passes everything
 * `authorForm` checks, and the review showed one changed rule. Now the examples run
 * against the current document and the proposed one before anything lands, and the
 * proposal says which would stop holding.
 *
 * Through `runScenarios` and `comparedToLastRun`, the two functions the scenario panel
 * runs after an edit: the review cannot call something a regression that the panel would
 * not once it is applied.
 */
export function proposeEdit(
  current: FormSchema,
  proposed: FormSchema,
  examples?: ProposalExamples,
): EditProposal {
  const changes = diffSchemas(current, proposed)
  return {
    basedOn: schemaHash(current),
    document: proposed,
    changes,
    costsAnswers: changes.some((change) => change.severity !== 'compatible'),
    // An empty list is no examples: run, it would compare nothing with nothing and answer
    // the empty verdict, "nothing stops holding", for a check that never ran.
    examples:
      examples === undefined || examples.scenarios.length === 0
        ? undefined
        : againstExamples(current, proposed, examples),
  }
}

/** The examples run against the document as it is, then as it would be. */
function againstExamples(
  current: FormSchema,
  proposed: FormSchema,
  { scenarios, initialValue, mode }: ProposalExamples,
): ScenarioRunChange {
  const options = {
    ...(initialValue === undefined ? {} : { initialValue }),
    ...(mode === undefined ? {} : { mode }),
  }
  return comparedToLastRun(
    runScenarios(current, scenarios, options),
    runScenarios(proposed, scenarios, options),
  )
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
 * The review's heading, which is also its accessible name.
 *
 * What somebody hears on arriving at the thing they are deciding about, so it names the
 * two things worth deciding on: answers already collected, and the examples that would
 * stop holding. A repair is not here — it is good news, and the status says it — because
 * a heading that grew with every outcome would bury the one to act on. Both builders
 * chose between two headings by hand; with a third and a fourth, that choice is decided
 * here once.
 */
export function proposalHeading(proposal: EditProposal, text: BuilderText): string {
  const stops = proposal.examples?.regressions ?? []
  const costs = proposal.costsAnswers
  if (stops.length === 0) return text(costs ? 'prompt.review.costs' : 'prompt.review')
  return text(costs ? 'prompt.review.costsStops' : 'prompt.review.stops', {
    count: stops.length,
    list: text.list(stops),
  })
}

/**
 * The one sentence a prompt pane's live region carries.
 *
 * A choice both builders wrote out by hand. The order matters: a refusal
 * outranks a proposal, because it is about the button somebody just pressed.
 * How many goes the model took is said when it took more than one: a model that
 * needed correcting is one to read more carefully, and this is the moment
 * somebody is deciding how closely.
 *
 * It reads the run's result whole rather than a count and a flag the panes
 * derived from it. A pane that worked out "failed" for itself is how a host's
 * network error came to be announced as "0 attempts, and the document still did
 * not work" ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)).
 */
export function proposalStatus(
  state: {
    busy: boolean
    /** What the last run came to, until something moves on from it. */
    result: AuthoringResult | undefined
    proposal: EditProposal | undefined
    refusal: string | undefined
  },
  text: BuilderText,
): string {
  if (state.busy) return text('prompt.status.writing')
  if (state.refusal !== undefined) return text('prompt.status.refused', { reason: state.refusal })
  if (state.proposal !== undefined) {
    return [
      ready(state.proposal, state.result?.attempts ?? 1, text),
      ...examplesSaid(state.proposal.examples, text),
    ].join(' ')
  }
  const result = state.result
  if (result === undefined || result.ok) return ''
  switch (result.ended) {
    case 'gave-up':
      return text('prompt.status.failed', { count: result.attempts })
    case 'stopped':
      return text('prompt.status.stopped')
    case 'unreachable':
      // Without a reason, a sentence that has no place for one: the other would end
      // on its colon, or show its placeholder.
      return result.reason === undefined
        ? text('prompt.status.unreachableNoReason')
        : text('prompt.status.unreachable', { reason: result.reason })
    case 'declined':
      // Without the reason, which the pane shows in place of the problems, as the
      // model wrote it: in this sentence too it would be read out twice (0158).
      return text('prompt.status.declined')
  }
}

/** What is ready to review, and how many goes the model took when it took more than one. */
function ready(proposal: EditProposal, attempts: number, text: BuilderText): string {
  const count = proposal.changes.length
  const costs = proposal.costsAnswers
  if (attempts > 1) {
    return text(costs ? 'prompt.status.readyAfterCosts' : 'prompt.status.readyAfter', {
      count,
      attempts,
    })
  }
  return text(costs ? 'prompt.status.readyCosts' : 'prompt.status.ready', { count })
}

/**
 * What the examples would make of it, after what is ready: the scenario panel's order,
 * what stops holding before what holds again. Nothing when they would say nothing.
 */
function examplesSaid(change: ScenarioRunChange | undefined, text: BuilderText): string[] {
  const stops = change?.regressions ?? []
  const holds = change?.repaired ?? []
  return [
    ...(stops.length === 0 ? [] : [text('prompt.status.wouldStop', { list: text.list(stops) })]),
    ...(holds.length === 0 ? [] : [text('prompt.status.wouldHold', { list: text.list(holds) })]),
  ]
}
