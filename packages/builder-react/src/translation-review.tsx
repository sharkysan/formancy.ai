import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import {
  createTranslationRun,
  missingMessages,
  translationHeading,
  translationOn,
  translationStatus,
  translationToReview,
} from '@formancy/builder-core'
import type {
  AskModel,
  BuilderMessageId,
  BuilderSession,
  TranslationFlag,
  TranslationRun,
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
 * What is asked, kept, marked, held for review and said — and what a part drawn on one
 * language shows of a run for another — are `@formancy/builder-core`'s:
 * `createTranslationRun`, `translationOn`, `translationToReview`, `translationHeading`,
 * `translationStatus`. So the Angular part cannot decide any of them differently (0091).
 * This is the markup and a subscription.
 *
 * **Whose run it is, is the host's to say.** Given `run`, the part draws a run the host holds,
 * and its going ends nothing; drawn on another language than the run's, it says where the run
 * is and draws nothing of it — but its Stop, or its Discard, once that language has left the
 * form and no pane can be drawn under it. Without one it holds its own, and stops it when it
 * goes ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 *
 * Its own file so the translations pane does not become the place things go: the pane is
 * a translator's table, and this is a model's turn and its review.
 */
export interface TranslationReviewProps {
  session: BuilderSession
  /** How to reach a model: the host's, or a relay a person carries (0160). */
  ask: AskModel
  /** The language drawn. Nothing is, on the default one, but where a held run for another waits. */
  locale: string
  /** How many times to let the model correct itself. Three by default. */
  attempts?: number | undefined
  /**
   * The run, held by the host, from `createTranslationRun`: it outlives this part. Absent,
   * the part holds its own, and stops it when it goes — another language, another tab (0157).
   */
  run?: TranslationRun | undefined
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
  run: given,
}: TranslationReviewProps): ReactElement | null {
  const view = useBuilder(session)
  const { text } = session
  /*
   * The part's own run, for a host that gives none. It is the part's, so it stops when the
   * part goes — another language chosen, another tab — and whatever the model answers
   * afterwards is not proposed (0157). A run the host gives is the host's, and nothing here
   * ends it.
   */
  const [own] = useState(createTranslationRun)
  useEffect(() => () => own.stop(), [own])
  const run = given ?? own
  const state = useSyncExternalStore(run.subscribe, run.state, run.state)
  /** The run as this language shows it: itself, or where it waits. */
  const shown = translationOn(state, locale, view.document)
  const { busy, result, proposal } = shown
  const reviewId = useId()

  const defaultLocale = view.document.i18n?.defaultLocale ?? 'en'
  const status = translationStatus(shown, text)

  // Under another language than the run's, only where it waits: nothing of it to review or
  // apply here, and no Ask that would forget it. Its Stop or its Discard only once its own
  // language has left the form, where no part can be drawn to end it (0164).
  const elsewhere = shown.elsewhere
  if (elsewhere !== undefined) {
    return (
      <div data-formancy-part="translate">
        {!elsewhere.gone ? null : elsewhere.busy ? (
          <button type="button" onClick={() => run.stop()}>
            {text('prompt.stop')}
          </button>
        ) : (
          <button type="button" onClick={() => run.discard()}>
            {text('prompt.discard')}
          </button>
        )}
        <p role="status" data-formancy-part="translate-status">
          {status}
        </p>
      </div>
    )
  }

  const missing = missingMessages(view.document, locale).length
  // Nothing to translate into the default language, and nothing to say where nothing is missing.
  if (locale === defaultLocale) return null
  if (missing === 0 && !busy && result === undefined && proposal === undefined) return null

  /** The proposal under review: none when it writes nothing, and Ask is offered again. */
  const reviewed = translationToReview(proposal)
  const failed = result?.ok === false ? result : undefined
  const declined = failed?.ended === 'declined' ? failed.reason : undefined
  const problems =
    failed !== undefined && failed.ended !== 'declined' && failed.problems.length > 0
      ? failed
      : undefined

  const options = attempts === undefined ? {} : { attempts }

  return (
    <div data-formancy-part="translate">
      {reviewed === undefined ? (
        <button
          type="button"
          data-formancy-part="translate-ask"
          disabled={busy}
          onClick={() => void run.translate(ask, session, locale, options)}
        >
          {busy ? text('translate.asking') : text('translate.ask', { count: missing })}
        </button>
      ) : null}
      {busy ? (
        <button type="button" onClick={() => run.stop()}>
          {text('prompt.stop')}
        </button>
      ) : null}

      <p role="status" data-formancy-part="translate-status">
        {status}
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
          <button type="button" disabled={busy} onClick={() => run.apply(session)}>
            {text('translate.apply')}
          </button>
          <button type="button" disabled={busy} onClick={() => run.discard()}>
            {text('prompt.discard')}
          </button>
          {reviewed.stillMissing.length === 0 ? null : (
            <button type="button" disabled={busy} onClick={() => void run.rest(ask, session, options)}>
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
