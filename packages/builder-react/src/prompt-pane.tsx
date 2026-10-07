import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import { applyProposal, authorForm, proposeEdit } from '@formancy/builder-core'
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
      <label htmlFor={inputId}>Describe the form, or the change you want</label>
      <textarea
        id={inputId}
        rows={3}
        value={instruction}
        disabled={busy}
        placeholder="A contact form with an email address and a message, and a phone number only if they ask to be called back"
        onChange={(event) => setInstruction(event.target.value)}
      />
      <button type="button" disabled={busy || instruction.trim() === ''} onClick={() => void run()}>
        {busy ? 'Writing…' : 'Write it'}
      </button>

      <p role="status" data-formancy-part="prompt-status">
        {statusOf({ busy, result, proposal, refusal })}
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
            {proposal.costsAnswers
              ? 'Review these changes — some affect answers already collected'
              : 'Review these changes'}
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
            Apply these changes
          </button>
          <button
            type="button"
            onClick={() => {
              setProposal(undefined)
              setRefusal(undefined)
              setResult(undefined)
            }}
          >
            Discard
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
              <summary>What the model last answered</summary>
              <pre>{result.lastAnswer}</pre>
            </details>
          )}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The one sentence the live region carries.
 *
 * Its own function because it is a four-way choice and inlining it put four
 * nested ternaries in the middle of the markup. The order matters: a refusal
 * is the most recent thing that happened and outranks the proposal still on
 * screen behind it.
 */
function statusOf({
  busy,
  result,
  proposal,
  refusal,
}: {
  busy: boolean
  result: AuthoringResult | undefined
  proposal: EditProposal | undefined
  refusal: string | undefined
}): string {
  if (busy) return 'Writing the form, and checking it.'
  if (refusal !== undefined) return `Not applied. ${refusal}`
  if (proposal !== undefined) {
    const count = proposal.changes.length
    const what = `${String(count)} change${count === 1 ? '' : 's'}`
    /* How many goes it took, when it took more than one. Worth saying rather
       than hiding: a model that needed correcting is one to read more
       carefully, and this is the moment somebody is deciding how closely. */
    const tries =
      result?.ok === true && result.attempts > 1 ? ` after ${String(result.attempts)} attempts` : ''
    return proposal.costsAnswers
      ? `Ready to review${tries}: ${what}, and some of them affect answers already collected. Nothing has been applied.`
      : `Ready to review${tries}: ${what}, none of which affect answers already collected. Nothing has been applied.`
  }
  if (result === undefined) return ''
  return result.ok
    ? ''
    : `Nothing was applied. ${String(result.attempts)} attempt(s), and the document still did not work.`
}
