import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider, ResumeNotice } from '@formancy/react'
import type { ResumeMigration } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'
import { fetchPublicForm, resumeDraft, saveDraft, startDraft, submitForm } from './api.js'

/**
 * Filling in a published form, against the server, with a draft behind it.
 *
 * The parts all existed and nothing put them together. The roadmap said so in as
 * many words — "the debounce, the stored token and the read-only path are
 * described and not demonstrated" — and this repository has already shipped one
 * feature that was documented and inert. A page nobody can open is a claim
 * nobody checked.
 *
 * It lives in the admin because that is where the server already is. The other
 * two apps are client-only: the playground has no backend and the marketing site
 * must not depend on one. Seeing what a respondent sees is also a thing an author
 * wants, so it earns its tab rather than only demonstrating a flow.
 *
 * What it is **not** is the anonymous path end to end. The admin is signed in,
 * so a submission from here skips the proof-of-work challenge an anonymous one
 * must solve. The draft routes take no identity at all, so those are exactly the
 * public ones — which is the half this exists to demonstrate.
 */

/** Where the key to a draft is kept. One per form, per browser. */
const keyFor = (path: string): string => `formancy.draft.${path}`

interface DraftKey {
  id: string
  token: string
}

function rememberedDraft(path: string): DraftKey | undefined {
  try {
    const held = window.localStorage.getItem(keyFor(path))
    if (held === null) return undefined
    const parsed = JSON.parse(held) as Partial<DraftKey>
    if (typeof parsed.id !== 'string' || typeof parsed.token !== 'string') return undefined
    return { id: parsed.id, token: parsed.token }
  } catch {
    // A private window, cleared storage, or something else in this key. The
    // form still works; it just will not survive the tab closing.
    return undefined
  }
}

function remember(path: string, key: DraftKey | undefined): void {
  try {
    if (key === undefined) window.localStorage.removeItem(keyFor(path))
    else window.localStorage.setItem(keyFor(path), JSON.stringify(key))
  } catch {
    /* as above */
  }
}

/**
 * Two seconds of quiet, which is the floor the documentation gives.
 *
 * The obvious implementation saves on every change, and every save is a database
 * write: a form somebody is typing into produces one per keystroke. The draft
 * routes are rate-limited on the same terms as submissions, so an undebounced
 * save does not quietly cost money — it starts answering 429 while somebody is
 * typing hardest, which is worse.
 */
const QUIET_MS = 2_000

export interface FillPaneProps {
  path: string
  /**
   * How long the typing has to stop for, in milliseconds.
   *
   * A parameter because the tests needed one. Holding a fake clock over a
   * component whose save is two awaited fetches deep raced: advancing the timer
   * runs the callback, the assertion runs before the promises settle, and
   * whether that passes depends on how a runner schedules microtasks. It passed
   * here and failed on CI, which is the timing test that tells you nothing about
   * the code. A short interval and a real clock is deterministic.
   */
  quietMs?: number
}

type Status =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready' }

