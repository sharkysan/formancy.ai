import { useState } from 'react'
import type { ReactElement } from 'react'
import { referencedMessages } from '@formancy/builder-core'
import type { AskModel, BuilderSession, CatalogueFile, TranslationRun } from '@formancy/builder-core'
import { TranslationReview } from './translation-review.js'
import { TranslationsPreview } from './translations-preview.js'
import { useBuilder } from './use-builder.js'

/**
 * Translating a form.
 *
 * The format and the engine were finished long before this. A label could be
 * `{ $t: "name" }`, the engine resolved it against the catalogue and fell back to
 * the default locale — and nothing in the builder could produce one, so translated
 * content was a feature a developer could hand-write and an author could not
 * reach.
 *
 * **Two jobs, and they belong to different people.** An author *extracts*, once:
 * the words already typed become the default locale's messages and the document
 * starts referring to them. A translator *works through a language*, for an hour
 * at a time, and never touches the form's structure. This pane is built around the
 * second and keeps the first to a single button, because the first is a step and
 * the second is the work.
 *
 * **An untranslated message is marked rather than left to the fallback.** Falling
 * back silently is right when a form is rendered and wrong here: "it looked fine
 * in the preview" is exactly how a language ships half-finished.
 *
 * **Given a model, it can ask one for what is missing**, and holds the answer for review
 * message by message — `TranslationReview`, in a file of its own. Without `ask` nothing
 * of that is drawn, as the prompt pane draws nothing without one
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)).
 *
 * **Whose run it is, is the host's to say.** Given `run`, from `createTranslationRun`, the
 * pane draws a run the host holds: it goes on when the pane goes, and the pane drawn next
 * opens on the language it is for, waiting or with its answer. Without one the review part
 * holds its own and stops it when it goes, or when another language is chosen, as before
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 */
export interface TranslationsPaneProps {
  session: BuilderSession
  /**
   * How to reach a model, as the prompt pane takes it. Given, a language other than the
   * default offers to ask it for the messages that language is missing.
   */
  ask?: AskModel | undefined
  /** How many times to let the model correct itself. Three by default. */
  attempts?: number | undefined
  /**
   * The model's run, held by the host, from `createTranslationRun`: it outlives this pane,
   * and the pane drawn next opens on its language. Absent, the review holds its own, and
   * stops it when it goes (0157).
   */
  run?: TranslationRun | undefined
}

