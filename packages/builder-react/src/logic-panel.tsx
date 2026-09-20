import { useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import type { LogicRule } from '@formancy/spec'
import { OPERATORS, compileCondition } from './conditions.js'
import type { Condition, Operator } from './conditions.js'
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
          onAdd={(kind, condition) => {
            setDrafting(false)
            session.addRule({
              target,
              kind,
              cel: compileCondition(condition),
              // Regenerated metadata, never evaluated: it exists so this panel
              // can reopen the condition instead of parsing CEL back.
              editor: condition,
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
  onAdd: (kind: LogicRule['kind'], condition: Condition) => void
  onCancel: () => void
}): ReactElement {
  const [kind, setKind] = useState<LogicRule['kind']>('visible')
  const [field, setField] = useState(fields[0]?.path ?? '')
  const [operator, setOperator] = useState<Operator>('is')
  const [text, setText] = useState('')

  const takesValue = OPERATORS.find((candidate) => candidate.id === operator)?.takesValue ?? true
  const hint = KINDS.find((candidate) => candidate.id === kind)?.hint ?? ''

  // A number typed into a box is still a string. Comparing a number field to
  // "5" is a type error CEL catches at save time, so the value is narrowed
  // here where the author can still see what happened.
  const value: Condition['value'] =
    text === 'true' ? true : text === 'false' ? false : text !== '' && !Number.isNaN(Number(text)) ? Number(text) : text

  const condition: Condition = { field, operator, ...(takesValue ? { value } : {}) }

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

      <label>
        Field
        <select value={field} onChange={(event) => setField(event.target.value)}>
          {fields.map((candidate) => (
            <option key={candidate.path} value={candidate.path}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Comparison
        <select value={operator} onChange={(event) => setOperator(event.target.value as Operator)}>
          {OPERATORS.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>

      {takesValue ? (
        <label>
          Value
          <input type="text" value={text} onChange={(event) => setText(event.target.value)} />
        </label>
      ) : null}

      <p data-formancy-part="logic-hint">{hint}</p>

      {/* Shown before it is added, not after. Somebody who can read CEL can
          check the condition means what they chose. */}
      <code data-formancy-part="logic-preview">{compileCondition(condition)}</code>

      <div data-formancy-part="logic-actions">
        <button type="button" onClick={() => onAdd(kind, condition)} disabled={field === ''}>
          Add rule
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
