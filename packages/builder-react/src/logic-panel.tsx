import { useState } from 'react'
import type { ReactElement } from 'react'
import type { BuilderSession, BuilderText } from '@formancy/builder-core'
import type { LogicRule } from '@formancy/spec'
import {
  addGroup,
  addRow,
  comparisonLabel,
  compileGroup,
  composeRule,
  conditionFields,
  draftIsComplete,
  emptyDraft,
  groupOf,
  isRowGroup,
  kindWrites,
  operatorLabel,
  operatorTakesValue,
  operatorsFor,
  removeFromDraft,
  rowsOf,
  ruleKindHint,
  ruleKindLabel,
  ruleKindsFor,
  ruleTargetFor,
  setJoin,
  updateRow,
} from '@formancy/builder-core'
import type {
  ConditionDraft,
  ConditionField,
  ConditionGroup,
  ConditionRow,
  DraftPlace,
  Operator,
} from '@formancy/builder-core'
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
  const { text } = session
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
      <h3>{text('logic.heading')}</h3>

      {mine.length === 0 ? (
        <p data-formancy-part="logic-empty">{text('logic.empty')}</p>
      ) : (
        <ul data-formancy-part="logic-list">
          {mine.map(({ rule, index }) => (
            <li key={index} data-formancy-part="logic-rule">
              <span data-formancy-part="logic-kind">
                {ruleKindLabel(rule.kind, text)}
              </span>
              {/* The expression, shown. A developer should not have to guess
                  what the condition compiled to. */}
              <code>{rule.cel}</code>
              <button
                type="button"
                aria-label={text('logic.remove', { rule: ruleKindLabel(rule.kind, text), target })}
                onClick={() => session.removeRule(index)}
              >
                {text('list.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {drafting ? (
        <RuleDraft
          on={on}
          target={ruleTarget}
          // From the core, at the paths the engine reads: joining the tree's key path
          // named a field inside a page by a path no field has (0127).
          fields={conditionFields(view.document)}
          text={text}
          onCancel={() => setDrafting(false)}
          onAdd={(rule) => {
            setDrafting(false)
            session.addRule(rule)
          }}
        />
      ) : (
        <button type="button" onClick={() => setDrafting(true)}>
          {text('logic.add')}
        </button>
      )}
    </div>
  )
}

function RuleDraft({
  on,
  target,
  fields,
  text,
  onAdd,
  onCancel,
}: {
  /** Whether the rules being written are about a page or a field. */
  on: 'field' | 'page'
  /** What the rule will be addressed by, decided by the core. */
  target: string
  fields: readonly ConditionField[]
  text: BuilderText
  onAdd: (rule: LogicRule) => void
  onCancel: () => void
}): ReactElement {
  const applicable = ruleKindsFor(on)
  const [kind, setKind] = useState<LogicRule['kind']>(applicable[0]?.id ?? 'visible')
  const [check, setCheck] = useState('')
  const writes = kindWrites(kind)
  const carriesCondition = writes === 'condition'
  const [expression, setExpression] = useState('')
  /**
   * The condition being written. Every edit is builder-core's — which comparison a
   * field still takes, whether a typed value survives a change of field, what an
   * emptied group becomes — so this panel and the Angular one cannot answer
   * differently (0127).
   */
  const [draft, setDraft] = useState<ConditionDraft>(() => emptyDraft(fields))
  const hint = ruleKindHint(kind, text)
  const all = rowsOf(draft)

  // Numbered across the whole condition, so every comparison's controls have a name
  // of their own even when two sit in different groups.
  const numberOf = (row: ConditionRow): number => all.indexOf(row)
  const labelOf = (part: 'field' | 'comparison' | 'value', row: ConditionRow): string =>
    comparisonLabel(part, numberOf(row), all.length, text)

  const comparison = (row: ConditionRow, place: DraftPlace, removable: boolean): ReactElement => (
    <Comparison
      key={`${String(place.group ?? '')}-${String(place.at)}`}
      row={row}
      fields={fields}
      text={text}
      labelOf={(part) => labelOf(part, row)}
      onChange={(change) => setDraft((before) => updateRow(before, place, change, fields))}
      {...(removable
        ? {
            onRemove: () => setDraft((before) => removeFromDraft(before, place)),
            removeLabel: text('logic.removeComparison', { number: numberOf(row) + 1 }),
          }
        : {})}
    />
  )

  let groups = 0
  return (
    <div data-formancy-part="logic-draft">
      <label>
        {text('logic.what')}
        <select value={kind} onChange={(event) => setKind(event.target.value as LogicRule['kind'])}>
          {applicable.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {ruleKindLabel(candidate.id, text)}
            </option>
          ))}
        </select>
      </label>

      {writes !== 'check' ? null : (
        <label>
          {text('logic.check')}
          <input
            type="text"
            value={check}
            onChange={(event) => setCheck(event.target.value)}
            placeholder={text('logic.check.example')}
          />
        </label>
      )}

      {carriesCondition ? (
        <>
          {/* Only once there is something to join. A control that does nothing is a
              control somebody has to work out is irrelevant. */}
          {draft.items.length > 1 ? (
            <JoinChoice
              label={text('logic.match')}
              join={draft.join}
              text={text}
              onChange={(join) => setDraft((before) => setJoin(before, join))}
            />
          ) : null}

          {draft.items.map((item, at) => {
            if (!isRowGroup(item)) return comparison(item, { at }, at > 0)
            groups += 1
            const number = groups
            return (
              <fieldset key={`group-${String(at)}`} data-formancy-part="logic-group">
                <legend>{text('logic.group', { number })}</legend>
                {item.rows.length > 1 ? (
                  <JoinChoice
                    label={text('logic.group.match', { number })}
                    join={item.join}
                    text={text}
                    onChange={(join) => setDraft((before) => setJoin(before, join, at))}
                  />
                ) : null}
                {item.rows.map((row, inner) => comparison(row, { at: inner, group: at }, inner > 0))}
                <button type="button" onClick={() => setDraft((before) => addRow(before, fields, at))}>
                  {text('logic.group.add', { number })}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((before) => removeFromDraft(before, { at }))}
                >
                  {text('logic.group.remove', { number })}
                </button>
              </fieldset>
            )
          })}

          <button type="button" onClick={() => setDraft((before) => addRow(before, fields))}>
            {text('logic.addComparison')}
          </button>
          <button type="button" onClick={() => setDraft((before) => addGroup(before, fields))}>
            {text('logic.addGroup')}
          </button>

          <p data-formancy-part="logic-hint">{hint}</p>

          {/* Shown before it is added, not after. Somebody who can read CEL
              can check the condition means what they chose. */}
          <code data-formancy-part="logic-preview">{compileGroup(groupOf(draft, fields))}</code>
        </>
      ) : null}

      {writes !== 'expression' ? null : (
        <>
          <label>
            {text('logic.calculation')}
            <input
              type="text"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              placeholder={text('logic.calculation.example')}
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
                draft,
                fields,
                check: check.trim(),
                expression: expression.trim(),
              }),
            )
          }
          disabled={!draftIsComplete({ kind, draft, check, expression })}
        >
          {text('logic.addRule')}
        </button>
        <button type="button" onClick={onCancel}>
          {text('dialog.cancel')}
        </button>
      </div>
    </div>
  )
}

