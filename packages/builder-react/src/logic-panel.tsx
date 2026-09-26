import { useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import type { LogicRule } from '@formancy/spec'
import { OPERATORS, compileGroup } from './conditions.js'
import type { Condition, ConditionGroup, Operator } from './conditions.js'
import { nameOf } from './tree.js'
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

const KINDS: ReadonlyArray<{ id: LogicRule['kind']; label: string; hint: string }> = [
  { id: 'visible', label: 'Show this field when', hint: 'Hidden otherwise, and its answer is cleared unless the field says not to.' },
  { id: 'required', label: 'Require an answer when', hint: 'Only while the condition holds.' },
  { id: 'disabled', label: 'Disable this field when', hint: 'Visible but not editable.' },
  { id: 'validate', label: 'Reject the answer unless', hint: 'The condition must hold for the form to be submitted.' },
]

export interface LogicPanelProps {
  session: BuilderSession
  /** The field the rules are about. */
  keyPath: readonly string[]
}

export function LogicPanel({ session, keyPath }: LogicPanelProps): ReactElement {
  const view = useBuilder(session)
  const [drafting, setDrafting] = useState(false)

  const target = keyPath.join('.')
  const rules = view.document.logic?.rules ?? []
  // Index within the whole list, because removeRule takes one.
  const mine = rules
    .map((rule, index) => ({ rule, index }))
    .filter((entry) => entry.rule.target === target)

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
                {KINDS.find((kind) => kind.id === rule.kind)?.label ?? rule.kind}
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
          fields={view.nodes
            .filter((node) => !node.isContainer)
            .map((node) => ({
              path: node.keyPath.join('.'),
              label: nameOf(view.document, node.def),
            }))}
          onCancel={() => setDrafting(false)}
          onAdd={(kind, group) => {
            setDrafting(false)
            session.addRule({
              target,
              kind,
              cel: compileGroup(group),
              // Regenerated metadata, never evaluated: it exists so this panel
              // can reopen the condition instead of parsing CEL back. It holds
              // the GROUP now rather than a bare condition -- one shape, and the
              // field is documented as regenerated, so there is nothing to
              // migrate and nothing reads it yet.
              editor: group,
              ...(kind === 'validate' ? { code: 'condition' } : {}),
            } as LogicRule)
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
  fields,
  onAdd,
  onCancel,
}: {
  fields: ReadonlyArray<{ path: string; label: string }>
  onAdd: (kind: LogicRule['kind'], group: ConditionGroup) => void
  onCancel: () => void
}): ReactElement {
  const [kind, setKind] = useState<LogicRule['kind']>('visible')
  const [join, setJoin] = useState<ConditionGroup['join']>('all')
  /**
   * One row per comparison.
   *
   * Flat, because a group cannot nest -- see `ConditionGroup`. The text is kept
   * per row rather than the narrowed value, so what somebody typed survives
   * switching the comparison to one that takes no value and back.
   */
  const [rows, setRows] = useState<ReadonlyArray<{ field: string; operator: Operator; text: string }>>(
    [{ field: fields[0]?.path ?? '', operator: 'is', text: '' }],
  )

  const hint = KINDS.find((candidate) => candidate.id === kind)?.hint ?? ''

  const conditionOf = (row: { field: string; operator: Operator; text: string }): Condition => {
    const takesValue = OPERATORS.find((candidate) => candidate.id === row.operator)?.takesValue ?? true
    // A number typed into a box is still a string. Comparing a number field to
    // "5" is a type error CEL catches at save time, so the value is narrowed
    // here where the author can still see what happened.
    const value: Condition['value'] =
      row.text === 'true'
        ? true
        : row.text === 'false'
          ? false
          : row.text !== '' && !Number.isNaN(Number(row.text))
            ? Number(row.text)
            : row.text
    return { field: row.field, operator: row.operator, ...(takesValue ? { value } : {}) }
  }

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
        Rule
        <select value={kind} onChange={(event) => setKind(event.target.value as LogicRule['kind'])}>
          {KINDS.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>

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
        const takesValue =
          OPERATORS.find((candidate) => candidate.id === row.operator)?.takesValue ?? true
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
            { field: fields[0]?.path ?? '', operator: 'is', text: '' },
          ])
        }
      >
        Add a comparison
      </button>

      <p data-formancy-part="logic-hint">{hint}</p>

      {/* Shown before it is added, not after. Somebody who can read CEL can
          check the condition means what they chose. */}
      <code data-formancy-part="logic-preview">{compileGroup(group)}</code>

      <div data-formancy-part="logic-actions">
        <button type="button" onClick={() => onAdd(kind, group)} disabled={rows.some((row) => row.field === '')}>
          Add rule
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
