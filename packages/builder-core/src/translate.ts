import type { FormSchema } from '@formancy/spec'
import { askChecked } from './answers.js'
import type { AskModel, Checkable, Stop, Verdict } from './answers.js'
import type { BuilderText } from './messages.js'
import { proposeEdit } from './proposal.js'
import type { EditProposal } from './proposal.js'
import { createBuilderSession } from './session.js'
import type { BuilderSession, CatalogueFile } from './session.js'
import { TRANSLATION_COMPLAINTS, translationComplaint, translationPrompt } from './translate-prompt.js'
import { catalogueFile, isCatalogueFile } from './translation.js'

/**
 * Asking a model for the messages a language is missing, and holding its answer for review.
 *
 * The third thing asked of a model this way, after a form and a change to one, and on the
 * same loop: `askChecked` asks, checks, and asks again with only the latest complaint; a
 * decline ends the run on its turn ([0158](../../../docs/decisions/0158-a-model-may-decline.md));
 * a stop ends it at once ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md));
 * a model answering another request — a relay carrying another pane's turn — ends it `busy`
 * before anything is asked, and is said as the prompt pane says it
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 *
 * **Missing-only.** The request holds the messages nobody has written in that language, and
 * what comes back is written only where a message is still missing when it lands. A model
 * never replaces a translation a person wrote and nobody asked it to touch
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)).
 *
 * **The answer is the catalogue file**, the one a translator downloads and uploads, so it
 * lands through the import and the import's own rules: an empty target erases nothing, an
 * id the form no longer has is not written, and a target translated from wording that has
 * since changed is written and named. There is no second set. What the import is handed is
 * the request's, though, where the request knows better than the answer: each source is the
 * one the model was sent, not the one it wrote back, and a target of nothing but spaces is
 * one left empty.
 *
 * No sentence here: what the model is told is `translate-prompt.ts`'s, and what a person
 * is told is the catalogue's.
 */

/** Why an answer was not taken, and what the model was told. */
export interface TranslationProblem {
  readonly kind: 'not-json' | 'not-a-catalogue' | 'wrong-locale' | 'unexplained-decline'
  readonly detail: string
}

/** What a model answered, kept: the messages asked for, and notes on the rest. */
export interface TranslationAnswer {
  /** The language asked for. */
  readonly locale: string
  /** The language the sources were in. */
  readonly defaultLocale: string
  /**
   * The messages asked for, in the order the request listed them, each with the source the
   * request sent. That source, and not the one the model wrote back, is what the stale mark
   * compares with the form's: only the request knows what was asked.
   */
  readonly asked: ReadonlyArray<{ readonly id: string; readonly source: string }>
  /** The answer's messages for ids that were asked for, as the model wrote them. */
  readonly messages: CatalogueFile['messages']
  /** Ids the answer wrote a target for that were not asked for: never written, and listed. */
  readonly dropped: readonly string[]
  /** Ids asked for that came back with no target, or one of only spaces: left for a person, or another turn. */
  readonly stillMissing: readonly string[]
}

export type TranslationResult =
  | { readonly ok: true; readonly answer: TranslationAnswer; readonly attempts: number }
  | {
      readonly ok: false
      readonly attempts: number
      readonly problems: readonly TranslationProblem[]
      readonly lastAnswer: string
      /** As `AuthoringResult.ended`: how the run ended without an answer. */
      readonly ended: 'gave-up' | 'stopped' | 'unreachable' | 'busy' | 'declined'
      readonly reason?: string
    }

export interface TranslationOptions {
  /** How many times to ask. Three by default, as for a form. */
  readonly attempts?: number
  /** The person's stop, from `createStop`. */
  readonly stop?: Stop
}

/** What one message would become: where it is, and what to look at. */
export interface TranslationRowChange {
  readonly id: string
  /** What it says in the default locale, now. */
  readonly source: string
  /** What it said in this language before. Empty: only a missing message is written. */
  readonly was: string
  /** What the model wrote. */
  readonly now: string
  /**
   * `stale`: translated from a source that is not the form's any more — the import's own
   * rule. `unchanged`: the same as its source, which is sometimes right (a canton is a
   * `Canton` in French) and sometimes a message nobody translated.
   */
  readonly flags: readonly TranslationFlag[]
}

