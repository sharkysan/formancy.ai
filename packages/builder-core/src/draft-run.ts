import type { Scenario, ScenarioOptions } from '@formancy/core'
import type { AskModel } from './answers.js'
import { createRunHolder } from './run-holder.js'
import { draftScenarios, keepDraft } from './scenario-drafts.js'
import type { DraftNote, Drafted, DraftingOptions, KeptDraft } from './scenario-drafts.js'
import type { BuilderSession } from './session.js'

/**
 * A drafting part's run, the drafts it came to, and the words it was asked with, held
 * wherever the host holds them.
 *
 * **Why it exists.** The drafts waiting were the part's, tagged with the session they were
 * drafted over, and a part that went stopped its run
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 * Through a relay a turn takes as long as a person takes to carry it, and on formancy.ai the
 * part is under *Fields*: a visitor who asked for examples and looked at the JSON while
 * their chat answered came back to nothing — the defect
 * [0163](../../../docs/decisions/0163-a-models-run-belongs-to-the-host.md) fixed for the
 * prompt pane. So this run, too, is held by whoever the host chooses
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 *
 * **It is held for its form, and the form is its id.** The drafts are about the form they
 * were drafted for, and Keep adds to that form's list. A session was the proxy for "that
 * form", and the playground opens a new one every time *Build* is shown again, over the same
 * text. The form's id is what the spec calls its stable identifier, and what stays across
 * those sessions: `draftsOn` shows the drafts to a part over any session of the form they
 * were drafted for, judged — as always, on every read — against that session's document as
 * it is; and to a part over another form, none of them, and Keep refuses there.
 *
 * A part given none holds its own and ends it when it goes or is handed another session, as
 * 0162 decided — so drafting, Keep and Discard are decided here once for both builders and
 * both kinds of host ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 */
export interface DraftRun {
  /** What a part draws, through `draftsOn`. The same object until something in it changes. */
  state(): DraftRunState
  /** Hear each change. Returns what stops listening — a part going, which ends nothing. */
  subscribe(listener: () => void): () => void
  /** The author's words, as they type them. Taken when Draft is pressed. */
  describe(intent: string): void
  /**
   * Ask `ask` for examples of the session's form, from the words described, and hold what
   * comes back. Nothing with no words, or while a run for the same form waits; a run for
   * another form is forgotten first — it would be drawn nowhere here, and its turn would
   * refuse this one. Resolves when the run ends, however it ends.
   */
  draft(ask: AskModel, session: BuilderSession, options?: DraftRunOptions): Promise<void>
  /** End the run in flight, from whichever part's Stop. Nothing when none is. */
  stop(): void
  /**
   * Keep `draft` in `scenarios`, through `keepDraft`: kept, it leaves the drafts and the
   * longer list is returned for the host; refused, it stays and the note says why.
   * `undefined` when it is not a draft this run holds for the session's form.
   */
  keep(
    draft: Scenario,
    session: BuilderSession,
    scenarios: readonly Scenario[],
    options?: ScenarioOptions,
  ): KeptDraft | undefined
  /** Let `draft` go unkept. Nothing reaches the host. */
  discardDraft(draft: Scenario): void
  /**
   * Forget what the run came to, for a host opening another form. A run still waiting is
   * stopped and forgotten with it, its ending unsaid. The words stay.
   */
  discard(): void
}

export interface DraftRunState {
  /** What the author said the form should do. */
  readonly intent: string
  /** The id of the form the run was asked over: what its drafts are about. */
  readonly form: string | undefined
  /** Whether a run waits. */
  readonly busy: boolean
  /** What the last run came to, until something moves on from it. */
  readonly result: Drafted | undefined
  /** The drafts still waiting: each leaves on Keep or Discard. */
  readonly drafts: readonly Scenario[]
  /** What the last Keep or Discard did. */
  readonly note: DraftNote | undefined
}

/** What the request starts from: `draftScenarios`'s options, less the stop the run makes. */
export type DraftRunOptions = Omit<DraftingOptions, 'stop'>

const NO_DRAFTS: readonly Scenario[] = []

const IDLE: DraftRunState = {
  intent: '',
  form: undefined,
  busy: false,
  result: undefined,
  drafts: NO_DRAFTS,
  note: undefined,
}

/** Everything but the words. */
const NOTHING_HELD: Omit<DraftRunState, 'intent'> = {
  form: undefined,
  busy: false,
  result: undefined,
  drafts: NO_DRAFTS,
  note: undefined,
}

export function createDraftRun(): DraftRun {
  // The snapshot, its listeners and one stop per run: what the three held runs share.
  const run = createRunHolder(IDLE)

  return {
    state: run.state,
    subscribe: run.subscribe,
    describe(intent) {
      run.change({ intent })
    },
    async draft(ask, session, options = {}) {
      const { intent, busy, form } = run.state()
      const document = session.document()
      if (intent.trim() === '' || (busy && form === document.id)) return
      run.forget()
      const stop = run.begin()
      run.change({ ...NOTHING_HELD, form: document.id, busy: true })
      let held: Partial<DraftRunState> = {}
      try {
        const result = await draftScenarios(ask, document, intent, { ...options, stop })
        held = { result, drafts: result.ok ? result.drafts : NO_DRAFTS }
      } finally {
        if (run.end(stop)) run.change({ busy: false, ...held })
      }
    },
    stop: run.stop,
    keep(draft, session, scenarios, options = {}) {
      const state = run.state()
      if (draftsOn(state, session) !== state || !state.drafts.includes(draft)) return undefined
      const kept = keepDraft(session.document(), scenarios, draft, options)
      run.change(
        kept.ok
          ? { drafts: state.drafts.filter((one) => one !== draft), note: { kind: 'kept', name: draft.name } }
          : { note: { kind: 'refused', why: kept.refused, name: draft.name } },
      )
      return kept
    },
    discardDraft(draft) {
      const { drafts } = run.state()
      if (!drafts.includes(draft)) return
      run.change({ drafts: drafts.filter((one) => one !== draft), note: { kind: 'discarded', name: draft.name } })
    },
    discard() {
      run.forget()
      run.change(NOTHING_HELD)
    },
  }
}

/**
 * What a drafting part over `session` shows of a run: the run as it is when it is about the
 * session's form, and only the words when it is about another. Another form's drafts are
 * not offered for its list, and a run waiting for another form is not drawn waiting here —
 * Draft over this form ends it.
 */
export function draftsOn(state: DraftRunState, session: BuilderSession): DraftRunState {
  return state.form === undefined || state.form === session.document().id
    ? state
    : { ...NOTHING_HELD, intent: state.intent }
}
