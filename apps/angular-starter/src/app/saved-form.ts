import type { FormSchema } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'

/**
 * Where this app keeps the form somebody built: the browser's own storage, under a key that
 * says whose it is. A form is JSON, so keeping one is writing a string and opening one is
 * reading it back; replace these three functions with requests to your own server — or to a
 * formancy server, which versions what it is given — and nothing else changes.
 *
 * Every access is guarded: a private window, or a browser told to keep nothing, throws on
 * the first touch of `localStorage`, and that should cost the visitor saving, not the app.
 */
const KEY = 'formancy-starter:form'

/** The saved form, if there is one this version can still open. */
export function savedForm(): FormSchema | undefined {
  try {
    const text = localStorage.getItem(KEY)
    if (text === null) return undefined
    const document: unknown = JSON.parse(text)
    // Checked before it is opened: a session refuses an invalid document by throwing, and an
    // app that cannot start because of something it saved itself is worse than one that
    // starts on its default.
    return validateSchema(document).valid ? (document as FormSchema) : undefined
  } catch {
    return undefined
  }
}

/** Keep `document`; false when this browser keeps nothing for the page. */
export function saveForm(document: FormSchema): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(document))
    return true
  } catch {
    return false
  }
}