export type TranslationFlag = 'stale' | 'unchanged'

/** A model's translation, held still: an `EditProposal`, and what it does message by message. */
export interface TranslationProposal extends EditProposal {
  readonly locale: string
  /** Every message it writes, in the order they were asked for. */
  readonly rows: readonly TranslationRowChange[]
  /** Ids it wrote a target for that were not written: never asked for, or translated by a person since. */
  readonly dropped: readonly string[]
  /** Every message the form refers to that would still have no target in this language. */
  readonly stillMissing: readonly string[]
}

/** The ids of every message the form refers to that has no target in `locale`. */
export function missingMessages(document: FormSchema, locale: string): string[] {
  return catalogueFile(document, locale)
    .messages.filter((message) => message.target === '')
    .map((message) => message.id)
}

/**
 * Ask a model for every message `locale` is missing, and keep what it answers.
 *
 * Asked again, with that problem alone, for an answer that is not JSON, not a catalogue
 * file, or a catalogue for another language. Anything else is kept — and what is odd about
 * it is noted rather than refused, because a partial answer is still work done: an id not
 * asked for is dropped and listed, and an id that came back empty is listed as still
 * missing. With nothing missing, no model is asked.
 *
 * Resolves however the run ends, as `authorForm` does.
 */
export async function translateCatalogue(
  ask: AskModel,
  document: FormSchema,
  locale: string,
  options: TranslationOptions = {},
): Promise<TranslationResult> {
  const request = translationPrompt(document, locale)
  const asked = request.rows.map(({ id, source }) => ({ id, source }))
  if (asked.length === 0) {
    // A turn paid for — through a relay, two pastes by hand — to translate nothing.
    const answer = { locale, defaultLocale: request.defaultLocale, asked, messages: [] }
    return { ok: true, answer: { ...answer, dropped: [], stillMissing: [] }, attempts: 0 }
  }

  const result = await askChecked(
    ask,
    (latest: TranslationProblem | undefined) =>
      latest === undefined
        ? { kind: 'translation', system: request.system, user: request.user }
        : {
            kind: 'translation',
            system: request.system,
            user: `${request.user}\n\n${translationComplaint(latest.detail)}`,
            followUp: translationComplaint(latest.detail),
          },
    (answer) => checkCatalogue(answer, locale),
    {
      ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
      ...(options.stop === undefined ? {} : { stop: options.stop }),
    },
  )
  if (!result.ok) return result

  const wanted = new Set(asked.map((row) => row.id))
  const messages = result.value.messages.filter((message) => wanted.has(message.id))
  const answered = new Set(messages.filter(writes).map((message) => message.id))
  return {
    ok: true,
    attempts: result.attempts,
    answer: {
      locale,
      defaultLocale: request.defaultLocale,
      asked,
      messages,
      dropped: unique(
        result.value.messages
          .filter((message) => !wanted.has(message.id) && writes(message))
          .map((message) => message.id),
      ),
      stillMissing: asked.map((row) => row.id).filter((id) => !answered.has(id)),
    },
  }
}

/** Whether what an answer held is a catalogue file for the language asked, or what is wrong. */
function checkCatalogue(answer: Checkable, locale: string): Verdict<CatalogueFile, TranslationProblem> {
  const problem = (kind: TranslationProblem['kind'], detail: string) =>
    ({ ok: false, problem: { kind, detail } }) as const
  if (answer === undefined) return problem('not-json', TRANSLATION_COMPLAINTS.notJson)
  if (answer.kind === 'unexplained-decline') {
    return problem('unexplained-decline', TRANSLATION_COMPLAINTS.unexplainedDecline)
  }
  const file: unknown = answer.value
  // The import's own reading of a catalogue, then each message: the import would take an
  // entry without an id as an id it does not know, and one without a source as stale.
  if (!isCatalogueFile(file)) {
    const record = file as Record<string, unknown>
    const why =
      typeof record['locale'] === 'string'
        ? TRANSLATION_COMPLAINTS.noMessages
        : TRANSLATION_COMPLAINTS.noLocale
    return problem('not-a-catalogue', TRANSLATION_COMPLAINTS.notACatalogue(why))
  }
  const bad = file.messages.findIndex((message: unknown) => !isMessage(message))
  if (bad !== -1) {
    const why = TRANSLATION_COMPLAINTS.badMessage(bad)
    return problem('not-a-catalogue', TRANSLATION_COMPLAINTS.notACatalogue(why))
  }
  if (file.locale !== locale) {
    return problem('wrong-locale', TRANSLATION_COMPLAINTS.wrongLocale(file.locale, locale))
  }
  return { ok: true, value: file }
}

