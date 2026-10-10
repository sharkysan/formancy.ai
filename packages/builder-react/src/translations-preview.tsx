import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'

/**
 * A form as one language renders it.
 *
 * The half that was missing when the translations pane shipped: a translator could write
 * a language and not see it. An engine resolves text in one locale, fixed for its
 * lifetime, so the only way to look at a translation was to change the document's
 * `defaultLocale` — an edit to the form in order to read it, which is then published,
 * diffed and migrated like any other edit.
 *
 * So the preview builds its own engine at the locale asked and the document is not
 * touched. Untranslated messages fall back to the default exactly as they will for a
 * visitor, which is the point: a preview showing message ids would teach a translator
 * that the fallback is broken when the fallback is the feature. The buttons are the
 * renderer's own words for that language, as a visitor's are — not a word of the
 * builder's: named from the builder's catalogue, an English builder previewing French
 * showed "Submit" under French questions
 * ([0171](../../../docs/decisions/0171-the-renderers-words-are-the-forms-language.md)).
 *
 * Its own file because two parts draw it: the pane, for the form as it is, and a model's
 * translation under review, for the form as it would be
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)).
 */
export function TranslationsPreview({
  document,
  locale,
  label,
  formId,
}: {
  document: FormSchema
  locale: string
  /** Its accessible name, which says which form this is. */
  label: string
  /**
   * Its element ids' namespace. Two previews of one form on a page — the form as it is and
   * as a review would leave it — would otherwise mint every id twice, and a label would
   * name the other preview's control (0095).
   */
  formId?: string | undefined
}): ReactElement {
  const engine = useMemo(() => {
    try {
      return createFormEngine({
        schema: document,
        locale,
        ...(formId === undefined ? {} : { formId }),
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
  }, [document, locale, formId])

  return (
    <section
      // Named, so a test can ask about the preview rather than about the pane —
      // the table's own inputs carry the source text as their accessible name,
      // and an unscoped query finds those instead.
      aria-label={label}
      data-formancy-part="translations-preview"
    >
      {engine === undefined ? null : (
        <FormancyProvider engine={engine}>
          <FormancyForm onSubmit={() => undefined} />
        </FormancyProvider>
      )}
    </section>
  )
}
