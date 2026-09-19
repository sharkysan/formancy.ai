import { useCallback } from 'react'
import { parsePath } from '@formancy/core'
import { useFormEngine } from './context.js'

/**
 * Submit the form: touch everything, validate everything, and on failure move
 * focus to the first invalid control — the WCAG-required behaviour that every
 * consumer would otherwise have to hand-roll, and most would forget.
 *
 * Focus lives in the binding, not the engine, because it needs the DOM after
 * the commit; the engine only names the field (firstInvalid) and mints the id.
 */
export function useSubmit(): () => { ok: boolean; errors: Record<string, string[]> } {
  const engine = useFormEngine()

  return useCallback(() => {
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
  }, [engine])
}
