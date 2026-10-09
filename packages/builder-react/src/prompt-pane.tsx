import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  applyProposal,
  authorForm,
  createStop,
  proposalStatus,
  proposeEdit,
} from '@formancy/builder-core'
import type {
  AskModel,
  AuthoringResult,
  BuilderSession,
  EditProposal,
  Stop,
} from '@formancy/builder-core'

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
 * **A run can be stopped**, by the button while it waits and by the pane going
 * away. Either ends it at once, tells the host so it can abandon the request,
 * and discards whatever the model says afterwards
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)).
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
}

export function PromptPane({ session, ask, attempts }: PromptPaneProps): ReactElement | null {
  // Every word this pane shows, in the language the session was opened in (0114).
  const { text } = session
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AuthoringResult | undefined>(undefined)
  const [proposal, setProposal] = useState<EditProposal | undefined>(undefined)
  /** What applying said, when it refused. Cleared by anything that moves on. */
  const [refusal, setRefusal] = useState<string | undefined>(undefined)
  const inputId = useId()
  const reviewId = useId()
  /**
   * The stop for the run in flight, if one is. A ref, not state: pressing it
   * changes nothing on screen by itself — the run ending does, through `busy`.
   */
  const running = useRef<Stop | undefined>(undefined)

  // A pane taken off the screen stops its run, so the host's request does not
  // run on for an answer nothing will show. The run in flight when it goes, read
  // at that moment — which is why it is a ref the cleanup reads late.
  useEffect(() => () => running.current?.stop(), [])

  if (ask === undefined) return null

  const run = async (): Promise<void> => {
    if (instruction.trim() === '' || busy) return
    setBusy(true)
    setResult(undefined)
    setProposal(undefined)
    setRefusal(undefined)
    const stop = createStop()
    running.current = stop
    try {
      const current = session.document()
      // Resolves however the run ends — a host's model that threw included, which
      // it reports as unreachable with the host's reason rather than as a document
      // that failed.
      const outcome = await authorForm(ask, instruction, {
        // The document being edited, so "add a phone number" is a change
        // rather than a new form written from nothing.
        current,
        stop,
        ...(attempts === undefined ? {} : { attempts }),
      })
      setResult(outcome)
      // Held against the document it was written for. Applying later checks
      // that the form has not moved in the meantime.
      if (outcome.ok) setProposal(proposeEdit(current, outcome.document))
    } finally {
      running.current = undefined
      setBusy(false)
    }
  }

  const apply = (): void => {
    if (proposal === undefined) return
    const outcome = applyProposal(session, proposal)
    if (outcome.ok) {
      setProposal(undefined)
      setRefusal(undefined)
      setResult(undefined)
      setInstruction('')
      return
    }
    // Kept on screen. The commonest refusal is "the form changed since this
    // was proposed", and throwing the proposal away would lose the one thing
    // the person needs in order to ask again.
    setRefusal(outcome.message)
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
        onChange={(event) => setInstruction(event.target.value)}
      />
      <button type="button" disabled={busy || instruction.trim() === ''} onClick={() => void run()}>
        {busy ? text('prompt.writing') : text('prompt.write')}
      </button>
      {busy ? (
        <button type="button" onClick={() => running.current?.stop()}>
          {text('prompt.stop')}
        </button>
      ) : null}

      <p role="status" data-formancy-part="prompt-status">
        {proposalStatus({ busy, result, proposal, refusal }, text)}
      </p>

      {proposal === undefined ? null : (
        <section
          data-formancy-part="prompt-review"
          aria-labelledby={reviewId}
          /* A real heading and a real region: this is the thing being decided
             on, and it has to be reachable as one rather than as loose text
             after a status message. */
        >
          <h3 id={reviewId}>
            {text(proposal.costsAnswers ? 'prompt.review.costs' : 'prompt.review')}
          </h3>
          <ul data-formancy-part="prompt-changes">
            {proposal.changes.map((change) => (
              <li key={`${change.kind}:${change.path}`} data-severity={change.severity}>
                {/* The path and the sentence. The kind is for machines; a
                    person reading this wants to know what it costs them. */}
                <code>{change.path}</code> — {change.detail}
              </li>
            ))}
          </ul>
          <button type="button" onClick={apply}>
            {text('prompt.apply')}
          </button>
          <button
            type="button"
            onClick={() => {
              setProposal(undefined)
              setRefusal(undefined)
              setResult(undefined)
            }}
          >
            {text('prompt.discard')}
          </button>
        </section>
      )}

      {result !== undefined && !result.ok && result.problems.length > 0 ? (
        <div data-formancy-part="prompt-problems">
          {/* What was actually wrong, not "something went wrong". The person
              reading this can usually fix it by rewording one sentence. */}
          <ul>
            {result.problems.map((problem, index) => (
              <li key={index}>{problem.detail}</li>
            ))}
          </ul>
          {result.lastAnswer === '' ? null : (
            <details>
              <summary>{text('prompt.lastAnswer')}</summary>
              <pre>{result.lastAnswer}</pre>
            </details>
          )}
        </div>
      ) : null}
    </section>
  )
}
