import { Pipe, inject } from '@angular/core'
import type { PipeTransform } from '@angular/core'
import { createFormText } from '@formancy/core/words'
import type { FormText, FormWordId, FormWordValues } from '@formancy/core/words'
import { FORMANCY_TEXT } from './provide.js'

let english: FormText | undefined

/**
 * The form's words, in the language the reader chose for it (0171).
 *
 * English outside `provideFormancy`, which has no engine to take a language from — a
 * resume notice a host draws apart from the form. Never the browser's language: the
 * form's is the one the reader chose, and the browser's is the one their machine came
 * with.
 */
export function injectFormText(): FormText {
  const text = inject(FORMANCY_TEXT, { optional: true })
  if (text !== null) return text
  english ??= createFormText({ locale: '' })
  return english
}

/**
 * A form word in a template: `{{ 'form.next' | formancyText }}`, or with its values,
 * `{{ 'file.remove' | formancyText: { name: file.name } }}`.
 *
 * A pure pipe rather than a method the template calls, as the builder's words are read
 * (0116): Angular runs a template's method calls on every change-detection pass and
 * memoises a pure pipe on its arguments. Unlike the builder's, the language is injected
 * rather than passed, because it belongs to the form the injector holds, not to a session
 * a component was handed — every control under one `provideFormancy` is one form.
 */
@Pipe({ name: 'formancyText' })
export class FormancyTextPipe implements PipeTransform {
  private readonly text = injectFormText()

  transform(id: FormWordId, values?: FormWordValues): string {
    return this.text(id, values)
  }
}
