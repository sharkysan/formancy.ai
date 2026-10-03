import type { ReactElement } from 'react'
import { publishProblem } from './api.js'
import type { PublishResult } from './api.js'

/**
 * What a publish said, in one place for both panes.
 *
 * `publishProblem` already existed for the refusals, for the reason this
 * extends: both the schema editor and the builder render a `PublishResult`, so
 * a sentence written in one of them is a sentence the other says differently —
 * and the difference is invisible to anybody who only ever uses one tab. They
 * had already drifted. One said *"published as v4"* and the other
 * *"Published version 4."*, which is the same fact in two voices.
 *
 * **Warnings are the reason it is a component now rather than a function.** A
 * refused publish is one sentence; a successful one may be a sentence plus a
 * list, and a helper returning a string cannot say that without the callers
 * agreeing on how to split it again.
 */
export function PublishNote({ state }: { state: PublishResult | undefined }): ReactElement | null {
  if (state === undefined) return null

  if (!state.ok) {
    return <p className="wb-problem">{publishProblem(state)}</p>
  }

  return (
    <>
      <p className="wb-ok">Published version {state.version}.</p>
      {state.warnings.length === 0 ? null : (
        /*
         * `role="status"` and not `role="alert"`: the publish worked, and an
         * alert interrupts whatever a screen reader was reading to announce
         * something that is not an error. A status is announced politely, after
         * the current utterance.
         *
         * Not folded into the sentence above either. A warning about a rule
         * nobody will notice is exactly the thing that gets skimmed past when it
         * is appended to good news.
         *
         * Named, because the pane already has another `status` — the arrange
         * surface announces its drops through one — and a test asking for "the
         * status" would find whichever came first.
         */
        <div className="wb-warnings" role="status" aria-label="Publish warnings">
          <p>
            Published, with {state.warnings.length === 1 ? 'something' : 'things'} worth
            checking:
          </p>
          <ul>
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
