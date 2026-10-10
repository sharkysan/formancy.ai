import type { FormSchema } from '@formancy/spec'
import type { AskModel } from './answers.js'
import { applyProposal } from './proposal.js'
import { createRunHolder } from './run-holder.js'
import type { BuilderSession, CommandOutcome } from './session.js'
import { proposeTranslation, translateCatalogue, translationToReview } from './translate.js'
import type { TranslationProposal, TranslationResult } from './translate.js'

/**
 * A translation's run, and what it came to, held wherever the host holds it.
 *
 * **Why it exists.** The translations pane's review part held its own run and stopped it
 * when it went: another tab, another builder, the *Schema* view, another language
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)). Through
 * a relay a turn takes as long as a person takes to carry it
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)), so a visitor
 * who asked for the French and looked at the form while their chat answered lost the turn —
 * the defect [0163](../../../docs/decisions/0163-a-models-run-belongs-to-the-host.md) fixed
 * for the prompt pane. So this run, too, is held by whoever the host chooses
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 *
 * **It is held for its language.** A translation is a run *for* a language, and a pane may be
 * drawn on any: it opens on the default, and a person may choose another while the run
 * waits. So the run keeps the language it was asked for, `locale`, with the proposal and the
 * basis *Translate the rest* builds on; and `translationOn` decides what a pane drawn on a
 * language shows of it — the run, under its own language; under any other, only where it
 * waits, and, once its language has left the form, its Stop or its Discard. A French
 * proposal is never drawn, nor applied, under German.
 *
 * A part given none holds its own and stops it when it goes, as 0161 decided — so asking,
 * the proposal, Apply, Discard and the rest are decided here once for both builders and both
 * kinds of host ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)), and
 * a part is the markup and a subscription.
 */
export interface TranslationRun {
  /** What a part draws, through `translationOn`. The same object until something in it changes. */
  state(): TranslationRunState
  /** Hear each change. Returns what stops listening — a part going, which ends nothing. */
  subscribe(listener: () => void): () => void
  /**
   * Ask `ask` for every message `locale` is missing, over the session's document as it is
   * now, and hold what comes back for review. Whatever the last run came to, for any
   * language, is forgotten. Nothing while a run waits. Resolves when the run ends, however.
   */
  translate(ask: AskModel, session: BuilderSession, locale: string, options?: TranslationRunOptions): Promise<void>
  /**
   * *Translate the rest*: ask for what the proposal held still leaves missing, over its
   * document, and hold the answer written over it and against its basis, so the two land
   * together or neither does. Nothing without a proposal under review, or while a run waits.
   */
  rest(ask: AskModel, session: BuilderSession, options?: TranslationRunOptions): Promise<void>
  /** End the run in flight, from whichever part's Stop. Nothing when none is. */
  stop(): void
  /**
   * Put the proposal under review into `session`, through `applyProposal`. Landed, everything
   * goes, the language with it; refused, the proposal stays with the refusal beside it.
   * `undefined` when nothing is under review, and while a run waits: *Translate the rest*
   * keeps the first answer on screen, and its answer is written over it.
   */
  apply(session: BuilderSession): CommandOutcome | undefined
  /** Forget it all. A run still waiting is stopped and forgotten, its ending unsaid. */
  discard(): void
}

export interface TranslationRunState {
  /**
   * The language the run is for — while it waits, and for as long as what it came to is held.
   * `undefined` when nothing is: after Apply, Discard, or before anything was asked.
   */
  readonly locale: string | undefined
  /** Whether a run waits. */
  readonly busy: boolean
  /** What the last run came to, until something moves on from it. */
  readonly result: TranslationResult | undefined
  /** The answer held for review, against the document it was written for. */
  readonly proposal: TranslationProposal | undefined
  /** What Apply said, when it refused. */
  readonly refusal: string | undefined
}

export interface TranslationRunOptions {
  /** How many times to let the model correct itself. Three by default. */
  readonly attempts?: number | undefined
}

/** What a part drawn on one language shows of the run: `translationStatus` takes it whole. */
export interface TranslationView {
  readonly busy: boolean
  readonly result: TranslationResult | undefined
  readonly proposal: TranslationProposal | undefined
  readonly refusal: string | undefined
  /**
   * A run waiting, or a proposal held, for another language: which, whether it still waits,
   * and whether that language has left the form. Nothing else of it is given to a part drawn
   * here, so nothing of it can be reviewed or applied under the wrong language.
   */
  readonly elsewhere: TranslationElsewhere | undefined
}

