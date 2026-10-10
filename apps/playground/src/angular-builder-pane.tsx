import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderBlock, BuilderSession, Relay } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import { mountAngularBuilder } from './angular-builder-bootstrap.js'
import type { BuilderTab, MountedBuilder, PreviewState } from './angular-builder-bootstrap.js'
import type { ModelRuns } from './angular-builder-host.js'

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
  preview,
  blocks,
  onSaveBlock,
  scenarios,
  sample,
  onScenarios,
  relay,
  runs,
}: {
  session: BuilderSession
  tab: BuilderTab
  /** What the form pane's preview holds, for the rules tab. Pushed in like the tab. */
  preview: PreviewState | undefined
  /** The page's blocks, pushed in like the preview; a block saved here goes back to the page. */
  blocks: readonly BuilderBlock[]
  onSaveBlock: (block: BuilderBlock) => void
  /** The page's examples, pushed in like the blocks; a shorter list after a Remove goes back. */
  scenarios: readonly Scenario[]
  /** Where they start: the form's sample, which changes with the form. */
  sample: Readonly<Record<string, unknown>> | undefined
  onScenarios: (next: readonly Scenario[]) => void
  /** The page's model, a person carrying each turn (0160): the one relay both builders ask. */
  relay: Relay
  /** The page's model runs, which the React builder's panes draw too (0163, 0164). */
  runs: ModelRuns
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
    void mountAngularBuilder(
      element,
      session,
      tab,
      // Drawn on the first render, so the builder never shows the page's lists empty.
      { preview: latest.current, blocks: offered.current, ...examples.current, relay, runs },
      {
        keep: (block) => saving.current(block),
        keepScenarios: (next) => revising.current(next),
      },
    )
      .then((builder) => {
        if (cancelled) {
          builder.unmount()
          return
        }
        mounted.current = builder
        // Pushed again, for whatever changed while the bootstrap was in flight; a signal
        // set to the value it holds changes nothing.
        builder.explain(latest.current)
        builder.offer(offered.current)
        builder.check(examples.current)
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
    // every tab click. The relay and the model runs are the page's for its whole life, so
    // listing them costs nothing and says what the application was built over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, relay, runs])

  // Pushed in, for the same reason.
  useEffect(() => {
    mounted.current?.show(tab)
  }, [tab])

  // And the preview, which changes with every answer typed into the form pane. Held
  // as well as pushed, so a builder that finishes mounting after a change still
  // starts from the latest.
  const latest = useRef(preview)
  useEffect(() => {
    latest.current = preview
    mounted.current?.explain(preview)
  }, [preview])

  // And the blocks — a list saved to in either builder — held the same way.
  const offered = useRef(blocks)
  useEffect(() => {
    offered.current = blocks
    mounted.current?.offer(blocks)
  }, [blocks])
  // Read through a ref by the mounted application, so a new callback reaches it
  // without a remount.
  const saving = useRef(onSaveBlock)
  useEffect(() => {
    saving.current = onSaveBlock
  }, [onSaveBlock])

  // And the examples with the sample they start from, both ways, for the same reasons —
  // as a pair, since a list run from another form's sample is the defect this fixed.
  const examples = useRef({ scenarios, sample })
  useEffect(() => {
    examples.current = { scenarios, sample }
    mounted.current?.check(examples.current)
  }, [scenarios, sample])
  const revising = useRef(onScenarios)
  useEffect(() => {
    revising.current = onScenarios
  }, [onScenarios])

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
