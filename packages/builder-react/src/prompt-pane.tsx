import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { createPromptRun, proposalHeading, proposalStatus } from '@formancy/builder-core'
import type { AskModel, BuilderSession, PromptRun } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'

/**
 * Describing a form in words, seeing what that did, and then deciding.
 *
 * It is not a box that pastes a model's answer into the editor. The answer is
 * parsed, validated against the spec's own schema, compiled by the real engine
 * and type-checked, and if any of that fails the model is told exactly what was
 * wrong and asked again ([0056](../../../docs/decisions/0056-agents-get-the-checks.md)).
 *
 * **And then it is shown rather than applied.** Valid is not the same as
 * wanted: a document passes every one of those checks with the condition
 * inverted that somebody asked to loosen, or with a field renamed whose
 * answers are already in a database. This pane used to apply the answer and
 * offer undo. Undo is the wrong shape — it puts a document back *after* the
 * change has been read, previewed, and in a shared session published by
 * somebody else
 * ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
 *
 * What the review shows is `diffSchemas`, the same function the publish check,
 * draft migration and the consumer CI gate read. One thing decides what
 * changed, rather than a review screen holding a second opinion.
 *
 * The host's model. `ask` is a prop, exactly as `Uploader` is a provider: this
 * package has no vendor, no key and no network call, and a self-hoster can
 * point it at something on their own hardware so that nothing about a form
 * leaves their network. Without the prop the pane does not render at all,
 * which is the honest way to show a feature nobody has configured.
 *
 * Everything slow or consequential is announced. One polite live region says
 * what is happening, what came back and what came of applying it: a spinner
 * alone tells a screen-reader user nothing, and a proposal that only appears
 * visually is one they never learn about.
 *
 * **A run can be stopped**, by the button while it waits. That ends it at once, tells
 * the host so it can abandon the request, and discards whatever the model says
 * afterwards ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)).
 *
 * **Whose run it is, is the host's to say.** Given `run`, from `createPromptRun`, the pane
 * draws a run the host holds: it goes on when the pane goes, and the pane drawn next — under
 * another tab, in the other builder — shows it waiting, or what it came to. Without one the
 * pane holds its own and stops it when it goes, as it always did
 * ([0163](../../../docs/decisions/0163-a-models-run-belongs-to-the-host.md)). Either way the
 * run, the proposal, Apply and Discard are `@formancy/builder-core`'s, so the Angular pane
 * cannot decide them differently; this is the markup, the focus and a subscription.
 *
 * **A model can decline**, when the format cannot express what was asked. The run
 * ends on that answer, and the pane shows the model's reason, as text, where the
 * problems would be ([0158](../../../docs/decisions/0158-a-model-may-decline.md)).
 *
 * **Given the form's examples, it runs them before Apply.** The review names the ones
 * the answer would stop holding, and those it would make hold again — the one check that
 * tells a rule written backwards from the rule asked for
 * ([0159](../../../docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).
 */

export interface PromptPaneProps {
  session: BuilderSession
  /**
   * How to reach a model. Absent means the feature is not configured, and the
   * pane renders nothing rather than a button that cannot work.
   */
  ask?: AskModel | undefined
  /** How many times to let the model correct itself. Three by default. */
  attempts?: number
  /**
   * The form's examples, as `ScenarioPane` takes them. Given, an answer is run against
   * them before it is shown, and the review names any that would stop holding. Absent,
   * the review says nothing about examples.
   */
  scenarios?: readonly Scenario[] | undefined
  /** Where every example starts — the form's sample, as `ScenarioPane` takes it. */
  initialValue?: Readonly<Record<string, unknown>> | undefined
  /** `client` by default; `server` is what the publish gate and the submission endpoint run. */
  mode?: 'client' | 'server'
  /**
   * The run, held by the host, from `createPromptRun`: it outlives this pane, and a pane
   * drawn over it later shows it as it is. Absent, the pane holds its own, and stops it
   * when it goes (0157).
   */
  run?: PromptRun | undefined
}

