import { createEnvironmentInjector } from '@angular/core'
import type { EnvironmentInjector, Injector } from '@angular/core'
import { createFormEngine } from '@formancy/core'
import { provideFormancy } from '@formancy/angular'
import type { FormSchema } from './types.js'

/**
 * An injector holding an engine for a form as one language renders it.
 *
 * A new one per document and per locale, because an engine's locale is fixed for its
 * lifetime — which is the whole reason a translations preview exists rather than the pane
 * changing `defaultLocale` to look at a language: an edit to the form in order to read it,
 * which is then published, diffed and migrated like any other edit.
 *
 * Its own file because two parts draw a preview: the pane, for the form as it is, and a
 * model's translation under review, for the form as it would be
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)). Given
 * `formId` for the second, so two previews of one form on a page do not mint every id
 * twice and name each other's controls (0095).
 *
 * The form draws its own buttons, in the renderer's words for that language as a visitor's
 * are; the pane names none of them from the builder's catalogue, which put an English
 * "Submit" under a French form (0171).
 *
 * Undefined for a document the engine refuses: that is the builder's problem to report,
 * not the preview's — a translator seeing a compile error about a colleague's expression
 * has been handed somebody else's failure.
 */
export function previewInjector(
  document: FormSchema,
  locale: string,
  parent: EnvironmentInjector,
  formId?: string,
): Injector | undefined {
  try {
    const engine = createFormEngine({
      schema: document,
      locale,
      ...(formId === undefined ? {} : { formId }),
      capabilities: {
        now: () => Date.now(),
        today: () => new Date().toISOString().slice(0, 10),
        random: () => Math.random(),
      },
    })
    return createEnvironmentInjector([provideFormancy(engine)], parent)
  } catch {
    return undefined
  }
}