/**
 * Whether a message carries a translation. A target of nothing but spaces does not: the
 * import would write it, and a form reads any target its language has before the default
 * language's, so a label would read " " where the English fallback stood.
 */
function writes(message: CatalogueFile['messages'][number]): boolean {
  return message.target.trim() !== ''
}

function isMessage(message: unknown): message is CatalogueFile['messages'][number] {
  if (typeof message !== 'object' || message === null) return false
  const { id, source, target } = message as Record<string, unknown>
  return typeof id === 'string' && typeof source === 'string' && typeof target === 'string'
}

/**
 * A model's translation, held against the form as it is now.
 *
 * The answer goes through the import, into a scratch session opened on the document, so
 * the import's own rules decide what is written and what is stale; the proposal is the
 * document that results, by `proposeEdit`, and `applyProposal` applies it — refused when
 * the form has moved since, one undo step otherwise. No second staleness rule.
 *
 * **Written only where still missing.** What was missing when the model was asked may have
 * been translated by a person while it answered; that message is dropped rather than
 * overwritten.
 *
 * **Stale by what was asked.** Each message goes to the import with the source the request
 * sent, so the import's stale rule compares what the model was shown with what the form
 * says now. The model's echo of the source is ignored: one that translated the source too
 * was marked stale with nothing moved, and one that left it out was marked with nothing
 * when the English had changed while it answered.
 *
 * `after` is the proposal this answer continues — *Translate the rest* — whose document it
 * is written over, and whose basis it keeps: if the form has moved since that one was
 * made, Apply refuses this one too.
 */
export function proposeTranslation(
  session: BuilderSession,
  answer: TranslationAnswer,
  after?: TranslationProposal,
): TranslationProposal {
  const current = session.document()
  const start = after?.document ?? current
  const missing = new Set(missingMessages(start, answer.locale))
  const sent = new Map(answer.asked.map((row) => [row.id, row.source]))
  const wrote = answer.messages.filter(writes)
  const kept = wrote.flatMap((message) => {
    const source = sent.get(message.id)
    return source !== undefined && missing.has(message.id) ? [{ ...message, source }] : []
  })

  const scratch = createBuilderSession(start, { text: session.text })
  scratch.importCatalogue({ locale: answer.locale, defaultLocale: answer.defaultLocale, messages: kept })
  const stale = new Set(scratch.lastImportReport()?.stale ?? [])
  const proposed = scratch.document()

  const sources = proposed.i18n?.messages[proposed.i18n.defaultLocale] ?? {}
  const written = proposed.i18n?.messages[answer.locale] ?? {}
  const landed = new Set(kept.map((message) => message.id))
  const rows = answer.asked
    .map((row) => row.id)
    .filter((id) => landed.has(id))
    .map((id): TranslationRowChange => {
      const source = sources[id] ?? ''
      const now = written[id] ?? ''
      return {
        id,
        source,
        was: start.i18n?.messages[answer.locale]?.[id] ?? '',
        now,
        flags: [
          ...(stale.has(id) ? (['stale'] as const) : []),
          ...(now === source ? (['unchanged'] as const) : []),
        ],
      }
    })

  const edit = proposeEdit(current, proposed)
  return {
    ...edit,
    basedOn: after?.basedOn ?? edit.basedOn,
    locale: answer.locale,
    rows: [...(after?.rows ?? []), ...rows],
    dropped: unique([
      ...(after?.dropped ?? []),
      ...answer.dropped,
      ...wrote.filter((message) => !landed.has(message.id)).map((message) => message.id),
    ]),
    stillMissing: missingMessages(proposed, answer.locale),
  }
}

