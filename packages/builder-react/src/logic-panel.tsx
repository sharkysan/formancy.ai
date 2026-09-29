import { useState } from 'react'
import type { ReactElement } from 'react'
import { dataPathOf } from '@formancy/builder-core'
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

/**
 * What a rule can do, and where.
 *
 * `on` is the half that arrived with spec 3. A `skip` targets a PAGE and a page
 * has no data path, so the validator refuses every other kind on one — offering
 * them would be offering a choice refused every time, which is what the field
 * palette already learned about `page` itself. And a `check` is not a condition
 * at all: it names a validator the deployment answers, so the condition editor is
 * the wrong surface and is not shown for it.
 */
const KINDS: ReadonlyArray<{
  id: LogicRule['kind']
  label: string
  hint: string
  on: 'field' | 'page'
  /** Whether the rule carries a condition. A check names a check instead. */
  condition: boolean
}> = [
  { id: 'visible', label: 'Show this field when', hint: 'Hidden otherwise, and its answer is cleared unless the field says not to.', on: 'field', condition: true },
  { id: 'required', label: 'Require an answer when', hint: 'Only while the condition holds.', on: 'field', condition: true },
  { id: 'disabled', label: 'Disable this field when', hint: 'Visible but not editable.', on: 'field', condition: true },
  { id: 'validate', label: 'Reject the answer unless', hint: 'The condition must hold for the form to be submitted.', on: 'field', condition: true },
  {
    id: 'check',
    label: 'Ask the deployment about the answer',
    hint: 'Names a check this deployment answers — is this email already registered, does this reference exist. A check the deployment has not supplied refuses the answer rather than passing it.',
    on: 'field',
    condition: false,
  },
  {
    id: 'skip',
    label: 'Skip this page when',
    hint: 'The page is walked past, in both directions, and the questions on it are neither asked nor validated.',
    on: 'page',
    condition: true,
  },
]

export interface LogicPanelProps {
  session: BuilderSession
  /** The field the rules are about. */
  keyPath: readonly string[]
}

export function LogicPanel({ session, keyPath }: LogicPanelProps): ReactElement {
  const view = useBuilder(session)
  const [drafting, setDrafting] = useState(false)

  // The DATA path, not the key path. Pages are transparent for data, so a field
  // inside one is `needsVisa` in the model and `about.needsVisa` in the tree —
  // and this joined the key path, so every rule written on a field inside a page
  // was refused with "No field has the data path". In the builder, for as long as
  // pages have existed, found by the first test that opened this panel on one.
  const target = dataPathOf(view.document, keyPath) ?? keyPath.join('.')
  /**
   * A page's rules are addressed by its KEY, not by a data path.
   *
   * A page carries no answer, so it has no path — which is why a `skip` is its
   * own kind rather than `visible` pointed at a page
   * ([0087](../../../docs/decisions/0087-a-page-can-be-walked-past.md)).
   */
  const node = view.nodes.find((candidate) => candidate.keyPath.join('.') === keyPath.join('.'))
  const onPage = node?.def.type === 'page'
  const pageTarget = keyPath[keyPath.length - 1] ?? target
  const ruleTarget = onPage ? pageTarget : target
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
          on={onPage ? 'page' : 'field'}
          fields={view.nodes
            .filter((candidate) => !candidate.isContainer)
            .map((candidate) => ({
              path: candidate.keyPath.join('.'),
              label: nameOf(view.document, candidate.def),
            }))}
          onCancel={() => setDrafting(false)}
          onAdd={(kind, group, check) => {
            setDrafting(false)
            const carries = KINDS.find((candidate) => candidate.id === kind)?.condition ?? true
            session.addRule({
              target: ruleTarget,
              kind,
              // A check has no expression and a rule carrying both would be two
              // rules in one object; the schema refuses it, so the panel does not
              // compose it.
              ...(carries ? { cel: compileGroup(group), editor: group } : { check }),
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
  on,
  fields,
  onAdd,
  onCancel,
}: {
  /** Whether the rules being written are about a page or a field. */
  on: 'field' | 'page'
  fields: ReadonlyArray<{ path: string; label: string }>
  onAdd: (kind: LogicRule['kind'], group: ConditionGroup, check: string) => void
  onCancel: () => void
}): ReactElement {
  const applicable = KINDS.filter((candidate) => candidate.on === on)
  const [kind, setKind] = useState<LogicRule['kind']>(applicable[0]?.id ?? 'visible')
  const [check, setCheck] = useState('')
  const carriesCondition = KINDS.find((candidate) => candidate.id === kind)?.condition ?? true
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
        What the rule does
        <select value={kind} onChange={(event) => setKind(event.target.value as LogicRule['kind'])}>
          {applicable.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>

      {carriesCondition ? null : (
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

          {/* Shown before it is added, not after. Somebody who can read CEL
              can check the condition means what they chose. */}
          <code data-formancy-part="logic-preview">{compileGroup(group)}</code>
        </>
      ) : null}

      {carriesCondition ? null : <p data-formancy-part="logic-hint">{hint}</p>}

      <div data-formancy-part="logic-actions">
        <button
          type="button"
          onClick={() => onAdd(kind, group, check.trim())}
          // A check with no name asks nobody, and an empty comparison compiles to
          // an expression about nothing. Which of the two applies depends on the
          // kind, so the guard does too.
          disabled={carriesCondition ? rows.some((row) => row.field === '') : check.trim() === ''}
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
