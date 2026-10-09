import type { ReactElement } from 'react'
import { explainRule, rulesOverview } from '@formancy/builder-core'
import type { BuilderSession, Capabilities } from '@formancy/builder-core'
import { useBuilder } from './use-builder.js'

export interface RulesOverviewProps {
  session: BuilderSession
  /**
   * The answers a preview holds, if the host has one. Given, each rule says what it
   * does with them now and why; absent, the overview lists the rules alone.
   */
  answers?: Readonly<Record<string, unknown>> | undefined
  /**
   * The clock the preview uses, so a rule reading today's date is explained by the
   * date the preview used. Needed with `answers`; the host's, never this package's.
   */
  capabilities?: Capabilities | undefined
}

/**
 * Every rule in the form, in words, grouped by the field or page it is about — and,
 * given a preview's answers, why each field is shown, hidden, required or not now.
 *
 * What it says is `@formancy/builder-core`'s, for this overview and the Angular one
 * ([0128](../../../docs/decisions/0128-a-form-says-why-a-field-is-hidden.md)); this
 * draws it. Not a live region: the verdicts change with every keystroke in the
 * preview, and announcing each would be a running commentary nobody asked for.
 */
export function RulesOverview({
  session,
  answers,
  capabilities,
}: RulesOverviewProps): ReactElement {
  const view = useBuilder(session)
  const { text } = session
  const groups = rulesOverview(view.document, text)
  const rules = view.document.logic?.rules ?? []

  return (
    <section data-formancy-part="rules-overview" aria-label={text('overview.heading')}>
      <h3>{text('overview.heading')}</h3>
      {groups.length === 0 ? (
        <p data-formancy-part="rules-overview-empty">{text('overview.empty')}</p>
      ) : (
        <ul data-formancy-part="rules-overview-list">
          {groups.map((group) => (
            <li key={group.target} data-formancy-part="rules-overview-target">
              <h4>{group.targetLabel}</h4>
              <ul>
                {group.rules.map((summary) => {
                  const rule = rules[summary.index]
                  const verdict =
                    rule === undefined || answers === undefined || capabilities === undefined
                      ? undefined
                      : explainRule(rule, view.document, answers, text, capabilities)
                  return (
                    <li key={summary.index} data-formancy-part="rules-overview-rule">
                      <span data-formancy-part="logic-kind">{summary.kindLabel}</span>{' '}
                      {summary.sentence ?? (
                        <>
                          {text('overview.written')} <code>{summary.written}</code>
                        </>
                      )}
                      {verdict === undefined ? null : (
                        <div data-formancy-part="rules-overview-now" data-outcome={verdict.outcome}>
                          <p>{verdict.effect}</p>
                          {verdict.because.length === 0 ? null : (
                            <ul>
                              {verdict.because.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
