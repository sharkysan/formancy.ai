import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import { applyProposal, authorForm, proposalStatus, proposeEdit } from '@formancy/builder-core'
import type {
  AskModel,
  AuthoringResult,
  BuilderSession,
  EditProposal,
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

  if (ask === undefined) return null

  const run = async (): Promise<void> => {
    if (instruction.trim() === '' || busy) return
    setBusy(true)
    setResult(undefined)
    setProposal(undefined)
    setRefusal(undefined)
    try {
      const current = session.document()
      const outcome = await authorForm(ask, instruction, {
        // The document being edited, so "add a phone number" is a change
        // rather than a new form written from nothing.
        current,
        ...(attempts === undefined ? {} : { attempts }),
      })
      setResult(outcome)
      // Held against the document it was written for. Applying later checks
      // that the form has not moved in the meantime.
      if (outcome.ok) setProposal(proposeEdit(current, outcome.document))
    } catch (error) {
      // The host's model threw: a network failure, a rate limit, a missing
      // key. Said out loud, because a button that silently does nothing is
      // the worst version of this.
      setResult({
        ok: false,
        attempts: 0,
        problems: [
          { kind: 'not-json', detail: error instanceof Error ? error.message : String(error) },
        ],
        lastAnswer: '',
      })
    } finally {
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

      <p role="status" data-formancy-part="prompt-status">
        {proposalStatus(
          {
            busy,
            attempts: result?.attempts,
            failed: result !== undefined && !result.ok,
            proposal,
            refusal,
          },
          text,
        )}
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

      {result !== undefined && !result.ok ? (
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
