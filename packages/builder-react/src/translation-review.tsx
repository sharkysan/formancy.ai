import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  applyProposal,
  createStop,
  missingMessages,
  proposeTranslation,
  translateCatalogue,
  translationHeading,
  translationStatus,
  translationToReview,
} from '@formancy/builder-core'
import type {
  AskModel,
  BuilderMessageId,
  BuilderSession,
  Stop,
  TranslationFlag,
  TranslationProposal,
  TranslationResult,
} from '@formancy/builder-core'
import { TranslationsPreview } from './translations-preview.js'
import { useBuilder } from './use-builder.js'

/**
 * Asking a model for the messages a language is missing, and reviewing its answer message
 * by message before it lands.
 *
 * A model's translation is a model's edit, and an edit that changes what a question asks
 * in a language the person reviewing may read less well than the source
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)). So it
 * is shown rather than applied, as the prompt pane's answer is (0109): every message it
 * would write, its source beside what was there and what is proposed, a mark on anything
 * to look at, and the form as it would read in that language. Apply is `applyProposal`,
 * refused when the form has moved since, one undo step otherwise.
 *
 * What is asked, what is kept, what is marked, what is held for review and what the status
 * says are `@formancy/builder-core`'s — `translateCatalogue`, `proposeTranslation`,
 * `translationToReview`, `translationHeading`, `translationStatus` — so the Angular part
 * cannot decide any of them differently (0091). This is the markup, the run's state and its
 * stop.
 *
 * Its own file so the translations pane does not become the place things go: the pane is
 * a translator's table, and this is a model's turn and its review.
 */
export interface TranslationReviewProps {
  session: BuilderSession
  /** How to reach a model: the host's, or a relay a person carries (0160). */
  ask: AskModel
  /** The language to fill in. The pane draws this only for one that is not the default. */
  locale: string
  /** How many times to let the model correct itself. Three by default. */
  attempts?: number | undefined
}

/** What each mark says, in the catalogue's words. */
const FLAGS: Readonly<Record<TranslationFlag, BuilderMessageId>> = {
  stale: 'translate.flag.stale',
  unchanged: 'translate.flag.unchanged',
}

