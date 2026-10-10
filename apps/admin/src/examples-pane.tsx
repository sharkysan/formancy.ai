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
 * example the screen no longer shows.
 *
 * **A save that fails puts the server's list back on the screen, and nothing made before that
 * is sent.** The list is read again inside the same chain, so no save is in flight when it
 * arrives, and every change made on the list it replaces — queued behind the failed save, or
 * made while the read was out — was made on a list the server never took, and is dropped. When
 * the server cannot be reached for the read either, the screen shows the list it last kept, and
 * says so. Either way the failure is said.
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
  const saving = useRef<Promise<void>>(Promise.resolve())
  // The list the server is known to keep: what it last answered with, or last took.
  const known = useRef<FormExamples | undefined>(undefined)
  // Counts the times a failed save put the server's list back. A change remembers the count it
  // was made at, and is not sent once the list it was made on has been replaced.
  const replaced = useRef(0)

  useEffect(() => {
    if (!published) return
    let current = true
    fetchExamples(path)
      .then((found) => {
        if (!current) return
        known.current = found
        setExamples(found)
      })
      .catch(() => {
        if (current) setExamples(undefined)
      })
    return () => {
      current = false
    }
  }, [path, published])

  const change = useCallback(
    (next: readonly Scenario[]) => {
      if (examples === undefined) return
      const kept: FormExamples = { scenarios: next, ...(examples.sample === undefined ? {} : { sample: examples.sample }) }
      const madeAt = replaced.current
      setExamples(kept)
      setProblem(undefined)
      saving.current = saving.current.then(async () => {
        if (madeAt !== replaced.current) return
        try {
          await saveExamples(path, kept)
          known.current = kept
        } catch (error) {
          const why = `The examples could not be saved: ${asSentence(error)}`
          let reached = true
          try {
            known.current = await fetchExamples(path)
          } catch {
            reached = false
          }
          replaced.current += 1
          setExamples(known.current)
          setProblem(reached ? why : `${why} Nor could the server’s list be read again, so this is the list it last kept.`)
        }
      })
    },
    [examples, path],
  )

  return { examples: published ? examples : undefined, change, problem }
}

/** An error's message as a sentence: the server's end in a full stop, a browser's do not. */
function asSentence(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return /[.!?]$/.test(text) ? text : `${text}.`
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
  // Said before anything else is decided: a failed save whose read again the server refused
  // leaves no list to draw, and the sentence is then all there is to read.
  const problem = kept.problem === undefined ? null : <p className="wb-problem">{kept.problem}</p>
  if (kept.examples === undefined) return problem
  return (
    <>
      {model === undefined ? null : (
        <ModelNote
          model={model}
          sends="what you say the form should do, its fields, labels and options, the sample and the names of its examples"
        />
      )}
      {problem}
      {kept.examples.unreadable === undefined ? null : (
        <p className="wb-problem">
          {`The server keeps more than it could read as examples, and left it out here: ${kept.examples.unreadable.join(' ')} The next change saved here keeps only what is listed.`}
        </p>
      )}
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