/**
 * The proposal a pane holds for review, or none. One that writes nothing has nothing to
 * apply and nothing to discard, so a pane offers Ask again in its place, and the status and
 * the dropped list say what came back. Decided here, so neither builder can leave a person
 * with a sentence and no button.
 */
export function translationToReview(
  proposal: TranslationProposal | undefined,
): TranslationProposal | undefined {
  return proposal !== undefined && proposal.rows.length > 0 ? proposal : undefined
}

/**
 * The review's heading, and its accessible name: the language, and whether anything in it
 * is marked to look at. Decided here, as `proposalHeading` is, so the two builders cannot
 * name one review two ways.
 */
export function translationHeading(proposal: TranslationProposal, text: BuilderText): string {
  const marked = proposal.rows.some((row) => row.flags.length > 0)
  return text(marked ? 'translate.review.marked' : 'translate.review', { locale: proposal.locale })
}

/**
 * The one sentence the run's live region carries, as `proposalStatus` is for a form.
 *
 * A refusal outranks everything after a press, because it is about the button somebody
 * just pressed; an ending without an answer outranks a proposal still held from an
 * earlier turn, because it is the newer news — *Translate the rest* stopped leaves the
 * first answer on screen, and the sentence says the second did not come.
 *
 * A part drawn on another language than a held run's is given `elsewhere` and nothing else
 * of it (`translationOn`), and says only where the run is — or, once that language has left
 * the form and cannot be chosen, that it has, beside the run's Stop or Discard
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 */
export function translationStatus(
  state: {
    busy: boolean
    result: TranslationResult | undefined
    proposal: TranslationProposal | undefined
    refusal: string | undefined
    elsewhere?: { readonly locale: string; readonly busy: boolean; readonly gone: boolean } | undefined
  },
  text: BuilderText,
): string {
  const elsewhere = state.elsewhere
  if (elsewhere !== undefined) {
    const said = elsewhere.gone
      ? elsewhere.busy
        ? 'translate.status.goneAsking'
        : 'translate.status.goneHeld'
      : elsewhere.busy
        ? 'translate.status.elsewhereAsking'
        : 'translate.status.elsewhereHeld'
    return text(said, { locale: elsewhere.locale })
  }
  if (state.busy) return text('translate.status.asking')
  if (state.refusal !== undefined) return text('prompt.status.refused', { reason: state.refusal })
  const result = state.result
  if (result !== undefined && !result.ok) return endedStatus(result, text)
  const proposal = state.proposal
  if (proposal === undefined) return ''
  const count = proposal.rows.length
  const attempts = result?.ok === true ? result.attempts : 1
  // Nothing written is two different things: a model that left every message empty, and
  // one whose every translation was dropped, here because a person translated it first.
  const nothing =
    proposal.dropped.length === 0
      ? text('translate.status.none')
      : text('translate.status.noneWritten', { count: proposal.dropped.length })
  const said =
    count === 0
      ? nothing
      : attempts > 1
        ? text('translate.status.readyAfter', { count, attempts })
        : text('translate.status.ready', { count })
  const left = proposal.stillMissing.length
  return left === 0 ? said : `${said} ${text('translate.status.stillMissing', { count: left })}`
}

/**
 * What a run that ended without an answer says. A function of its own so the switch is the
 * whole of it: an ending added to `askChecked` and not given a sentence here is a compile
 * error, where inside `translationStatus` it fell through to the proposal below — `busy`
 * did, and the status said nothing, or the earlier answer's "ready to review".
 */
function endedStatus(result: Extract<TranslationResult, { ok: false }>, text: BuilderText): string {
  switch (result.ended) {
    case 'gave-up':
      return text('translate.status.failed', { count: result.attempts })
    case 'stopped':
      return text('prompt.status.stopped')
    case 'unreachable':
      return result.reason === undefined
        ? text('prompt.status.unreachableNoReason')
        : text('prompt.status.unreachable', { reason: result.reason })
    case 'busy':
      // Not unreachable: nothing was asked. The prompt pane's sentence, because the two
      // runs meet the same relay and nothing was applied in either (0162).
      return text('prompt.status.busy')
    case 'declined':
      return text('prompt.status.declined')
  }
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}
