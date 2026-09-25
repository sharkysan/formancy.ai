import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import { authorForm } from '@formancy/builder-core'
import type { AskModel, AuthoringResult, BuilderSession } from '@formancy/builder-core'

/**
 * Describing a form in words, and getting one that works.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * It is not a box that pastes a model's answer into the editor. The answer is
 * parsed, validated against the spec's own schema and type-checked, and if any
 * of that fails the model is told exactly what was wrong and asked again.
 * Nothing reaches the document until it would actually work
 * ([0056](../../../docs/decisions/0056-agents-get-the-checks.md)).
 *
 * So the two outcomes are: a form that is valid by construction, or a refusal
 * that says what was tried and what the model last said. There is deliberately
 * no third outcome where something plausible lands in the editor and somebody
 * finds out at the first submission that the conditional is inverted.
 *
 * ── WHOSE MODEL ─────────────────────────────────────────────────────────────
 *
 * The host's. `ask` is a prop, exactly as `Uploader` is a provider: this
 * package has no vendor, no key and no network call, and a self-hoster can
 * point it at something on their own hardware so that nothing about a form
 * leaves their network. Without the prop the pane does not render at all,
 * which is the honest way to show a feature nobody has configured.
 *
 * ── ACCESSIBILITY ───────────────────────────────────────────────────────────
 *
 * The work happens after a press and takes seconds, so it is announced: one
 * polite live region says what is happening and what came of it. A spinner
 * alone tells a screen-reader user nothing, and a result that only appears
 * visually is a result they never learn about.
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
  const inputId = useId()

  if (ask === undefined) return null

  const run = async (): Promise<void> => {
    if (instruction.trim() === '' || busy) return
    setBusy(true)
    setResult(undefined)
    try {
      const outcome = await authorForm(ask, instruction, {
        // The document being edited, so "add a phone number" is a change
        // rather than a new form written from nothing.
        current: session.document(),
        ...(attempts === undefined ? {} : { attempts }),
      })
      setResult(outcome)
      if (outcome.ok) {
        // One undoable step. Ctrl+Z puts back what was there, which is the
        // only behaviour anybody would expect of a button like this.
        const applied = session.replaceDocument(outcome.document)
        if (!applied.ok) {
          setResult({
            ok: false,
            attempts: outcome.attempts,
            problems: [{ kind: 'invalid-document', detail: applied.message }],
            lastAnswer: '',
          })
        }
      }
    } catch (error) {
      // The host's model threw: a network failure, a rate limit, a missing
      // key. Said out loud, because a button that silently does nothing is
      // the worst version of this.
      setResult({
        ok: false,
        attempts: 0,
        problems: [
          {
            kind: 'not-json',
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
        lastAnswer: '',
      })
    } finally {
      setBusy(false)
    }
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

      {/* One region, polite: the work takes seconds and a spinner alone tells
          a screen-reader user nothing about what came of it. */}
      <p role="status" data-formancy-part="prompt-status">
        {busy
          ? 'Writing the form, and checking it.'
          : result === undefined
            ? ''
            : result.ok
              ? `Done${result.attempts > 1 ? ` after ${String(result.attempts)} attempts` : ''}. The form below is valid and every expression type-checks.`
              : `Nothing was applied. ${String(result.attempts)} attempt(s), and the document still did not work.`}
      </p>

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
