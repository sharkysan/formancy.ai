import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import { ScenarioPane } from '@formancy/builder-react'
import type { Scenario } from '@formancy/core'
import { askServerModel, fetchExamples, saveExamples } from './api.js'
import type { FormExamples, ServerModel } from './api.js'
import { ModelNote } from './model-note.js'

/**
 * A form's examples, as the admin holds them: the server's, read when a published form is
 * opened and saved back on every change (0166).
 *
 * The scenarios are the host's to keep ([0111](../../../docs/decisions/0111-a-scenario-panel-names-what-stopped-holding.md)),
 * and the admin's host is the server — where the publish reads them. So a removal or a kept
 * draft is drawn at once and sent at once, **one save after another**: two sent side by side
 * could land in the other order and put back on the server, where the publish runs them, an
 * example the screen no longer shows. A save the server refuses is said, and the list is read
 * from the server again.
 */
export interface KeptExamples {
  /** Undefined for a form never published, until they arrive, or when the server will not show them. */
  readonly examples: FormExamples | undefined
  /** The list after a removal or a kept draft, with the sample it had. */
  readonly change: (next: readonly Scenario[]) => void
  /** Why the last save did not happen, for the person. */
  readonly problem: string | undefined
}

/** Held by the form's workspace, so leaving the build tab and coming back keeps them. */
export function useKeptExamples(path: string, published: boolean): KeptExamples {
  const [examples, setExamples] = useState<FormExamples | undefined>(undefined)
  const [problem, setProblem] = useState<string | undefined>(undefined)
  // Bumped to read the server's list again after a save it refused.
  const [reads, setReads] = useState(0)
  const saving = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!published) return
    let current = true
    fetchExamples(path)
      .then((found) => {
        if (current) setExamples(found)
      })
      .catch(() => {
        if (current) setExamples(undefined)
      })
    return () => {
      current = false
    }
  }, [path, published, reads])

  const change = useCallback(
    (next: readonly Scenario[]) => {
      if (examples === undefined) return
      const kept: FormExamples = { scenarios: next, ...(examples.sample === undefined ? {} : { sample: examples.sample }) }
      setExamples(kept)
      setProblem(undefined)
      saving.current = saving.current
        .then(() => saveExamples(path, kept))
        .catch((error: unknown) => {
          setProblem(`The examples could not be saved: ${error instanceof Error ? error.message : String(error)}`)
          setReads((count) => count + 1)
        })
    },
    [examples, path],
  )

  return { examples: published ? examples : undefined, change, problem }
}

/**
 * The scenario pane over the kept examples, in server mode — what the publish runs — with
 * drafting through the server's model when it has one (0162, 0165). Its drafting run is the
 * part's own, as the prompt pane's is in the admin: leaving the build tab ends it.
 */
export function ExamplesPart({
  session,
  kept,
  published,
  model,
}: {
  session: BuilderSession
  kept: KeptExamples
  published: boolean
  model: ServerModel | undefined
}): ReactElement | null {
  if (!published) {
    return <p className="wb-hint">Examples are kept on the server once this form is published.</p>
  }
  if (kept.examples === undefined) return null
  return (
    <>
      {model === undefined ? null : (
        <ModelNote
          model={model}
          sends="what you say the form should do, its fields, labels and options, the sample and the names of its examples"
        />
      )}
      {kept.problem === undefined ? null : <p className="wb-problem">{kept.problem}</p>}
      <ScenarioPane
        session={session}
        scenarios={kept.examples.scenarios}
        onChange={kept.change}
        initialValue={kept.examples.sample}
        mode="server"
        ask={model === undefined ? undefined : askServerModel}
      />
    </>
  )
}