function JoinChoice({
  label,
  join,
  text,
  onChange,
}: {
  label: string
  join: ConditionGroup['join']
  text: BuilderText
  onChange: (join: ConditionGroup['join']) => void
}): ReactElement {
  return (
    <label>
      {label}
      <select value={join} onChange={(event) => onChange(event.target.value as ConditionGroup['join'])}>
        <option value="all">{text('logic.join.all')}</option>
        <option value="any">{text('logic.join.any')}</option>
      </select>
    </label>
  )
}

/**
 * One comparison: a field, what it is compared by, and a value of the field's own kind.
 *
 * The value control follows the field — a choice offers its options, a checkbox yes
 * or no, a number a number box, a date a date — so the value written is one the field
 * can hold, and the comparisons offered are the ones it can take.
 */
function Comparison({
  row,
  fields,
  text,
  labelOf,
  onChange,
  onRemove,
  removeLabel,
}: {
  row: ConditionRow
  fields: readonly ConditionField[]
  text: BuilderText
  labelOf: (part: 'field' | 'comparison' | 'value') => string
  onChange: (change: Partial<ConditionRow>) => void
  onRemove?: () => void
  removeLabel?: string
}): ReactElement {
  const field = fields.find((candidate) => candidate.path === row.field)
  const kind = field?.kind ?? 'other'
  return (
    <div data-formancy-part="logic-comparison">
      <label>
        {labelOf('field')}
        <select value={row.field} onChange={(event) => onChange({ field: event.target.value })}>
          {fields.map((candidate) => (
            <option key={candidate.path} value={candidate.path}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        {labelOf('comparison')}
        <select
          value={row.operator}
          onChange={(event) => onChange({ operator: event.target.value as Operator })}
        >
          {operatorsFor(kind).map((operator) => (
            <option key={operator} value={operator}>
              {operatorLabel(operator, text)}
            </option>
          ))}
        </select>
      </label>

      {operatorTakesValue(row.operator) ? (
        <label>
          {labelOf('value')}
          <ValueControl
            field={field}
            value={row.text}
            text={text}
            onChange={(value) => onChange({ text: value })}
          />
        </label>
      ) : null}

      {onRemove === undefined ? null : (
        <button type="button" onClick={onRemove}>
          {removeLabel}
        </button>
      )}
    </div>
  )
}

function ValueControl({
  field,
  value,
  text,
  onChange,
}: {
  field: ConditionField | undefined
  value: string
  text: BuilderText
  onChange: (value: string) => void
}): ReactElement {
  const kind = field?.kind ?? 'other'
  if (kind === 'choice' || kind === 'list') {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{text('logic.value.choose')}</option>
        {(field?.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
  if (kind === 'boolean') {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="true">{text('logic.value.yes')}</option>
        <option value="false">{text('logic.value.no')}</option>
      </select>
    )
  }
  return <input type={INPUT_TYPE[kind] ?? 'text'} value={value} onChange={(event) => onChange(event.target.value)} />
}

/** The box a value is typed into, by what the field holds. */
const INPUT_TYPE: Partial<Record<ConditionField['kind'], string>> = {
  number: 'number',
  date: 'date',
  time: 'time',
  datetime: 'datetime-local',
}
