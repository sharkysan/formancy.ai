import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import { mountAngularBuilder } from './angular-builder-bootstrap.js'
import type { BuilderTab, MountedBuilder } from './angular-builder-bootstrap.js'

/**
 * The Angular builder, as a React component.
 *
 * The same shape as `AngularPane` and for the same reason, with one difference
 * that matters: the renderers get an engine each, because element ids are minted
 * per engine and two engines over one schema collide
 * ([0095](../../../docs/decisions/0095-one-schema-two-renderers.md)). The
 * builders share **one session**, because a session is the document and there is
 * only one document — so an edit made in either appears in the other, in the
 * JSON, and in both rendered forms.
 *
 * Mounted once and retuned: the tab is a signal inside the Angular application,
 * so switching tabs does not rebuild the tree and lose where somebody was.
 */
export function AngularBuilderPane({
  session,
  tab,
}: {
  session: BuilderSession
  tab: BuilderTab
}): ReactElement {
  const host = useRef<HTMLDivElement | null>(null)
  const mounted = useRef<MountedBuilder | undefined>(undefined)
  const [problem, setProblem] = useState<string | undefined>(undefined)

  useEffect(() => {
    const element = host.current
    if (element === null) return undefined

    /*
     * Bootstrapping is asynchronous and effects are not, so a session replaced
     * quickly starts a second mount before the first finishes. `cancelled` makes
     * the late one tear itself down rather than leaving an orphan editing a
     * document nobody is looking at.
     */
    let cancelled = false

    setProblem(undefined)
    void mountAngularBuilder(element, session, tab)
      .then((builder) => {
        if (cancelled) builder.unmount()
        else mounted.current = builder
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // Shown rather than logged: an empty half of the pane is the failure
        // this whole thing exists to make impossible.
        setProblem(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
      mounted.current?.unmount()
      mounted.current = undefined
    }
    // The tab is deliberately not a dependency — it is pushed in below rather
    // than remounting the application. Listing it here would rebuild the tree on
    // every tab click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Pushed in, for the same reason.
  useEffect(() => {
    mounted.current?.show(tab)
  }, [tab])

  return (
    <div className="angular-builder-pane">
      {problem === undefined ? null : (
        <p role="alert" className="problem">
          The Angular builder did not start: {problem}
        </p>
      )}
      <div ref={host} />
    </div>
  )
}
