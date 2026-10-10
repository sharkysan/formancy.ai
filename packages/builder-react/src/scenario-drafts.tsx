import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import {
  createStop,
  draftExpectations,
  draftProblems,
  draftScenarios,
  draftStatus,
  draftVerdict,
  keepDraft,
} from '@formancy/builder-core'
import type { AskModel, BuilderSession, DraftNote, Drafted, Stop } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'

/**
 * Examples drafted by a model from what the author says the form should do, judged by the
 * engine, and kept one at a time.
 *
 * Drawn inside `ScenarioPane` when the host gives it a model and a way to keep what is
 * kept. The model is shown the form's fields and the author's words, never its rules —
 * a model shown the rule writes an example that agrees with it — and every draft is run
 * against the form as it is, now and after every edit, with the verdict the panel will
 * give once it is kept
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 *
 * **Nothing reaches the host until Keep.** A draft that fails can be kept: that failure
 * is the question — is the example wrong, or the form? — and the person answers it. What
 * may be kept, what the run says and what the engine makes of a draft are
 * `@formancy/builder-core`'s, so the Angular part cannot decide them differently
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * `useSyncExternalStore` against the session's revision, so a draft's verdict is recomputed
 * when the form changes and never stored.
 */
export interface ScenarioDraftsProps {
  session: BuilderSession
  /** The form's examples as the host holds them: their names are taken, and Keep adds to them. */
  scenarios: readonly Scenario[]
  /** Called with the longer list when a draft is kept. Nothing else calls it. */
  onChange: (next: readonly Scenario[]) => void
  /** The host's model, as `PromptPane` takes it — a relay, on a page that may not call one. */
  ask: AskModel
  /** Where every example starts — the form's sample, as `ScenarioPane` takes it. */
  initialValue?: Readonly<Record<string, unknown>> | undefined
  /** `client` by default, as `ScenarioPane` takes it. */
  mode?: 'client' | 'server'
  /** How many times to ask. Three by default. */
  attempts?: number
}

/** What a run came to, and the session it was over. */
interface Held {
  readonly session: BuilderSession
  readonly result: Drafted
  readonly drafts: readonly Scenario[]
  /** What the last Keep or Discard did. */
  readonly note: DraftNote | undefined
}

/** No drafts, as one constant, so the verdicts are not recomputed for a new empty list. */
const NO_DRAFTS: readonly Scenario[] = []

