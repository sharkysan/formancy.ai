import type { FormSchema, LogicRule } from '@formancy/spec'
import { OPERATORS } from './conditions.js'
import type { Condition, ConditionGroup, Operator } from './conditions.js'
import { compileGroup } from './conditions.js'
import { dataPathOf } from './session.js'
import { flatten } from './tree.js'

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
export interface RuleKindChoice {
  id: LogicRule['kind']
  label: string
  hint: string
  on: 'field' | 'page'
  /**
   * What the rule is written with, and there are three answers rather than two.
   *
   * A `condition` is composed in the comparison editor and compiled to CEL. A
   * `check` is a NAME the deployment answers and has no expression at all. An
   * `expression` is CEL that produces a VALUE rather than a boolean — the
   * comparison editor composes booleans, so it is the wrong surface for one, and
   * writing it as a box of CEL is the honest offer.
   *
   * It was a boolean, and `computed` was simply absent from this table: a kind
   * the format defines that no builder could write, which is the same
   * documented-but-unreachable shape `check` and `skip` shipped in. Found by
   * deriving the list from the spec rather than by reading it.
   */
  writes: 'condition' | 'check' | 'expression'
}

/**
 * The kinds a builder offers, with the words it offers them in.
 *
 * Here rather than in a builder because it is a decision rather than markup: two
 * copies would drift the first time the format grows a kind, one builder would
 * offer it and the other would not, and nobody using one of them could see the
 * difference ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 */
export const RULE_KIND_CHOICES: readonly RuleKindChoice[] = [
  {
    id: 'visible',
    label: 'Show this field when',
    hint: 'Hidden otherwise, and its answer is cleared unless the field says not to.',
    on: 'field',
    writes: 'condition',
  },
  {
    id: 'required',
    label: 'Require an answer when',
    hint: 'Only while the condition holds.',
    on: 'field',
    writes: 'condition',
  },
  {
    id: 'disabled',
    label: 'Disable this field when',
    hint: 'Visible but not editable.',
    on: 'field',
    writes: 'condition',
  },
  {
    id: 'validate',
    label: 'Reject the answer unless',
    hint: 'The condition must hold for the form to be submitted.',
    on: 'field',
    writes: 'condition',
  },
  {
    id: 'check',
    label: 'Ask the deployment about the answer',
    hint: 'Names a check this deployment answers — is this email already registered, does this reference exist. A check the deployment has not supplied refuses the answer rather than passing it.',
    on: 'field',
    writes: 'check',
  },
  {
    id: 'computed',
    label: 'Calculate this field as',
    hint: 'A CEL expression producing the answer, recomputed whenever what it reads changes. The field is filled in rather than asked, so what somebody typed is replaced.',
    on: 'field',
    writes: 'expression',
  },
  {
    id: 'skip',
    label: 'Skip this page when',
    hint: 'The page is walked past, in both directions, and the questions on it are neither asked nor validated.',
    on: 'page',
    writes: 'condition',
  },
]

/** The kinds that may be written on this node, and nothing that would be refused. */
export function ruleKindsFor(on: 'field' | 'page'): RuleKindChoice[] {
  return RULE_KIND_CHOICES.filter((choice) => choice.on === on)
}

/** What a kind is written with: a condition, a check's name, or an expression. */
export function kindWrites(kind: LogicRule['kind']): RuleKindChoice['writes'] {
  return RULE_KIND_CHOICES.find((choice) => choice.id === kind)?.writes ?? 'condition'
}

/** Whether a kind is composed in the comparison editor. */
export function kindCarriesCondition(kind: LogicRule['kind']): boolean {
  return kindWrites(kind) === 'condition'
}

/**
 * What a rule on this node is addressed by, and which kinds apply to it.
 *
 * The DATA path for a field, not the key path — pages are transparent for data,
 * so a field inside one is `needsVisa` in the model and `about.needsVisa` in the
 * tree. The React panel joined the key path, and every rule written on a field
 * inside a page was refused with *"No field has the data path"*: in the builder,
 * for as long as pages have existed.
 *
 * A page's rules are addressed by its KEY instead, because a page carries no
 * answer and so has no path — which is why a `skip` is its own kind rather than
 * `visible` pointed at a page
 * ([0087](../../../docs/decisions/0087-a-page-can-be-walked-past.md)).
 */
