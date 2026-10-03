import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { FormEngine } from '@formancy/core'
import { mountAngularPreview } from './angular-bootstrap.js'

/**
 * The Angular renderer, as a React component.
 *
 * Two frameworks on one page, which is the only honest way to show that the
 * engine is framework-neutral. A screenshot of two tabs proves nothing: the
 * interesting claim is that both renderers bind to the *same* protocol, and the
 * way to demonstrate it is to put them next to each other over one document.
 *
 * React owns the element and nothing else. Angular bootstraps into a child, and
 * the teardown is awaited before the next mount so that two applications never
 * share a host — the engine arrives through Angular's injector, so a new engine
 * means a new application ([`angular-preview.ts`](./angular-preview.ts) has the
 * reasoning).
 */
export function AngularPane({
  engine,
  theme,
}: {
  engine: FormEngine | undefined
  /** The same theme the React pane wears, so a difference on screen is the renderer. */
  theme: string
}): ReactElement {
  const host = useRef<HTMLDivElement | null>(null)
  const [problem, setProblem] = useState<string | undefined>(undefined)

  useEffect(() => {
    const element = host.current
    if (element === null || engine === undefined) return undefined

    /*
     * Bootstrapping is asynchronous and effects are not, so a fast typist can
     * start a second mount before the first finishes. `cancelled` makes the
     * late one tear itself down instead of leaving an orphan: without it, the
     * host ends up with two Angular applications over two engines, one of them
     * for a document nobody is editing any more.
     */
    let cancelled = false
    let unmount: (() => void) | undefined

    setProblem(undefined)
    void mountAngularPreview(element, engine)
      .then((teardown) => {
        if (cancelled) teardown()
        else unmount = teardown
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // Shown rather than logged. A blank half of the page is the failure
        // mode this whole pane exists to make impossible, so a bootstrap that
        // fails has to say so where the form would have been.
        setProblem(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
      unmount?.()
    }
  }, [engine])

  return (
    // A named region, matching the React pane: two forms on one page otherwise
    // give every query two answers, and a landmark is how somebody using a
    // screen reader chooses which renderer to read.
    <section className="angular-pane" aria-labelledby="renderer-angular">
      <h3 id="renderer-angular">Angular</h3>
      {problem === undefined ? null : (
        <p role="alert" className="problem">
          The Angular renderer did not start: {problem}
        </p>
      )}
      <div className="sheet" data-formancy-theme={theme} ref={host} />
    </section>
  )
}
