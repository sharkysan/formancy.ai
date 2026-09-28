import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession, CatalogueFile } from '@formancy/builder-core'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'
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
 */
export function TranslationsPane({ session }: { session: BuilderSession }): ReactElement {
  const view = useBuilder(session)
  const document = view.document
  const i18n = document.i18n
  const defaultLocale = i18n?.defaultLocale ?? 'en'

  const [showing, setShowing] = useState<string>(defaultLocale)
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
        <p>
          These messages are no longer used by the form. They are kept rather than removed —
          a field can come back, and a year of somebody&rsquo;s translations should not
          disappear because a key changed.
        </p>
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
        <p data-formancy-part="translations-hint">
          Nothing in this form is translatable yet: its words are written into the document
          rather than referred to. Extracting them keeps what they say and lets a language be
          added beside them.
        </p>
        <button
          type="button"
          onClick={() => {
            // Every text in one step, and one undo. Field by field is a chore
            // people abandon halfway, leaving a form that is half translatable and
            // a catalogue that looks finished.
            session.extractAllText()
          }}
        >
          Make this form translatable
        </button>
        {unused}
      </div>
    )
  }

  return (
    <div data-formancy-part="translations">
      <div data-formancy-part="translations-toolbar">
        <label>
          Language
          <select value={chosen} onChange={(event) => setShowing(event.target.value)}>
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {locale === defaultLocale ? `${locale} (default)` : locale}
              </option>
            ))}
          </select>
        </label>

        <label>
          New language
          <input
            type="text"
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder="it"
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
          Add language
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
          Download {chosen}
        </button>

        <label>
          Upload a translated file
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const picked = event.target.files?.[0]
              if (picked === undefined) return
              void picked.text().then((text) => {
                try {
                  session.importCatalogue(JSON.parse(text) as CatalogueFile)
                  setProblem(null)
                } catch (error) {
                  // A file that is not one of ours, or not JSON at all. Said
                  // rather than swallowed: a silent no-op after a translator
                  // uploads an afternoon's work is the worst available outcome.
                  setProblem(error instanceof Error ? error.message : 'That file could not be read.')
                }
              })
            }}
          />
        </label>
      </div>

      {problem === null ? null : <p data-formancy-part="translations-problem">{problem}</p>}

      {report === undefined ? null : (
        <div data-formancy-part="translations-report">
          <p>
            {report.written} {report.written === 1 ? 'translation' : 'translations'} written.
          </p>
          {report.unknown.length === 0 ? null : (
            <p>
              Not written, because this form no longer has them — the file was exported before
              a field was removed: {report.unknown.join(', ')}
            </p>
          )}
          {report.stale.length === 0 ? null : (
            <p>
              Written, but translated from wording that has since changed, so worth a look:{' '}
              {report.stale.join(', ')}
            </p>
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
                        <span data-formancy-part="translations-missing">Not translated</span>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Preview document={document} locale={chosen} />

      {unused}
    </div>
  )
}

/**
 * The form as the language being worked on renders it.
 *
 * The half that was missing when this pane shipped: a translator could write a
 * language and not see it. An engine resolves text in one locale, fixed for its
 * lifetime, so the only way to look at a translation was to change the
 * document's `defaultLocale` — an edit to the form in order to read it, which is
 * then published, diffed and migrated like any other edit.
 *
 * So the preview builds its own engine at the chosen locale and the document is
 * not touched. Untranslated messages fall back to the default exactly as they
 * will for a visitor, which is the point: a preview showing message ids would
 * teach a translator that the fallback is broken when the fallback is the
 * feature.
 */
function Preview({ document, locale }: { document: FormSchema; locale: string }): ReactElement {
  const engine = useMemo(() => {
    try {
      return createFormEngine({
        schema: document,
        locale,
        capabilities: {
          now: () => Date.now(),
          today: () => new Date().toISOString().slice(0, 10),
          random: () => Math.random(),
        },
      })
    } catch {
      // A document the engine refuses is the builder's problem to report, not
      // this pane's: a translator seeing a compile error about their colleague's
      // expression has been handed somebody else's failure.
      return undefined
    }
  }, [document, locale])

  return (
    <section
      // Named, so a test can ask about the preview rather than about the pane —
      // the table's own inputs carry the source text as their accessible name,
      // and an unscoped query finds those instead.
      aria-label={`Preview in ${locale}`}
      data-formancy-part="translations-preview"
    >
      {engine === undefined ? null : (
        <FormancyProvider engine={engine}>
          <FormancyForm submitLabel="Submit" onSubmit={() => undefined} />
        </FormancyProvider>
      )}
    </section>
  )
}

/** Every message id the document refers to, in document order and deduplicated. */
function referencedMessages(document: FormSchema): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    const reference = record['$t']
    if (typeof reference === 'string') {
      if (!seen.has(reference)) {
        seen.add(reference)
        found.push(reference)
      }
      return
    }
    for (const item of Object.values(record)) walk(item)
  }
  walk(document.model)
  walk(document.layouts)
  return found
}
