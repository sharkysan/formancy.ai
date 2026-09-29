import { useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import type { LogicRule } from '@formancy/spec'
import {
  OPERATORS,
  RULE_KIND_CHOICES,
  composeRule,
  draftIsComplete,
  emptyRow,
  kindWrites,
  nameOf,
  rowTakesValue,
  ruleKindsFor,
  ruleTargetFor,
} from '@formancy/builder-core'
import type { ConditionGroup, ConditionRow, Operator } from '@formancy/builder-core'
import { compileGroup, conditionOf } from '@formancy/builder-core'
import { useBuilder } from './use-builder.js'

/**
 * Authoring the rules that make a form behave.
 *
 * A condition is edited as a condition — "Country is Switzerland" — and
 * compiled to CEL. The CEL is the single source of truth for evaluation and
 * the structured form is stored beside it as `editor` metadata, never
 * evaluated. If both were evaluable, client and server could disagree about
 * which one meant what, which is the drift this project exists to prevent.
 *
 * The generated expression is shown rather than hidden. A form author does not
 * have to read it, and a developer should not have to guess it.
 */

export interface LogicPanelProps {
  session: BuilderSession
  /** The field the rules are about. */
  keyPath: readonly string[]
}

export function LogicPanel({ session, keyPath }: LogicPanelProps): ReactElement {
  const view = useBuilder(session)
  const [drafting, setDrafting] = useState(false)

  // Both halves come from the core, so the two builders cannot address a rule
  // differently: the DATA path for a field, the KEY for a page.
  const { target: ruleTarget, on } = ruleTargetFor(view.document, keyPath)
  const target = ruleTarget
  const rules = view.document.logic?.rules ?? []
  // Index within the whole list, because removeRule takes one.
  const mine = rules
    .map((rule, index) => ({ rule, index }))
    .filter((entry) => entry.rule.target === ruleTarget)

  return (
    <div data-formancy-part="logic-panel">
      <h3>Rules</h3>

      {mine.length === 0 ? (
        <p data-formancy-part="logic-empty">This field always behaves the same way.</p>
      ) : (
        <ul data-formancy-part="logic-list">
          {mine.map(({ rule, index }) => (
            <li key={index} data-formancy-part="logic-rule">
              <span data-formancy-part="logic-kind">
                {RULE_KIND_CHOICES.find((kind) => kind.id === rule.kind)?.label ?? rule.kind}
              </span>
              {/* The expression, shown. A developer should not have to guess
                  what the condition compiled to. */}
              <code>{rule.cel}</code>
              <button
                type="button"
                aria-label={`Remove the ${rule.kind} rule on ${target}`}
                onClick={() => session.removeRule(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {drafting ? (
        <RuleDraft
          on={on}
          target={ruleTarget}
          fields={view.nodes
            .filter((candidate) => !candidate.isContainer)
            .map((candidate) => ({
              path: candidate.keyPath.join('.'),
              label: nameOf(view.document, candidate.def),
            }))}
          onCancel={() => setDrafting(false)}
          onAdd={(rule) => {
            setDrafting(false)
            session.addRule(rule)
          }}
        />
      ) : (
        <button type="button" onClick={() => setDrafting(true)}>
          Add a rule
        </button>
      )}
    </div>
  )
}

function RuleDraft({
  on,
  target,
  fields,
  onAdd,
  onCancel,
}: {
  /** Whether the rules being written are about a page or a field. */
  on: 'field' | 'page'
  /** What the rule will be addressed by, decided by the core. */
  target: string
  fields: ReadonlyArray<{ path: string; label: string }>
  onAdd: (rule: LogicRule) => void
  onCancel: () => void
}): ReactElement {
  const applicable = ruleKindsFor(on)
  const [kind, setKind] = useState<LogicRule['kind']>(applicable[0]?.id ?? 'visible')
  const [check, setCheck] = useState('')
  const writes = kindWrites(kind)
  const carriesCondition = writes === 'condition'
  const [expression, setExpression] = useState('')
  const [join, setJoin] = useState<ConditionGroup['join']>('all')
  /**
   * One row per comparison.
   *
   * Flat, because a group cannot nest -- see `ConditionGroup`. The text is kept
   * per row rather than the narrowed value, so what somebody typed survives
   * switching the comparison to one that takes no value and back.
   */
  const [rows, setRows] = useState<readonly ConditionRow[]>([emptyRow(fields[0]?.path ?? '')])

  const hint = RULE_KIND_CHOICES.find((candidate) => candidate.id === kind)?.hint ?? ''

  const group: ConditionGroup = { join, conditions: rows.map(conditionOf) }

  const update = (at: number, change: Partial<(typeof rows)[number]>): void => {
    setRows((before) => before.map((row, index) => (index === at ? { ...row, ...change } : row)))
  }

  // Numbered from 1, and only when there is more than one: "Field 1" on a form
  // with a single comparison is a number somebody has to wonder about.
  const suffix = (at: number): string => (rows.length > 1 ? ` ${String(at + 1)}` : '')

  return (
    <div data-formancy-part="logic-draft">
      <label>
        What the rule does
        <select value={kind} onChange={(event) => setKind(event.target.value as LogicRule['kind'])}>
          {applicable.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>

      {writes !== 'check' ? null : (
        <label>
          Which check
          <input
            type="text"
            value={check}
            onChange={(event) => setCheck(event.target.value)}
            placeholder="email-not-taken"
          />
        </label>
      )}

      {carriesCondition ? (
        <>
      {/* Only once there is something to join. A control that does nothing is a
          control somebody has to work out is irrelevant. */}
      {rows.length > 1 ? (
        <label>
          Match
          <select
            value={join}
            onChange={(event) => setJoin(event.target.value as ConditionGroup['join'])}
          >
            <option value="all">all of these</option>
            <option value="any">any of these</option>
          </select>
        </label>
      ) : null}

      {rows.map((row, at) => {
        const takesValue = rowTakesValue(row)
        return (
          <div key={at} data-formancy-part="logic-comparison">
            <label>
              {`Field${suffix(at)}`}
              <select value={row.field} onChange={(event) => update(at, { field: event.target.value })}>
                {fields.map((candidate) => (
                  <option key={candidate.path} value={candidate.path}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {`Comparison${suffix(at)}`}
              <select
                value={row.operator}
                onChange={(event) => update(at, { operator: event.target.value as Operator })}
              >
                {OPERATORS.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </label>

            {takesValue ? (
              <label>
                {`Value${suffix(at)}`}
                <input
                  type="text"
                  value={row.text}
                  onChange={(event) => update(at, { text: event.target.value })}
                />
              </label>
            ) : null}

            {/* The first one has no remove button: compileGroup refuses an empty
                group rather than compiling to an expression that always passes,
                so the UI must not be able to ask for one. */}
            {at === 0 ? null : (
              <button
                type="button"
                onClick={() => setRows((before) => before.filter((_, index) => index !== at))}
              >
                {`Remove comparison ${String(at + 1)}`}
              </button>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={() =>
          setRows((before) => [
            ...before,
            emptyRow(fields[0]?.path ?? ''),
          ])
        }
      >
        Add a comparison
      </button>

        <p data-formancy-part="logic-hint">{hint}</p>

          {/* Shown before it is added, not after. Somebody who can read CEL
              can check the condition means what they chose. */}
          <code data-formancy-part="logic-preview">{compileGroup(group)}</code>
        </>
      ) : null}

      {writes !== 'expression' ? null : (
        <>
          <label>
            The calculation
            <input
              type="text"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              placeholder="qty * unitPrice"
            />
          </label>
          {/* CEL, and said so: a calculation produces a VALUE rather than a
              condition, so the comparison editor is the wrong surface for one
              and a box is the honest offer. */}
          <p data-formancy-part="logic-hint">{hint}</p>
        </>
      )}

      {carriesCondition ? null : writes === 'check' ? (
        <p data-formancy-part="logic-hint">{hint}</p>
      ) : null}

      <div data-formancy-part="logic-actions">
        <button
          type="button"
          onClick={() =>
            onAdd(
              composeRule({
                kind,
                target,
                rows,
                join,
                check: check.trim(),
                expression: expression.trim(),
              }),
            )
          }
          disabled={!draftIsComplete({ kind, rows, check, expression })}
        >
          Add rule
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
