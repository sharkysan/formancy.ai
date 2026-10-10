import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import {
  createDraftRun,
  draftExpectations,
  draftProblems,
  draftQuotes,
  draftStatus,
  draftVerdict,
  draftsOn,
} from '@formancy/builder-core'
import type { AskModel, BuilderSession, DraftRun } from '@formancy/builder-core'
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
 * may be kept, what the run says, what the engine makes of a draft and which form's drafts
 * a session is shown are `@formancy/builder-core`'s, so the Angular part cannot decide them
 * differently ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * **Whose run it is, is the host's to say.** Given `drafting`, from `createDraftRun`, the part
 * draws a run the host holds: it goes on when the part goes, and a part drawn over the same
 * form — a new session of it included — shows its drafts. Without one the part holds its own,
 * and ends it when it goes or is handed another session, as it always did
 * ([0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).
 *
 * `useSyncExternalStore` against the session's revision and the run, so a draft's verdict is
 * recomputed when the form changes and never stored.
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
  /**
   * The run, held by the host, from `createDraftRun`: it outlives this part. Absent, the part
   * holds its own, and ends it when it goes or is handed another session (0157, 0162).
   */
  drafting?: DraftRun | undefined
}

export function ScenarioDrafts({
  session,
  scenarios,
  onChange,
  ask,
  initialValue,
  mode,
  attempts,
  drafting,
}: ScenarioDraftsProps): ReactElement {
  const { text } = session
  const revision = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.revision(),
  )
  /*
   * The part's own run, for a host that gives none: the part's, and its session's. Another
   * session is another form to a part that holds its own (0162), so a new one ends the run
   * and forgets its drafts — the words typed stay — and so does the part going (0157). A run
   * the host gives is the host's, and nothing here ends it.
   */
  const [own] = useState(createDraftRun)
  useEffect(() => () => own.discard(), [own, session])
  const run = drafting ?? own

  const headingId = useId()
  const inputId = useId()
  const withheldId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const stopButton = useRef<HTMLButtonElement>(null)

  /**
   * Set when a run ends, and whether Stop had the focus then. Once the render has settled,
   * a focus with nowhere to be — on Stop, which leaves with it, or on the page's body, where
   * a relay's pane leaves it when its answer is taken — goes to the heading, so a keyboard
   * user is beside the drafts rather than at the top of the page. A focus somebody put
   * elsewhere stays there.
   */
  const ended = useRef<{ readonly onStop: boolean } | undefined>(undefined)
  /*
   * Read as the run says it ended, before React draws that: Stop is still in the document
   * then, and once it has gone the focus is already on <body>. The run ends in a promise this
   * part may never have awaited — another part's, or none's, pressed Draft.
   */
  const subscribe = useCallback(
    (listener: () => void) => {
      let waiting = draftsOn(run.state(), session).busy
      return run.subscribe(() => {
        const now = draftsOn(run.state(), session).busy
        if (waiting && !now) {
          ended.current = { onStop: stopButton.current !== null && document.activeElement === stopButton.current }
        }
        waiting = now
        listener()
      })
    },
    [run, session],
  )
  const state = useSyncExternalStore(subscribe, run.state, run.state)
  /** The run as this form shows it: itself, or only the words when it is about another. */
  const { intent, busy, result, drafts, note } = draftsOn(state, session)

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

  const write = (): void => {
    void run.draft(ask, session, { initialValue, existing: scenarios, attempts })
  }

  /** A draft leaves the list, the status says why, and the focus goes back to the heading. */
  const discard = (draft: Scenario): void => {
    run.discardDraft(draft)
    heading.current?.focus()
  }

  const keep = (draft: Scenario): void => {
    const kept = run.keep(draft, session, scenarios, options)
    if (kept?.ok !== true) return
    onChange(kept.scenarios)
    heading.current?.focus()
  }

  const problems = draftProblems(result, text)
  const quoted = draftQuotes(result)

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
        onChange={(event) => run.describe(event.target.value)}
      />
      <p id={withheldId} data-formancy-part="scenario-drafts-withheld">
        {text('drafts.withheld')}
      </p>
      <button type="button" disabled={busy || intent.trim() === ''} onClick={write}>
        {busy ? text('drafts.writing') : text('drafts.write')}
      </button>
      {busy ? (
        <button ref={stopButton} type="button" onClick={() => run.stop()}>
          {text('drafts.stop')}
        </button>
      ) : null}

      <p role="status" data-formancy-part="scenario-drafts-status">
        {draftStatus({ busy, result, note }, text)}
      </p>

      {quoted.declined === undefined ? null : (
        /* The model's words, quoted: text, never markup, whatever it wrote. */
        <blockquote data-formancy-part="scenario-drafts-declined">{quoted.declined}</blockquote>
      )}

      {problems.length === 0 ? null : (
        <div data-formancy-part="scenario-drafts-problems">
          <ul>
            {problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
          {quoted.lastAnswer === undefined ? null : (
            <details>
              <summary>{text('drafts.lastAnswer')}</summary>
              <pre>{quoted.lastAnswer}</pre>
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
                <button type="button" onClick={() => discard(draft)}>
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
