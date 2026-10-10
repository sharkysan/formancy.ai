import type { AskModel } from './answers.js'
import { authorForm } from './authoring.js'
import type { AuthoringResult } from './authoring.js'
import { applyProposal, proposeEdit } from './proposal.js'
import type { EditProposal, ProposalExamples } from './proposal.js'
import { createRunHolder } from './run-holder.js'
import type { BuilderSession, CommandOutcome } from './session.js'

/**
 * A prompt pane's run, and what it came to, held wherever the host holds it.
 *
 * **Why it exists.** A run belonged to the pane that asked, and a pane taken off the
 * screen stopped it, so a request did not run on for an answer nothing would show
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)). Through a relay a
 * turn takes as long as a person takes to carry it
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)), and a page
 * draws the prompt pane under one tab of one builder. On formancy.ai a visitor who looked at
 * the JSON, another tab or the other builder while their chat answered lost the turn: the
 * run was stopped, the relay's turn cleared, and the answer they pasted afterwards had
 * nowhere to go. So the run is held by whoever the host chooses
 * ([0163](../../../docs/decisions/0163-a-models-run-belongs-to-the-host.md)): a pane given
 * one draws it, and a pane that goes leaves it running, for the next pane to draw.
 *
 * **One holder for both kinds of host.** A pane given none makes its own and stops it when
 * it goes — 0157, unchanged for that host — so the run, the proposal, Apply and Discard are
 * decided here once, for both builders and both owners, and a pane is the markup, the
 * focus and a subscription ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * **One run at a time, and the words it answers kept with it.** The instruction cannot
 * change while a run waits. Once it has answered the box is the person's again, and what
 * they type next — in this pane or, minutes later, in the other builder — is not what the
 * proposal answers; so the run keeps the words it was asked with, as `asked`, for as long
 * as what it came to is held, and a pane draws them in the review. Each run has a stop of
 * its own, so an answer to a stopped one is never held as the next one's
 * (SAFETY-ANALYSIS D10).
 *
 * Framework-neutral, the shape `Relay` and `BuilderSession` have: `subscribe`, and a
 * snapshot whose identity changes only when something in it does.
 */
export interface PromptRun {
  /** What a pane draws. The same object until something in it changes. */
  state(): PromptRunState
  /** Hear each change. Returns what stops listening — a pane going, which ends nothing. */
  subscribe(listener: () => void): () => void
  /**
   * The instruction, as the person types it. Ignored while a run waits: the run is asked
   * with the words in the box. Once it has answered, the box is the person's again, and
   * the words it was asked with stay in `asked`.
   */
  instruct(instruction: string): void
  /**
   * Ask `ask` for the instruction, over the session's document as it is now, and hold what
   * comes back for review. Nothing while a run waits or the instruction is blank. Resolves
   * when the run ends, however it ends.
   */
  write(ask: AskModel, session: BuilderSession, options?: PromptRunOptions): Promise<void>
  /** End the run in flight, from whichever pane's Stop. Nothing when none is. */
  stop(): void
  /**
   * Put the proposal held into `session`, through `applyProposal`. Landed, everything
   * goes, the instruction with it; refused, the proposal stays with the refusal beside it.
   * `undefined` when nothing is held.
   */
  apply(session: BuilderSession): CommandOutcome | undefined
  /**
   * Forget what the last run came to. A run still waiting is stopped and forgotten with
   * it, its ending unsaid — for a host opening another form. The instruction stays.
   */
  discard(): void
}

export interface PromptRunState {
  /** What the person has typed, or the words the run in flight was asked with. */
  readonly instruction: string
  /**
   * The words the last run was asked with, kept with what it came to and gone with it. What
   * a review is the answer to: the box may say something else by then.
   */
  readonly asked: string | undefined
  /** Whether a run waits. */
  readonly busy: boolean
  /** What the last run came to, until something moves on from it. */
  readonly result: AuthoringResult | undefined
  /** The answer held for review, against the document it was written for. */
  readonly proposal: EditProposal | undefined
  /** What Apply said, when it refused. */
  readonly refusal: string | undefined
}

export interface PromptRunOptions {
  /**
   * The form's examples, taken when Write is pressed: an answer is run against them
   * before it is held, and the review names any that would stop holding (0159).
   */
  readonly examples?: ProposalExamples | undefined
  /** How many times to let the model correct itself. Three by default. */
  readonly attempts?: number | undefined
}

const IDLE: PromptRunState = {
  instruction: '',
  asked: undefined,
  busy: false,
  result: undefined,
  proposal: undefined,
  refusal: undefined,
}

export function createPromptRun(): PromptRun {
  // The snapshot, its listeners and one stop per run: what the three held runs share (0164).
  const run = createRunHolder(IDLE)

  const forget = (): Partial<PromptRunState> => ({
    asked: undefined,
    result: undefined,
    proposal: undefined,
    refusal: undefined,
  })

  return {
    state: run.state,
    subscribe: run.subscribe,
    instruct(instruction) {
      if (!run.state().busy) run.change({ instruction })
    },
    async write(ask, session, options = {}) {
      const instruction = run.state().instruction
      if (run.state().busy || instruction.trim() === '') return
      const stop = run.begin()
      // The document the answer is for, and the examples in force with it, taken together.
      const current = session.document()
      run.change({ busy: true, ...forget(), asked: instruction })
      let held: Partial<PromptRunState> = {}
      try {
        // Resolves however the run ends — a host's model that threw included (0157).
        const result = await authorForm(ask, instruction, {
          current,
          stop,
          ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
        })
        // Held against the document it was written for: Apply checks the form has not
        // moved since, wherever the run was while it waited.
        held = {
          result,
          ...(result.ok ? { proposal: proposeEdit(current, result.document, options.examples) } : {}),
        }
      } finally {
        if (run.end(stop)) run.change({ busy: false, ...held })
      }
    },
    stop: run.stop,
    apply(session) {
      const proposal = run.state().proposal
      if (proposal === undefined) return undefined
      const outcome = applyProposal(session, proposal)
      // Kept when refused. The commonest refusal is "the form changed since this was
      // proposed", and throwing the proposal away would lose the one thing the person
      // needs in order to ask again.
      run.change(outcome.ok ? { ...forget(), instruction: '' } : { refusal: outcome.message })
      return outcome
    },
    discard() {
      run.forget()
      run.change({ busy: false, ...forget() })
    },
  }
}