export function ScenarioDrafts({
  session,
  scenarios,
  onChange,
  ask,
  initialValue,
  mode,
  attempts,
}: ScenarioDraftsProps): ReactElement {
  const { text } = session
  const revision = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.revision(),
  )
  const [intent, setIntent] = useState('')
  const [busy, setBusy] = useState(false)
  /*
   * What the last run came to, tagged with the session it was over. Another session is
   * another form: a host that keeps the pane and opens another document must not be
   * offered the last one's drafts to keep into the new one's list. Read through the tag
   * rather than reset by an effect copying state into state.
   */
  const [held, setHeld] = useState<Held | undefined>(undefined)
  const mine = held?.session === session ? held : undefined
  const result = mine?.result
  /** The drafts still waiting: each one leaves on Keep or Discard. */
  const drafts = mine?.drafts ?? NO_DRAFTS
  const note = mine?.note
  const headingId = useId()
  const inputId = useId()
  const withheldId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const stopButton = useRef<HTMLButtonElement>(null)
  /** The stop for the run in flight. A ref: pressing it changes nothing on screen by itself. */
  const running = useRef<Stop | undefined>(undefined)
  // A part taken off the screen stops its run, and so does another session: a relay is
  // not left holding a turn about a form nobody is looking at (0157).
  useEffect(() => () => running.current?.stop(), [session])

  /**
   * Set when a run ends, and whether Stop had the focus then. Once the render has settled,
   * a focus with nowhere to be — on Stop, which leaves with it, or on the page's body, where
   * a relay's pane leaves it when its answer is taken — goes to the heading, so a keyboard
   * user is beside the drafts rather than at the top of the page. A focus somebody put
   * elsewhere stays there.
   */
  const ended = useRef<{ readonly onStop: boolean } | undefined>(undefined)
  useEffect(() => {
    const just = ended.current
    if (busy || just === undefined) return
    ended.current = undefined
    if (just.onStop || document.activeElement === document.body) heading.current?.focus()
  }, [busy])

  const options = useMemo(
    () => ({
      ...(initialValue === undefined ? {} : { initialValue }),
      ...(mode === undefined ? {} : { mode }),
    }),
    [initialValue, mode],
  )
  const verdicts = useMemo(
    () => drafts.map((draft) => draftVerdict(session.document(), draft, options)),
    // `revision` is what says the document changed, as in `ScenarioPane`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, session, options, revision],
  )

  const run = async (): Promise<void> => {
    if (intent.trim() === '' || busy) return
    setBusy(true)
    setHeld(undefined)
    const stop = createStop()
    running.current = stop
    try {
      const outcome = await draftScenarios(ask, session.document(), intent, {
        initialValue,
        existing: scenarios,
        stop,
        attempts,
      })
      setHeld({ session, result: outcome, drafts: outcome.ok ? outcome.drafts : [], note: undefined })
    } finally {
      // Read while Stop is still drawn: once it has gone, the focus is already on <body>.
      ended.current = { onStop: stopButton.current !== null && document.activeElement === stopButton.current }
      running.current = undefined
      setBusy(false)
    }
  }

  /** A draft leaves the list, the status says why, and the focus goes back to the heading. */
  const done = (draft: Scenario, kind: 'kept' | 'discarded'): void => {
    setHeld(
      (before) =>
        before && {
          ...before,
          drafts: before.drafts.filter((one) => one !== draft),
          note: { kind, name: draft.name },
        },
    )
    heading.current?.focus()
  }

  const keep = (draft: Scenario): void => {
    const kept = keepDraft(session.document(), scenarios, draft, options)
    if (!kept.ok) {
      setHeld((before) => before && { ...before, note: { kind: 'refused', why: kept.refused, name: draft.name } })
      return
    }
    onChange(kept.scenarios)
    done(draft, 'kept')
  }

  const failed = result?.ok === false ? result : undefined
  const problems = draftProblems(result, text)

  return (
    <section data-formancy-part="scenario-drafts" aria-labelledby={headingId}>
      <h3 id={headingId} ref={heading} tabIndex={-1}>
        {text('drafts.title')}
      </h3>
      <label htmlFor={inputId}>{text('drafts.label')}</label>
      <textarea
        id={inputId}
        rows={3}
        value={intent}
        disabled={busy}
        placeholder={text('drafts.example')}
        aria-describedby={withheldId}
        onChange={(event) => setIntent(event.target.value)}
      />
      <p id={withheldId} data-formancy-part="scenario-drafts-withheld">
        {text('drafts.withheld')}
      </p>
      <button type="button" disabled={busy || intent.trim() === ''} onClick={() => void run()}>
        {busy ? text('drafts.writing') : text('drafts.write')}
      </button>
      {busy ? (
        <button ref={stopButton} type="button" onClick={() => running.current?.stop()}>
          {text('drafts.stop')}
        </button>
      ) : null}

      <p role="status" data-formancy-part="scenario-drafts-status">
        {draftStatus({ busy, result, note }, text)}
      </p>

      {failed?.ended === 'declined' && failed.reason !== undefined ? (
        /* The model's words, quoted: text, never markup, whatever it wrote. */
        <blockquote data-formancy-part="scenario-drafts-declined">{failed.reason}</blockquote>
      ) : null}

      {problems.length === 0 ? null : (
        <div data-formancy-part="scenario-drafts-problems">
          <ul>
            {problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
          {failed === undefined || failed.ended !== 'gave-up' || failed.lastAnswer === '' ? null : (
            <details>
              <summary>{text('drafts.lastAnswer')}</summary>
              <pre>{failed.lastAnswer}</pre>
            </details>
          )}
        </div>
      )}

      {drafts.length === 0 ? null : (
        <ul data-formancy-part="scenario-drafts-list" aria-label={text('drafts.list')}>
          {drafts.map((draft, index) => {
            const verdict = verdicts[index]!
            return (
              <li key={draft.name} data-passed={verdict.passed}>
                <strong>{draft.name}</strong>
                {draft.because === undefined ? null : <p>{draft.because}</p>}
                {/* What it sets and what it expects, as the model wrote it: the part a person
                    reads to decide whether the example is right. */}
                <pre>{draftExpectations(draft)}</pre>
                <p>{text(verdict.passed ? 'drafts.holds' : 'drafts.fails')}</p>
                {verdict.failures.length === 0 ? null : (
                  <ul>
                    {verdict.failures.map((failure, at) => (
                      // The engine's words, as the scenario panel shows them after Keep.
                      <li key={at} data-about={failure.about}>
                        {failure.detail}
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => keep(draft)}>
                  {text('drafts.keep', { name: draft.name })}
                </button>
                <button type="button" onClick={() => done(draft, 'discarded')}>
                  {text('drafts.discard', { name: draft.name })}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
