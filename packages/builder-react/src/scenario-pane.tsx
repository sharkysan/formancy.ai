import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { comparedToLastRun, createRunHistory, scenarioStatus } from '@formancy/builder-core'
import { runScenarios } from '@formancy/core'
import type { BuilderSession } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'

/**
 * What this form is supposed to do, run against what it does now.
 *
 * A condition type-checks and is still the wrong business rule:
 * `leaveType == 'other'` and `leaveType != 'other'` both compile, both satisfy
 * every gate this product has, and one of them asks a question nobody should
 * be asked. Nothing that reads the document can tell them apart, because the
 * difference is between the document and what somebody meant
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 *
 * So this pane runs examples with their answers written down, after every
 * edit, and says **which ones stopped holding**. Not how many fail: a standing
 * total is a number somebody reads once. What was holding before you touched
 * this and is not now is the sentence that gets acted on, and the repairs are
 * reported beside it so a panel is not only ever bad news.
 *
 * **The scenarios are the host's.** They arrive as a prop and changes go back
 * out through `onChange`, exactly as `ask` and the uploader do: this package
 * decides nothing about where they are kept, and a host putting them in a
 * `.scenarios.json` beside the form gets a CI gate out of the same file. With
 * none given the pane renders nothing rather than an empty table.
 *
 * `useSyncExternalStore` against the session's revision, which is this
 * repository's ordinary way of reading a store — not a `useEffect` copying
 * state into state.
 */

export interface ScenarioPaneProps {
  session: BuilderSession
  /** Held by the host. Absent means the feature is not configured. */
  scenarios?: readonly Scenario[] | undefined
  /** Called when somebody removes one. Absent makes the list read-only. */
  onChange?: ((next: readonly Scenario[]) => void) | undefined
  /**
   * Where every scenario starts — the templates' `sample`, by another name.
   *
   * Not optional in practice for any real form: a document with required
   * fields is invalid before a scenario has set anything, so every scenario
   * would report the same six `required` errors and none of them would be
   * about what the scenario is for. Found by pointing this pane at the
   * playground's own starter.
   */
  initialValue?: Readonly<Record<string, unknown>> | undefined
  /**
   * `client` by default. `server` is what the publish gate and the submission
   * endpoint run, and a form that behaves differently in the two is the drift
   * this product exists to prevent — so it is worth being able to ask.
   */
  mode?: 'client' | 'server'
}

export function ScenarioPane({
  session,
  scenarios,
  onChange,
  initialValue,
  mode,
}: ScenarioPaneProps): ReactElement | null {
  const revision = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.revision(),
  )

  const results = useMemo(
    () =>
      scenarios === undefined
        ? []
        : runScenarios(session.document(), scenarios, {
            ...(initialValue === undefined ? {} : { initialValue }),
            ...(mode === undefined ? {} : { mode }),
          }),
    // `revision` is the dependency that means "the document changed". Reading
    // it here rather than the document itself is what makes the rerun happen
    // on an edit and not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, scenarios, initialValue, mode, revision],
  )

  /*
   * The previous run, and the session it was over, held by one history for the pane's
   * life rather than in state.
   *
   * It is not rendered on its own and setting it would schedule a second
   * render after every edit, which is a re-render per keystroke on a panel
   * sitting beside a form somebody is typing into. A run over another session is
   * compared with nothing: that is another document, not an edit of this one.
   */
  const [history] = useState(createRunHistory)
  const [change, setChange] = useState(() => comparedToLastRun(undefined, []))
  useEffect(() => {
    setChange(history.compare(session, results))
  }, [history, session, results])

  if (scenarios === undefined) return null

  const failing = results.filter((result) => !result.passed)

  return (
    <section data-formancy-part="scenario-pane" aria-label={session.text('scenarios.label')}>
      {/* One polite region. A regression that only appears visually is one a
          screen-reader user learns about by submitting a broken form. */}
      <p role="status" data-formancy-part="scenario-status">
        {scenarioStatus(results.length, failing.length, change, session.text)}
      </p>

      {results.length === 0 ? (
        <p data-formancy-part="scenario-empty">{session.text('scenarios.empty')}</p>
      ) : (
        <ul data-formancy-part="scenario-list">
          {results.map((result) => (
            <li
              key={result.name}
              data-passed={result.passed}
              data-regressed={change.regressions.includes(result.name)}
            >
              <strong>{result.name}</strong>
              {result.failures.length === 0 ? null : (
                <ul>
                  {result.failures.map((failure, index) => (
                    // What was expected and what happened. "Failed" sends
                    // somebody back to the document to work out which rule.
                    <li key={index} data-about={failure.about}>
                      {failure.detail}
                    </li>
                  ))}
                </ul>
              )}
              {onChange === undefined ? null : (
                <button
                  type="button"
                  onClick={() => onChange(scenarios.filter((one) => one.name !== result.name))}
                >
                  {session.text('scenarios.remove', { name: result.name })}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