export function PromptPane({
  session,
  ask,
  attempts,
  scenarios,
  initialValue,
  mode,
  run: given,
}: PromptPaneProps): ReactElement | null {
  // Every word this pane shows, in the language the session was opened in (0114).
  const { text } = session
  /*
   * The pane's own run, for a host that gives none. It is the pane's, so it stops when the
   * pane goes: the host's request does not run on for an answer nothing will show (0157). A
   * run the host gives is the host's, and nothing here ends it.
   */
  const [own] = useState(createPromptRun)
  useEffect(() => () => own.stop(), [own])
  const run = given ?? own

  const writeButton = useRef<HTMLButtonElement>(null)
  const stopButton = useRef<HTMLButtonElement>(null)
  /**
   * Set when a run ends with focus on Stop. Stop is drawn only while a run waits,
   * so it leaves with the focus and focus falls to <body>; Write, where the run
   * began, takes it back once the render has enabled it again.
   */
  const refocus = useRef(false)
  /*
   * Asked as the run says it ended, before React draws that: Stop is still in the document
   * then, and once it has gone the focus is already on <body>. The run ends in a promise
   * the pane no longer awaits — it may be another pane's, or none's — so this is the one
   * moment every ending passes through.
   */
  const subscribe = useCallback(
    (listener: () => void) =>
      run.subscribe(() => {
        const button = stopButton.current
        if (!run.state().busy && button !== null && document.activeElement === button) refocus.current = true
        listener()
      }),
    [run],
  )
  const state = useSyncExternalStore(subscribe, run.state, run.state)
  const { instruction, busy, result, proposal } = state
  useEffect(() => {
    if (busy || !refocus.current) return
    refocus.current = false
    writeButton.current?.focus()
  }, [busy])

  const inputId = useId()
  const reviewId = useId()

  if (ask === undefined) return null

  /*
   * What a run that produced no document has to show beneath the status. A decline
   * shows the model's reason INSTEAD of the problems: what the checks said about an
   * earlier answer is about a document, and the model has said there is none to fix.
   */
  const failed = result?.ok === false ? result : undefined
  const declined = failed?.ended === 'declined' ? failed.reason : undefined
  const problems =
    failed !== undefined && failed.ended !== 'declined' && failed.problems.length > 0 ? failed : undefined

  const write = (): void => {
    // The examples in force with the document the answer is for, taken together.
    const examples = scenarios === undefined ? undefined : { scenarios, initialValue, mode }
    void run.write(ask, session, { examples, attempts })
  }

  return (
    <section data-formancy-part="prompt-pane">
      <label htmlFor={inputId}>{text('prompt.label')}</label>
      <textarea
        id={inputId}
        rows={3}
        value={instruction}
        disabled={busy}
        placeholder={text('prompt.example')}
        onChange={(event) => run.instruct(event.target.value)}
      />
      <button
        ref={writeButton}
        type="button"
        disabled={busy || instruction.trim() === ''}
        onClick={write}
      >
        {busy ? text('prompt.writing') : text('prompt.write')}
      </button>
      {busy ? (
        <button ref={stopButton} type="button" onClick={() => run.stop()}>
          {text('prompt.stop')}
        </button>
      ) : null}

      <p role="status" data-formancy-part="prompt-status">
        {proposalStatus(state, text)}
      </p>

      {proposal === undefined ? null : (
        <section
          data-formancy-part="prompt-review"
          aria-labelledby={reviewId}
          /* A real heading and a real region: this is the thing being decided
             on, and it has to be reachable as one rather than as loose text
             after a status message. */
        >
          <h3 id={reviewId}>{proposalHeading(proposal, text)}</h3>
          <ul data-formancy-part="prompt-changes">
            {proposal.changes.map((change) => (
              <li key={`${change.kind}:${change.path}`} data-severity={change.severity}>
                {/* The path and the sentence. The kind is for machines; a
                    person reading this wants to know what it costs them. */}
                <code>{change.path}</code> — {change.detail}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => run.apply(session)}>
            {text('prompt.apply')}
          </button>
          <button type="button" onClick={() => run.discard()}>
            {text('prompt.discard')}
          </button>
        </section>
      )}

      {declined === undefined ? null : (
        /* The model's words, quoted: text, never markup, whatever it wrote. */
        <blockquote data-formancy-part="prompt-declined">{declined}</blockquote>
      )}

      {problems === undefined ? null : (
        <div data-formancy-part="prompt-problems">
          {/* What was actually wrong, not "something went wrong". The person
              reading this can usually fix it by rewording one sentence. */}
          <ul>
            {problems.problems.map((problem, index) => (
              <li key={index}>{problem.detail}</li>
            ))}
          </ul>
          {problems.lastAnswer === '' ? null : (
            <details>
              <summary>{text('prompt.lastAnswer')}</summary>
              <pre>{problems.lastAnswer}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