export function TranslationsPane({ session, ask, attempts, run }: TranslationsPaneProps): ReactElement {
  const view = useBuilder(session)
  const { text } = session
  const document = view.document
  const i18n = document.i18n
  const defaultLocale = i18n?.defaultLocale ?? 'en'

  // Opened where a held run's work is — its language — rather than on the default, where a
  // translation waiting for French would only be named (0164).
  const [showing, setShowing] = useState<string>(() => run?.state().locale ?? defaultLocale)
  const [adding, setAdding] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const report = session.lastImportReport()

  const locales = Object.keys(i18n?.messages ?? {})
  const chosen = locales.includes(showing) ? showing : defaultLocale

  /** Every `$t` the document refers to, in the order a reader meets them. */
  const referenced = referencedMessages(document)
  const orphaned = session.orphanedMessages()

  const unused =
    orphaned.length === 0 ? null : (
      <div data-formancy-part="translations-orphaned">
        <p>{text('translations.orphaned')}</p>
        <ul>
          {orphaned.map((id) => (
            <li key={id}>
              <code>{id}</code>: {i18n?.messages[defaultLocale]?.[id] ?? '—'}
            </li>
          ))}
        </ul>
      </div>
    )

  // Shown in BOTH branches, which the first version did not do: a form whose
  // fields have all been removed refers to no messages and still has a
  // translator's work sitting behind it, and the "nothing is translatable yet"
  // branch hid exactly that case.
  if (referenced.length === 0) {
    return (
      <div data-formancy-part="translations">
        <p data-formancy-part="translations-hint">{text('translations.none')}</p>
        <button
          type="button"
          onClick={() => {
            // Every text in one step, and one undo. Field by field is a chore
            // people abandon halfway, leaving a form that is half translatable and
            // a catalogue that looks finished.
            session.extractAllText()
          }}
        >
          {text('translations.extract')}
        </button>
        {unused}
      </div>
    )
  }

  return (
    <div data-formancy-part="translations">
      <div data-formancy-part="translations-toolbar">
        <label>
          {text('translations.language')}
          <select value={chosen} onChange={(event) => setShowing(event.target.value)}>
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {locale === defaultLocale ? text('translations.default', { locale }) : locale}
              </option>
            ))}
          </select>
        </label>

        <label>
          {text('translations.new')}
          <input
            type="text"
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder={text('translations.new.example')}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (adding.trim() === '') return
            session.addLocale(adding.trim())
            setShowing(adding.trim())
            setAdding('')
          }}
        >
          {text('translations.add')}
        </button>

        {/* For a team with a vendor and a translation memory, who work in a file
            rather than in a table in somebody's admin. The file carries the
            source beside every target, because a list of ids and blanks tells a
            translator nothing and a memory matches on source text. */}
        <button
          type="button"
          onClick={() => {
            const file = session.exportCatalogue(chosen)
            const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = window.document.createElement('a')
            link.href = url
            link.download = `${document.id}.${chosen}.json`
            link.click()
            URL.revokeObjectURL(url)
          }}
        >
          {text('translations.download', { locale: chosen })}
        </button>

        <label>
          {text('translations.upload')}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const picked = event.target.files?.[0]
              if (picked === undefined) return
              void picked.text().then((content) => {
                // Said rather than swallowed, either way: a silent no-op after a
                // translator uploads an afternoon's work is the worst available
                // outcome. Not JSON at all is the builder's sentence — the parser's
                // own names a token and a position, which is an engine talking to a
                // developer. Not a catalogue is the session's refusal, which this
                // pane used to drop on the floor.
                let file: unknown
                try {
                  file = JSON.parse(content)
                } catch {
                  setProblem(session.text('translations.unreadable'))
                  return
                }
                const outcome = session.importCatalogue(file as CatalogueFile)
                setProblem(outcome.ok ? null : outcome.message)
              })
            }}
          />
        </label>
      </div>

      {/* Keyed by the language: choosing another ends the part's own run and review rather
          than leaving French under review beside German. A run the host holds goes on, and
          the part on another language says where it is. */}
      {ask === undefined ? null : (
        <TranslationReview
          key={chosen}
          session={session}
          ask={ask}
          locale={chosen}
          attempts={attempts}
          run={run}
        />
      )}

      {problem === null ? null : <p data-formancy-part="translations-problem">{problem}</p>}

      {report === undefined ? null : (
        <div data-formancy-part="translations-report">
          <p>{text('translations.written', { count: report.written })}</p>
          {report.unknown.length === 0 ? null : (
            <p>{text('translations.unknown', { list: text.list(report.unknown) })}</p>
          )}
          {report.stale.length === 0 ? null : (
            <p>{text('translations.stale', { list: text.list(report.stale) })}</p>
          )}
        </div>
      )}

      <table data-formancy-part="translations-table">
        <thead>
          <tr>
            <th scope="col">{defaultLocale}</th>
            <th scope="col">{chosen}</th>
          </tr>
        </thead>
        <tbody>
          {referenced.map((id) => {
            const source = i18n?.messages[defaultLocale]?.[id] ?? id
            const translated = i18n?.messages[chosen]?.[id]
            return (
              <tr key={id}>
                {/* The default locale's words, not the id: a translator reading
                    `email.label` is reading the schema's name for a question rather
                    than the question. */}
                <th scope="row">{source}</th>
                <td>
                  {chosen === defaultLocale ? (
                    <input
                      type="text"
                      aria-label={source}
                      value={source}
                      onChange={(event) => session.setMessage(chosen, id, event.target.value)}
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        aria-label={source}
                        value={translated ?? ''}
                        onChange={(event) => session.setMessage(chosen, id, event.target.value)}
                      />
                      {translated === undefined || translated === '' ? (
                        <span data-formancy-part="translations-missing">
                          {text('translations.missing')}
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <TranslationsPreview
        document={document}
        locale={chosen}
        label={text('translations.preview', { locale: chosen })}
        submitLabel={text('translations.previewSubmit')}
      />

      {unused}
    </div>
  )
}
