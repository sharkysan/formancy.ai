import { compile, evaluate } from '@formancy/expressions'
import type { Capabilities } from '@formancy/expressions'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { compileCondition, isGroup } from './conditions.js'
import type { Condition, ConditionGroup } from './conditions.js'
import { conditionFields } from './condition-draft.js'
import type { ConditionField } from './condition-draft.js'
import { kindWrites, operatorLabel, ruleKindLabel } from './logic.js'
import type { BuilderMessageId, BuilderText } from './messages.js'
import { flatten, nameOf } from './tree.js'

/**
 * Every rule in the form, in words, and — given the answers somebody has typed into a
 * preview — what each one does now and why.
 *
 * A rule is written on the field it is about, and read there; a form with twenty rules
 * on twelve fields had no place to see them together, and an author looking at a
 * hidden field in the preview had no way to ask why it was hidden but to open each
 * rule and evaluate it in their head. Decided here, for both builders, from the
 * \`editor\` metadata the condition editor stores beside the CEL
 * ([0128](../../../docs/decisions/0128-a-form-says-why-a-field-is-hidden.md)).
 */

/** One rule, as the overview shows it. */
export interface RuleSummary {
  /** Its place in \`logic.rules\`, which is what removing it takes. */
  index: number
  kind: LogicRule['kind']
  /** "Show this field when" — the words the editor offers the kind by. */
  kindLabel: string
  /**
   * The condition in words, when the condition editor wrote it. Absent for a rule
   * written by hand, whose CEL is all there is to show.
   */
  sentence?: string
  /** What is evaluated: the CEL, or a check's name. */
  written: string
}

/** The rules on one field or page, under its name. */
export interface RulesOn {
  target: string
  targetLabel: string
  rules: RuleSummary[]
}

/** Every rule in the form, grouped by what it is about, in document order. */
export function rulesOverview(document: FormSchema, text: BuilderText): RulesOn[] {
  const fields = conditionFields(document)
  const rules = document.logic?.rules ?? []
  const groups = new Map<string, RulesOn>()

  // In the order the form asks its questions, so the overview reads the way the form
  // does; a rule on a target the tree does not know still appears, at the end.
  for (const node of flatten(document)) {
    const target = targetOf(document, node.keyPath, node.def.type)
    if (rules.some((rule) => rule.target === target)) {
      groups.set(target, { target, targetLabel: nameOf(document, node.def), rules: [] })
    }
  }
  rules.forEach((rule, index) => {
    const group = groups.get(rule.target) ?? {
      target: rule.target,
      targetLabel: rule.target,
      rules: [],
    }
    groups.set(rule.target, group)
    const editor = asGroup(rule.editor)
    group.rules.push({
      index,
      kind: rule.kind,
      kindLabel: ruleKindLabel(rule.kind, text),
      ...(editor === undefined ? {} : { sentence: describeCondition(editor, fields, text) }),
      written: rule.check ?? rule.cel ?? '',
    })
  })
  return [...groups.values()]
}

/**
 * A page by its key; a field by the data path its rules name — `items[].note` for a
 * field in a repeater row, which is how the engine scopes a rule to each row.
 */
function targetOf(document: FormSchema, keyPath: readonly string[], type: string): string {
  if (type === 'page') return keyPath[keyPath.length - 1] ?? ''
  let target = ''
  let fields = document.model.fields
  for (const [index, key] of keyPath.entries()) {
    const field = fields.find((candidate) => candidate.key === key)
    if (field === undefined) break
    if (field.type !== 'page') target += (target === '' ? '' : '.') + key
    if (field.type === 'repeater' && index < keyPath.length - 1) target += '[]'
    fields = field.fields ?? []
  }
  return target
}

/** The editor metadata as a condition, or nothing when it is not the shape the editor writes. */
function asGroup(editor: unknown): ConditionGroup | undefined {
  if (typeof editor !== 'object' || editor === null) return undefined
  return Array.isArray((editor as { conditions?: unknown }).conditions)
    ? (editor as ConditionGroup)
    : undefined
}

/**
 * A condition in words: "Country is Switzerland and (Age is at least 18 or Terms is
 * Yes)". Joined by the language's own list format, so "and" and "or" are the
 * author's words — and a choice's value is shown by its label, a checkbox's by yes
 * or no, because that is how the editor offered them.
 */
export function describeCondition(
  group: ConditionGroup,
  fields: readonly ConditionField[],
  text: BuilderText,
): string {
  const parts = group.conditions.map((item) =>
    isGroup(item)
      ? item.conditions.length > 1
        ? `(${describeCondition(item, fields, text)})`
        : describeCondition(item, fields, text)
      : describeComparison(item, fields, text),
  )
  return group.join === 'all' ? text.list(parts) : text.alternatives(parts)
}

function describeComparison(
  condition: Condition,
  fields: readonly ConditionField[],
  text: BuilderText,
): string {
  const field = fields.find((candidate) => candidate.path === condition.field)
  const name = field?.label ?? condition.field
  const operator = operatorLabel(condition.operator, text)
  if (!('value' in condition)) return text('overview.comparison.noValue', { field: name, operator })
  return text('overview.comparison', {
    field: name,
    operator,
    value: valueInWords(condition.value, field, text),
  })
}