export function FillPane({ path, quietMs = QUIET_MS }: FillPaneProps): ReactElement {
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [schema, setSchema] = useState<FormSchema | undefined>(undefined)
  const [schemaHash, setSchemaHash] = useState<string | undefined>(undefined)
  const [initialValue, setInitialValue] = useState<Record<string, unknown> | undefined>(undefined)
  const [migration, setMigration] = useState<ResumeMigration | undefined>(undefined)
  const [readOnly, setReadOnly] = useState(false)
  const [saved, setSaved] = useState<string | undefined>(undefined)
  const [sent, setSent] = useState<string | undefined>(undefined)
  /** Bumped by "start over", so the engine and every control are built again. */
  const [generation, setGeneration] = useState(0)

  const draft = useRef<DraftKey | undefined>(undefined)
  /**
   * What the response is sent with (0169): the form's token, until a draft is started or
   * resumed, and the draft's after that — the one a resume hands back, so a response whose
   * answer was lost and is sent again after a reload is the same response.
   */
  const sendWith = useRef<string | undefined>(undefined)
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /**
   * How many responses this page has seen stored. A save that was already starting its draft
   * when one was compares it before and after, and lets the draft go: its answers are the ones
   * just stored, and the draft's token is one nothing has spent.
   */
  const stored = useRef(0)

  useEffect(() => {
    let live = true
    const load = async (): Promise<void> => {
      setStatus({ kind: 'loading' })
      setMigration(undefined)
      setReadOnly(false)
      setSent(undefined)
      setSaved(undefined)

      const held = rememberedDraft(path)
      if (held !== undefined) {
        const resumed = await resumeDraft(path, held.id, held.token)
        if (!live) return
        if (resumed === undefined) {
          // Swept, or a token that no longer matches. Both answer the same way
          // on purpose, so the reply cannot be used to discover which ids exist.
          remember(path, undefined)
        } else {
          draft.current = held
          sendWith.current = resumed.submissionToken
          setSchema(resumed.schema)
          setSchemaHash(resumed.schemaHash)
          setInitialValue(resumed.data)
          setMigration(resumed.migration)
          // A read-only draft is shown against its OWN version. Saving it would
          // overwrite the answers being shown with ones the server could not
          // rebind, so the timer below never starts.
          setReadOnly(resumed.outcome === 'readOnly')
          setStatus({ kind: 'ready' })
          return
        }
      }

      try {
        const published = await fetchPublicForm(path)
        if (!live) return
        draft.current = undefined
        sendWith.current = published.submissionToken
        setSchema(published.schema)
        setSchemaHash(published.schemaHash)
        setInitialValue(undefined)
        setStatus({ kind: 'ready' })
      } catch (error) {
        if (!live) return
        setStatus({ kind: 'failed', message: error instanceof Error ? error.message : 'Could not load the form.' })
      }
    }
    void load()
    return () => {
      live = false
      clearTimeout(pending.current)
    }
  }, [path, generation])

  const engine = useMemo(() => {
    if (schema === undefined) return undefined
    return createFormEngine({
      schema,
      capabilities: {
        now: () => Date.now(),
        today: () => new Date().toISOString().slice(0, 10),
        random: () => Math.random(),
      },
      ...(initialValue === undefined ? {} : { initialValue }),
    })
  }, [schema, initialValue, generation])

  const save = useCallback(
    async (value: unknown): Promise<void> => {
      if (readOnly) return
      if (draft.current === undefined) {
        const before = stored.current
        const started = await startDraft(path)
        if (stored.current !== before) return
        if (started === undefined) {
          setSaved('Could not start a draft.')
          return
        }
        draft.current = { id: started.id, token: started.token }
        sendWith.current = started.submissionToken
        remember(path, draft.current)
      }
      const ok = await saveDraft(path, draft.current.id, draft.current.token, value)
      setSaved(ok ? 'Saved.' : 'Could not save.')
    },
    [path, readOnly],
  )

  useEffect(() => {
    if (engine === undefined || readOnly) return
    return engine.subscribe(() => {
      clearTimeout(pending.current)
      pending.current = setTimeout(() => void save(engine.value()), quietMs)
    })
  }, [engine, readOnly, save, quietMs])

  const startOver = (): void => {
    clearTimeout(pending.current)
    remember(path, undefined)
    draft.current = undefined
    setGeneration((n) => n + 1)
  }

  /**
   * The response is stored, so its draft is finished: forget the key, or the next visit
   * resumes it as though nothing had been sent. And drop the save still waiting out the quiet —
   * Submit pressed straight after the last keystroke leaves one — which would otherwise find no
   * draft, start one holding the answers just stored, and remember that instead.
   */
  const finish = (): void => {
    clearTimeout(pending.current)
    stored.current += 1
    remember(path, undefined)
    draft.current = undefined
  }

  if (status.kind === 'loading') return <p className="wb-hint">Loading the published form…</p>
  if (status.kind === 'failed') return <p className="wb-hint">{status.message}</p>
  if (engine === undefined || schemaHash === undefined) return <p className="wb-hint">No form.</p>

  return (
    <div className="wb-fill">
      <ResumeNotice
        {...(migration === undefined ? {} : { migration })}
        labels={labelsOf(schema)}
      />

      {readOnly ? (
        <p className="wb-hint">
          <button type="button" onClick={startOver}>
            Start over with the current form
          </button>
        </p>
      ) : null}

      <FormancyProvider engine={engine}>
        <FormancyForm
          submitLabel="Submit"
          onSubmit={async (value) => {
            if (readOnly || sendWith.current === undefined) return
            const outcome = await submitForm(path, schemaHash, sendWith.current, value)
            // Refused as already sent is stored as surely as a 201: the first send of it was
            // (0169). The server's sentence says so, and the answers stay on the page.
            if (outcome.ok || outcome.error === 'submission_token_spent') finish()
            setSent(outcome.ok ? 'Submitted.' : outcome.message)
          }}
        />
      </FormancyProvider>

      <p className="wb-hint" aria-live="polite">
        {sent ?? saved ?? (readOnly ? 'This draft cannot be submitted.' : 'Saves two seconds after you stop typing.')}
      </p>
    </div>
  )
}

/** A field key is what the schema calls it; a label is what the form asked. */
function labelsOf(schema: FormSchema | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (fields: readonly { key: string; label?: unknown; fields?: readonly never[] }[]): void => {
    for (const field of fields) {
      if (typeof field.label === 'string') out[field.key] = field.label
      walk((field.fields ?? []) as never)
    }
  }
  walk((schema?.model.fields ?? []) as never)
  return out
}
