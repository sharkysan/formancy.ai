import { parsePath } from '@formancy/core'
import { injectEngine } from './provide.js'

/**
 * Submit the form: touch everything, validate everything, and on failure move
 * focus to the first invalid control — the WCAG-required behaviour that every
 * consumer would otherwise have to hand-roll, and most would forget.
 *
 * Focus lives in the binding, not the engine, because it needs the DOM after
 * the commit; the engine only names the field (firstInvalid) and mints the id.
 * Same policy, word for word, as React's useSubmit — the fixtures hold both
 * renderers to it.
 */
export function injectSubmit(): () => { ok: boolean; errors: Record<string, string[]> } {
  const engine = injectEngine()

  return () => {
    const outcome = engine.submit()
    if (!outcome.ok && typeof document !== 'undefined') {
      // An ErrorSummary takes precedence: it lists every problem, and focusing
      // it announces the situation once. It focuses ITSELF when errors appear,
      // so nothing to do here. Without one, fall back to the first control.
      const summary = document.querySelector('[data-formancy-part="error-summary"]')
      if (summary === null) {
        const firstInvalid = engine.firstInvalid()
        if (firstInvalid !== null) {
          const ids = engine.getFieldSnapshot(parsePath(firstInvalid)).ids
          document.getElementById(ids.control)?.focus()
        }
      }
    }
    return outcome
  }
}