function valueInWords(
  value: unknown,
  field: ConditionField | undefined,
  text: BuilderText,
): string {
  if (value === null || value === undefined || value === '') return text('overview.notAnswered')
  if (typeof value === 'boolean') return text(value ? 'logic.value.yes' : 'logic.value.no')
  if (Array.isArray(value)) return text.list(value.map((item) => valueInWords(item, field, text)))
  const option = field?.options.find((candidate) => candidate.value === value)
  return option?.label ?? String(value)
}

/** What a rule does with the answers given, and why. */
export interface RuleVerdict {
  /** Whether the condition holds; \`undecided\` when evaluating it threw. */
  outcome: 'holds' | 'fails' | 'undecided'
  /** What that means for the field or page now, in words. */
  effect: string
  /** One line per comparison the editor wrote, saying whether it holds and why. */
  because: string[]
}

/**
 * A rule's verdict on the answers a preview holds.
 *
 * **What it does when it cannot decide is said, not hidden.** A \`visible\` rule that
 * throws shows its field, by design ([0022](../../../docs/decisions/0022-fail-open-fail-closed.md)),
 * and that is the case an author most needs explained: the field is there, the
 * condition says it should not be, and nothing on screen says why.
 *
 * Only for the kinds a condition decides; a calculation and a check have no verdict
 * here. \`capabilities\` are the host's — the clock a preview uses — because a rule may
 * read today's date and an explanation must agree with the preview it explains.
 */
export function explainRule(
  rule: LogicRule,
  document: FormSchema,
  answers: Readonly<Record<string, unknown>>,
  text: BuilderText,
  capabilities: Capabilities,
): RuleVerdict | undefined {
  if (!decidesByCondition(rule.kind) || rule.cel === undefined) return undefined
  // A row's rule has a verdict per row, and reads `item`, which the form as a whole
  // does not have: evaluated here it would throw and be explained as undecided.
  if (rule.target.includes('[]')) return undefined
  const fields = conditionFields(document)
  const outcome = decide(rule.cel, document, answers, capabilities)
  const editor = asGroup(rule.editor)
  const because =
    editor === undefined
      ? []
      : comparisonsOf(editor).map((condition) => {
          const said = describeComparison(condition, fields, text)
          const holds = decide(compileCondition(condition), document, answers, capabilities)
          if (holds === 'holds') return text('overview.because.holds', { comparison: said })
          const actual = read(answers, condition.field)
          const field = fields.find((candidate) => candidate.path === condition.field)
          return actual === null ||
            actual === undefined ||
            (Array.isArray(actual) && actual.length === 0)
            ? text('overview.because.failsEmpty', { comparison: said })
            : text('overview.because.fails', {
                comparison: said,
                actual: valueInWords(actual, field, text),
              })
        })
  return { outcome, effect: text(EFFECT[rule.kind][outcome]), because }
}

/**
 * What each kind a condition decides does with its field, by outcome — measured
 * against the engine, including what it does when the condition cannot be decided:
 * a `visible` rule shows its field, `required` and `disabled` leave it free and
 * open, `skip` keeps the page, and `validate` refuses the answer (0022).
 */
const EFFECT = {
  visible: {
    holds: 'overview.now.visible.holds',
    fails: 'overview.now.visible.fails',
    undecided: 'overview.now.visible.undecided',
  },
  required: {
    holds: 'overview.now.required.holds',
    fails: 'overview.now.required.fails',
    undecided: 'overview.now.required.undecided',
  },
  disabled: {
    holds: 'overview.now.disabled.holds',
    fails: 'overview.now.disabled.fails',
    undecided: 'overview.now.disabled.undecided',
  },
  validate: {
    holds: 'overview.now.validate.holds',
    fails: 'overview.now.validate.fails',
    undecided: 'overview.now.validate.undecided',
  },
  skip: {
    holds: 'overview.now.skip.holds',
    fails: 'overview.now.skip.fails',
    undecided: 'overview.now.skip.undecided',
  },
} as const satisfies Record<string, Record<RuleVerdict['outcome'], BuilderMessageId>>

/** The kinds a condition decides — every kind the editor writes a condition for. */
function decidesByCondition(kind: LogicRule['kind']): kind is keyof typeof EFFECT {
  return kindWrites(kind) === 'condition' && kind in EFFECT
}

function comparisonsOf(group: ConditionGroup): Condition[] {
  return group.conditions.flatMap((item) => (isGroup(item) ? comparisonsOf(item) : [item]))
}

/** Every top-level answer is a variable, declared \`dyn\` as the engine declares them. */
function decide(
  cel: string,
  document: FormSchema,
  answers: Readonly<Record<string, unknown>>,
  capabilities: Capabilities,
): RuleVerdict['outcome'] {
  const variables = Object.fromEntries(topLevelKeys(document).map((key) => [key, 'dyn' as const]))
  const values = Object.fromEntries(
    topLevelKeys(document).map((key) => [key, answers[key] ?? null]),
  )
  const compiled = compile(cel, { kind: 'visible', variables })
  if (!compiled.ok) return 'undecided'
  const outcome = evaluate(compiled.program, values, { capabilities })
  if (!outcome.ok) return 'undecided'
  return outcome.value === true ? 'holds' : 'fails'
}

function topLevelKeys(document: FormSchema): string[] {
  const keys: string[] = []
  const walk = (fields: FormSchema['model']['fields']): void => {
    for (const field of fields) {
      if (field.type === 'page') walk(field.fields ?? [])
      else keys.push(field.key)
    }
  }
  walk(document.model.fields)
  return keys
}

function read(answers: Readonly<Record<string, unknown>>, path: string): unknown {
  let current: unknown = answers
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}