export function ruleTargetFor(
  document: FormSchema,
  keyPath: readonly string[],
): { target: string; on: 'field' | 'page' } {
  const node = flatten(document).find(
    (candidate) => candidate.keyPath.join('.') === keyPath.join('.'),
  )
  if (node?.def.type === 'page') {
    return { target: keyPath[keyPath.length - 1] ?? keyPath.join('.'), on: 'page' }
  }
  return { target: dataPathOf(document, keyPath) ?? keyPath.join('.'), on: 'field' }
}

/** One row of the condition editor, as a person has it on screen. */
export interface ConditionRow {
  field: string
  operator: Operator
  /**
   * What was typed, kept as text rather than as the narrowed value, so it
   * survives switching to a comparison that takes no value and back.
   */
  text: string
}

/** A fresh row, aimed at the first field a builder can offer. */
export function emptyRow(firstField: string): ConditionRow {
  return { field: firstField, operator: 'is', text: '' }
}

/**
 * One row as a condition, with the typed text narrowed to what CEL will compare.
 *
 * A number typed into a box is still a string, and comparing a number field to
 * `"5"` is a type error CEL catches at save time — so the narrowing happens here,
 * where the author can still see what happened, rather than at publish.
 */
export function conditionOf(row: ConditionRow): Condition {
  const takesValue = OPERATORS.find((candidate) => candidate.id === row.operator)?.takesValue ?? true
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

/** Whether the comparison this row names takes a value at all. */
export function rowTakesValue(row: ConditionRow): boolean {
  return OPERATORS.find((candidate) => candidate.id === row.operator)?.takesValue ?? true
}

/**
 * The rule a builder is about to add, composed once for both of them.
 *
 * A check has no expression, and a rule carrying both would be two rules in one
 * object with no answer to which verdict wins — the schema refuses it, so this
 * does not compose it.
 */
export function composeRule(input: {
  kind: LogicRule['kind']
  target: string
  rows: readonly ConditionRow[]
  join: ConditionGroup['join']
  check: string
  /** Raw CEL, for a kind that writes an expression rather than a condition. */
  expression?: string
}): LogicRule {
  const group: ConditionGroup = { join: input.join, conditions: input.rows.map(conditionOf) }
  const written =
    kindWrites(input.kind) === 'check'
      ? { check: input.check }
      : kindWrites(input.kind) === 'expression'
        ? // No `editor`: the comparison editor did not write this and cannot
          // regenerate it, and metadata claiming otherwise would be a lie the
          // next opening of the panel tells.
          { cel: input.expression ?? '' }
        : { cel: compileGroup(group), editor: group }
  return {
    target: input.target,
    kind: input.kind,
    ...written,
    ...(input.kind === 'validate' ? { code: 'condition' } : {}),
  } as LogicRule
}

/** Whether what is on screen is enough to add. */
export function draftIsComplete(input: {
  kind: LogicRule['kind']
  rows: readonly ConditionRow[]
  check: string
  expression?: string
}): boolean {
  // A check with no name asks nobody, an empty expression calculates nothing,
  // and an empty comparison compiles to an expression about nothing. Which of
  // the three applies depends on the kind.
  switch (kindWrites(input.kind)) {
    case 'check':
      return input.check.trim() !== ''
    case 'expression':
      return (input.expression ?? '').trim() !== ''
    default:
      return input.rows.every((row) => row.field !== '')
  }
}

/**
 * Every message id the document refers to, in document order and deduplicated.
 *
 * The order matters: a translator works down a list and meets the questions in
 * the order somebody filling the form does, which is the only order that makes
 * the words next to each other mean anything.
 *
 * Framework-free, so both translation panes ask the same question. It walks the
 * model AND the layouts, because a section's heading is text a reader sees and
 * lives in the arrangement rather than in the model.
 */
export function referencedMessages(document: FormSchema): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    const reference = record['$t']
    if (typeof reference === 'string') {
      if (!seen.has(reference)) {
        seen.add(reference)
        found.push(reference)
      }
      return
    }
    for (const item of Object.values(record)) walk(item)
  }
  walk(document.model)
  walk(document.layouts)
  return found
}
