import { DestroyRef, InjectionToken, inject } from '@angular/core'
import type { Provider } from '@angular/core'
import { cancelUploads } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { createFormText } from '@formancy/core/words'
import type { FormText, FormWordsByLocale } from '@formancy/core/words'
import { resolvedLocale } from '@formancy/spec'

/**
 * The engine reaches components through DI, never through inputs drilling: a
 * form is one engine instance, and every inject* helper resolves against it.
 */
export const FORMANCY_ENGINE = new InjectionToken<FormEngine>('formancy.engine')

/**
 * The form's own words, in the language its questions are read in (0171). Beside the engine
 * rather than on it, because the engine has no buttons — the server runs the same one.
 */
export const FORMANCY_TEXT = new InjectionToken<FormText>('formancy.text')

export interface FormancyOptions {
  /**
   * Languages a host adds, and words it changes, by locale: `{ it: { 'form.next':
   * 'Avanti' } }`, or `{ en: { 'form.submit': 'Send' } }`. Read in the language the
   * questions are, a word at a time, and English for the rest.
   */
  readonly words?: FormWordsByLocale
}

export function provideFormancy(engine: FormEngine, options: FormancyOptions = {}): Provider[] {
  return [
    {
      provide: FORMANCY_ENGINE,
      // When the injector that holds the form goes, its uploads stop. Here rather than
      // in the file field: the field is recreated whenever its row moves, and its
      // uploads have to survive that (0130).
      useFactory: () => {
        inject(DestroyRef).onDestroy(() => cancelUploads(engine))
        return engine
      },
    },
    {
      provide: FORMANCY_TEXT,
      // In the catalogue the document is read in, not the engine's locale as asked: a French
      // reader of a form with no French reads English questions, and read French buttons
      // under them. Both are fixed for the engine's lifetime, so its words are fixed for the
      // injector's: one function per form, not one per word.
      useFactory: () =>
        createFormText({
          locale: resolvedLocale(engine.schema(), engine.locale()),
          ...(options.words === undefined ? {} : { words: options.words }),
        }),
    },
  ]
}

export function injectEngine(): FormEngine {
  const engine = inject(FORMANCY_ENGINE, { optional: true })
  if (engine === null) {
    throw new Error('formancy needs provideFormancy(engine) in the injector tree above this component')
  }
  return engine
}