export function TranslationReview({
  session,
  ask,
  locale,
  attempts,
}: TranslationReviewProps): ReactElement | null {
  const view = useBuilder(session)
  const { text } = session
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TranslationResult | undefined>(undefined)
  const [proposal, setProposal] = useState<TranslationProposal | undefined>(undefined)
  /** What applying said, when it refused. Cleared by anything that moves on. */
  const [refusal, setRefusal] = useState<string | undefined>(undefined)
  const reviewId = useId()
  /** The stop for the run in flight. A ref: pressing it changes nothing on screen by itself. */
  const running = useRef<Stop | undefined>(undefined)
  // Taken off the screen — another language chosen, another tab — the run stops, and
  // whatever the model answers afterwards is not proposed (0157).
  useEffect(() => () => running.current?.stop(), [])

  const missing = missingMessages(view.document, locale).length
  if (missing === 0 && !busy && result === undefined && proposal === undefined) return null

  /** The proposal under review: none when it writes nothing, and Ask is offered again. */
  const reviewed = translationToReview(proposal)
  const failed = result?.ok === false ? result : undefined
  const declined = failed?.ended === 'declined' ? failed.reason : undefined
  const problems =
    failed !== undefined && failed.ended !== 'declined' && failed.problems.length > 0
      ? failed
      : undefined

  /** Ask for what is missing — over `after`'s document, for the rest of an answer under review. */
  const run = async (after?: TranslationProposal): Promise<void> => {
    if (busy) return
    setBusy(true)
    setResult(undefined)
    setRefusal(undefined)
    if (after === undefined) setProposal(undefined)
    const stop = createStop()
    running.current = stop
    try {
      const outcome = await translateCatalogue(ask, after?.document ?? session.document(), locale, {
        stop,
        ...(attempts === undefined ? {} : { attempts }),
      })
      setResult(outcome)
      // Held against the form as it is now. Applying later checks it has not moved.
      if (outcome.ok) setProposal(proposeTranslation(session, outcome.answer, after))
    } finally {
      running.current = undefined
      setBusy(false)
    }
  }

  const discard = (): void => {
    setProposal(undefined)
    setRefusal(undefined)
    setResult(undefined)
  }

  const apply = (): void => {
    if (reviewed === undefined) return
    const outcome = applyProposal(session, reviewed)
    // Kept on screen when refused: the commonest refusal is a form that moved, and the
    // proposal is what the person needs to decide whether to ask again.
    if (outcome.ok) discard()
    else setRefusal(outcome.message)
  }

  const defaultLocale = view.document.i18n?.defaultLocale ?? 'en'

  return (
    <div data-formancy-part="translate">
      {reviewed === undefined ? (
        <button
          type="button"
          data-formancy-part="translate-ask"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? text('translate.asking') : text('translate.ask', { count: missing })}
        </button>
      ) : null}
      {busy ? (
        <button type="button" onClick={() => running.current?.stop()}>
          {text('prompt.stop')}
        </button>
      ) : null}

      <p role="status" data-formancy-part="translate-status">
        {translationStatus({ busy, result, proposal, refusal }, text)}
      </p>

      {/* Outside the review: when everything the model wrote was dropped there is no review,
          and this is what says why. */}
      {proposal === undefined || proposal.dropped.length === 0 ? null : (
        <p data-formancy-part="translate-dropped">
          {text('translate.dropped', { list: text.list(proposal.dropped) })}
        </p>
      )}

      {reviewed === undefined ? null : (
        <section data-formancy-part="translate-review" aria-labelledby={reviewId}>
          <h3 id={reviewId}>{translationHeading(reviewed, text)}</h3>
          <table data-formancy-part="translate-rows">
            <thead>
              <tr>
                <th scope="col">{defaultLocale}</th>
                <th scope="col">{text('translate.was')}</th>
                <th scope="col">{text('translate.now')}</th>
                <th scope="col">{text('translate.flags')}</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.rows.map((row) => (
                <tr key={row.id}>
                  {/* The source, not the id, as the translations table shows it. */}
                  <th scope="row">{row.source}</th>
                  <td>{row.was === '' ? text('translations.missing') : row.was}</td>
                  {/* The model's words, as text, in the language they are written in. */}
                  <td lang={locale}>{row.now}</td>
                  <td>
                    {row.flags.map((flag) => (
                      <span key={flag} data-formancy-part="translate-flag">
                        {text(FLAGS[flag])}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* The form as it would read in this language, with its own ids beside the pane's
              preview of the form as it is. */}
          <TranslationsPreview
            document={reviewed.document}
            locale={locale}
            label={text('translate.preview', { locale })}
            submitLabel={text('translations.previewSubmit')}
            formId={`${reviewed.document.id}.proposed`}
          />
          <button type="button" disabled={busy} onClick={apply}>
            {text('translate.apply')}
          </button>
          <button type="button" disabled={busy} onClick={discard}>
            {text('prompt.discard')}
          </button>
          {reviewed.stillMissing.length === 0 ? null : (
            <button type="button" disabled={busy} onClick={() => void run(reviewed)}>
              {text('translate.rest')}
            </button>
          )}
        </section>
      )}

      {declined === undefined ? null : (
        /* The model's words, quoted: text, never markup, whatever it wrote. */
        <blockquote data-formancy-part="translate-declined">{declined}</blockquote>
      )}

      {problems === undefined ? null : (
        <div data-formancy-part="translate-problems">
          {/* What the model was told, as it was told it (0119). */}
          <ul>
            {problems.problems.map((problem, index) => (
              <li key={index}>{problem.detail}</li>
            ))}
          </ul>
          {problems.lastAnswer === '' ? null : (
            <details>
              <summary>{text('prompt.lastAnswer')}</summary>
              <pre>{problems.lastAnswer}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
