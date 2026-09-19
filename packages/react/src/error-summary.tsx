import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { parsePath } from '@formancy/core'
import { useFormEngine } from './context.js'

export interface ErrorSummaryProps {
  labels?: Record<string, string>
}

/**
 * The error summary a failed submit focuses.
 *
 * The semantics are deliberate and easy to get wrong: the container takes
 * focus via tabindex="-1" — focusing it already makes screen readers announce
 * it, so role="alert" would announce it TWICE. Each entry is a real in-page
 * link to the offending control, because links are what "take me to the
 * problem" already means to assistive tech.
 */
export function ErrorSummary({ labels }: ErrorSummaryProps) {
  const engine = useFormEngine()
  const subscribe = useCallback((onChange: () => void) => engine.subscribe(onChange), [engine])
  const getErrors = useCallback(() => engine.visibleErrors(), [engine])
  const errors = useSyncExternalStore(subscribe, getErrors, getErrors)
  const region = useRef<HTMLDivElement | null>(null)
  const previousCount = useRef(0)

  // Focus when errors APPEAR (a submit surfaced them), not on every keystroke
  // that edits an already-broken field.
  useEffect(() => {
    if (errors.length > 0 && previousCount.current === 0) region.current?.focus()
    previousCount.current = errors.length
  }, [errors])

  if (errors.length === 0) return null

  const labelFor = (path: string): string =>
    labels?.[path] ?? labels?.[path.replace(/\[\d+\]/, '[]')] ?? path

  return (
    <div data-formancy-part="error-summary" tabIndex={-1} ref={region}>
      <h2 data-formancy-part="error-summary-heading">
        {errors.length === 1 ? 'There is 1 problem to fix' : `There are ${errors.length} problems to fix`}
      </h2>
      <ul>
        {errors.map(({ path, codes }) => {
          const controlId = engine.getFieldSnapshot(parsePath(path)).ids.control
          return (
            <li key={path}>
              <a
                href={`#${controlId}`}
                onClick={(event) => {
                  // The hash alone scrolls but does not focus; do both.
                  event.preventDefault()
                  document.getElementById(controlId)?.focus()
                }}
              >
                {`${labelFor(path)}: ${codes.join(', ')}`}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