/** Where a run a part cannot draw is: `TranslationView.elsewhere`. */
export interface TranslationElsewhere {
  /** The language the run is for. */
  readonly locale: string
  /** Whether it still waits; if not, it holds a proposal to review. */
  readonly busy: boolean
  /**
   * Whether its language has left the form since it was asked — undone, or removed — so no
   * pane offers it to choose. A part on any language then offers the run's Stop while it
   * waits and its Discard while it holds a proposal, because nowhere else can.
   */
  readonly gone: boolean
}

const IDLE: TranslationRunState = {
  locale: undefined,
  busy: false,
  result: undefined,
  proposal: undefined,
  refusal: undefined,
}

export function createTranslationRun(): TranslationRun {
  // The snapshot, its listeners and one stop per run: what the three held runs share.
  const run = createRunHolder(IDLE)

  /** Ask for `locale`'s missing messages — over `after`'s document, for the rest of it. */
  const ask = async (
    model: AskModel,
    session: BuilderSession,
    locale: string,
    after: TranslationProposal | undefined,
    options: TranslationRunOptions,
  ): Promise<void> => {
    if (run.state().busy) return
    const stop = run.begin()
    // The rest keeps the first answer on screen while it waits; a first ask forgets it.
    run.change({
      locale,
      busy: true,
      result: undefined,
      refusal: undefined,
      ...(after === undefined ? { proposal: undefined } : {}),
    })
    let held: Partial<TranslationRunState> = {}
    try {
      const result = await translateCatalogue(model, after?.document ?? session.document(), locale, {
        stop,
        ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
      })
      // Held against the form as the session it was asked in has it when the answer comes:
      // Apply checks the form has not moved since, in whichever session it is pressed.
      held = { result, ...(result.ok ? { proposal: proposeTranslation(session, result.answer, after) } : {}) }
    } finally {
      if (run.end(stop)) run.change({ busy: false, ...held })
    }
  }

  return {
    state: run.state,
    subscribe: run.subscribe,
    translate: (model, session, locale, options = {}) => ask(model, session, locale, undefined, options),
    rest(model, session, options = {}) {
      const { locale, proposal } = run.state()
      const after = translationToReview(proposal)
      if (locale === undefined || after === undefined) return Promise.resolve()
      return ask(model, session, locale, after, options)
    },
    stop: run.stop,
    apply(session) {
      // Not while the rest waits. Landed then, the language would go with the first half, and
      // the rest would be held for none — handed to every language as its review.
      const reviewed = run.state().busy ? undefined : translationToReview(run.state().proposal)
      if (reviewed === undefined) return undefined
      const outcome = applyProposal(session, reviewed)
      // Kept when refused: the commonest refusal is a form that moved, and the proposal is
      // what the person needs to decide whether to ask again.
      run.change(outcome.ok ? IDLE : { refusal: outcome.message })
      return outcome
    },
    discard() {
      run.forget()
      run.change(IDLE)
    },
  }
}

/**
 * What a translations part drawn on `locale`, over `document` as it is now, shows of a run.
 *
 * Under the run's own language, the run as it is. Under any other — the default, which the
 * pane opens on, or one a person chose while it waited — only where it waits, when it waits
 * or holds something to review: a French review drawn under German would be headed French
 * over a German preview, and its Apply would land French. A run that came to nothing to
 * review is over, and a part elsewhere is drawn as though there were none, free to ask.
 *
 * **A language can leave the form while its run waits** — the person undoes adding it — and a
 * pane offers only the form's languages, so no part would ever be drawn under it: every one
 * would say "choose it", none would offer Stop, and the turn would wait for good. So the view
 * says the language has gone, `elsewhere.gone`, and a part anywhere offers what it cannot
 * reach by choosing. Under the default language too, which a pane falls back to when the
 * language chosen goes.
 */
export function translationOn(state: TranslationRunState, locale: string, document: FormSchema): TranslationView {
  const asked = state.locale
  const gone = asked !== undefined && !Object.hasOwn(document.i18n?.messages ?? {}, asked)
  if (asked === undefined || (asked === locale && !gone)) {
    const { busy, result, proposal, refusal } = state
    return { busy, result, proposal, refusal, elsewhere: undefined }
  }
  const waiting = state.busy || translationToReview(state.proposal) !== undefined
  return {
    busy: false,
    result: undefined,
    proposal: undefined,
    refusal: undefined,
    elsewhere: waiting ? { locale: asked, busy: state.busy, gone } : undefined,
  }
}
