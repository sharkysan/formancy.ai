import { compile, evaluate } from '@formancy/expressions'
import type { Capabilities, Program, VariableDeclarations } from '@formancy/expressions'
import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { compileCondition, isGroup } from './conditions.js'
import type { Condition, ConditionGroup } from './conditions.js'
import { conditionFields } from './condition-draft.js'
import type { ConditionField } from './condition-draft.js'
import { kindWrites, operatorLabel, ruleKindLabel, ruleTargetFor } from './logic.js'
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
  const rules = document.logic?.rules ?? []
  const groups = new Map<string, RulesOn>()

  // In the order the form asks its questions, so the overview reads the way the form
  // does; a rule on a target the tree does not know still appears, at the end.
  for (const node of flatten(document)) {
    const { target } = ruleTargetFor(document, node.keyPath)
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
      // In the rule's own scope, so a field in its row is named as being in this row.
      ...(editor === undefined
        ? {}
        : {
            sentence: describeCondition(
              editor,
              conditionFields(document, { target: rule.target, text }),
              text,
            ),
          }),
      written: rule.check ?? rule.cel ?? '',
    })
  })
  return [...groups.values()]
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
  // `explainRows` gives it one per row.
  if (rule.target.includes('[]')) return undefined
  return verdictOn(
    rule.kind,
    compiledRule(rule, document, false),
    valuesOf(topLevelKeys(document), answers),
    answers,
    undefined,
    conditionFields(document),
    text,
    capabilities,
  )
}

/** One row's verdict, and which row it is. */
export interface RowVerdict extends RuleVerdict {
  /** Counted from one, as the preview counts its rows. */
  row: number
  /** "Row 2", in the author's language. */
  label: string
}

/**
 * A rule in a repeater row's verdict on each row the preview holds.
 *
 * Each row is evaluated as the engine evaluates it: the form's answers, `item` bound to
 * the row with every field of the row present — null where nobody typed, since reading a
 * missing key throws — and `index`. An explanation that disagreed with the preview would
 * be worse than none ([0128](../../../docs/decisions/0128-a-form-says-why-a-field-is-hidden.md)),
 * and a row bound any other way does: a comparison on an untouched field would be
 * explained as undecided, about a field the engine decided.
 *
 * Undefined for a rule about the whole form, which `explainRule` explains, and for the
 * kinds a condition does not decide; empty when the preview has no rows.
 */
export function explainRows(
  rule: LogicRule,
  document: FormSchema,
  answers: Readonly<Record<string, unknown>>,
  text: BuilderText,
  capabilities: Capabilities,
): RowVerdict[] | undefined {
  if (!decidesByCondition(rule.kind) || rule.cel === undefined) return undefined
  if (!rule.target.includes('[]')) return undefined
  const wire = rule.target.slice(0, rule.target.indexOf('[]'))
  const template = repeaterFieldsAt(document.model.fields, wire)
  if (template === undefined) return undefined
  const rows = read(answers, wire)
  if (!Array.isArray(rows)) return []

  // In the rule's own scope, so a field in its row is named as being in this row.
  const fields = conditionFields(document, { target: rule.target, text })
  // Compiled once and evaluated per row: compiling is most of the cost, and it is the
  // same expression in every row.
  const compiled = compiledRule(rule, document, true)
  const form = valuesOf(topLevelKeys(document), answers)
  const { kind } = rule
  return rows.map((row: unknown, index) => {
    const scope = { wire, item: withEveryField(template, row), index }
    return {
      row: index + 1,
      label: text('overview.row', { number: index + 1 }),
      ...verdictOn(
        kind,
        compiled,
        { ...form, item: scope.item, index },
        answers,
        scope,
        fields,
        text,
        capabilities,
      ),
    }
  })
}

/** One row of a repeater, bound as the engine binds it. */
interface RowScope {
  /** The repeater's data path: `items` for a rule on `items[].note`. */
  wire: string
  item: Record<string, unknown>
  index: number
}

/**
 * A rule compiled for where it is read — the form, or a row of it — with every comparison
 * the condition editor wrote, each compiled on its own so it can say whether it held.
 */
interface CompiledRule {
  rule: Program | undefined
  comparisons: ReadonlyArray<{ condition: Condition; program: Program | undefined }>
}

function compiledRule(rule: LogicRule, document: FormSchema, inRow: boolean): CompiledRule {
  const editor = asGroup(rule.editor)
  return {
    rule: compiledFor(rule.cel ?? '', document, inRow),
    comparisons:
      editor === undefined
        ? []
        : comparisonsOf(editor).map((condition) => ({
            condition,
            program: compiledFor(compileCondition(condition), document, inRow),
          })),
  }
}

function verdictOn(
  kind: keyof typeof EFFECT,
  compiled: CompiledRule,
  values: Readonly<Record<string, unknown>>,
  answers: Readonly<Record<string, unknown>>,
  row: RowScope | undefined,
  fields: readonly ConditionField[],
  text: BuilderText,
  capabilities: Capabilities,
): RuleVerdict {
  const outcome = decide(compiled.rule, values, capabilities)
  const because = compiled.comparisons.map(({ condition, program }) => {
    const said = describeComparison(condition, fields, text)
    if (decide(program, values, capabilities) === 'holds') {
      return text('overview.because.holds', { comparison: said })
    }
    const actual = answerTo(condition.field, answers, row)
    const field = fields.find((candidate) => candidate.path === condition.field)
    return actual === null || actual === undefined || (Array.isArray(actual) && actual.length === 0)
      ? text('overview.because.failsEmpty', { comparison: said })
      : text('overview.because.fails', { comparison: said, actual: valueInWords(actual, field, text) })
  })
  return { outcome, effect: text(EFFECT[kind][outcome]), because }
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

/** What a rule in a repeater row reads beside the form's fields, typed as the engine types it. */
const ROW_VARIABLES: VariableDeclarations = { item: 'map', index: 'int' }

/**
 * Every top-level answer is a variable, declared \`dyn\` as the engine declares them; in
 * a row, so are the row and its index. Undefined for CEL that does not compile, which
 * cannot be decided.
 */
function compiledFor(cel: string, document: FormSchema, inRow: boolean): Program | undefined {
  const variables: VariableDeclarations = {
    ...Object.fromEntries(topLevelKeys(document).map((key) => [key, 'dyn' as const])),
    ...(inRow ? ROW_VARIABLES : {}),
  }
  const compiled = compile(cel, { kind: 'visible', variables })
  return compiled.ok ? compiled.program : undefined
}

/** Every top-level answer, null where there is none, as the engine binds them. */
function valuesOf(
  keys: readonly string[],
  answers: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, answers[key] ?? null]))
}

function decide(
  program: Program | undefined,
  values: Readonly<Record<string, unknown>>,
  capabilities: Capabilities,
): RuleVerdict['outcome'] {
  if (program === undefined) return 'undecided'
  const outcome = evaluate(program, values, { capabilities })
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

/**
 * The fields of the repeater at a data path — pages transparent, a group a dot — or
 * undefined when nothing there is a repeater.
 */
function repeaterFieldsAt(fields: readonly FieldDef[], wire: string, scope = ''): readonly FieldDef[] | undefined {
  for (const field of fields) {
    if (field.type === 'page') {
      const found = repeaterFieldsAt(field.fields ?? [], wire, scope)
      if (found !== undefined) return found
    } else if (field.type === 'group') {
      const found = repeaterFieldsAt(field.fields ?? [], wire, `${scope}${field.key}.`)
      if (found !== undefined) return found
    } else if (field.type === 'repeater' && `${scope}${field.key}` === wire) {
      return field.fields ?? []
    }
  }
  return undefined
}

/**
 * A row with every field of the repeater present, null where nobody typed — the engine's
 * row: reading a missing key throws in CEL, and a row nobody has touched yet has none.
 */
function withEveryField(fields: readonly FieldDef[], row: unknown): Record<string, unknown> {
  const item: Record<string, unknown> =
    typeof row === 'object' && row !== null && !Array.isArray(row)
      ? { ...(row as Record<string, unknown>) }
      : {}
  for (const field of fields) {
    if (field.type === 'page') Object.assign(item, withEveryField(field.fields ?? [], item))
    else if (field.type === 'group') item[field.key] = withEveryField(field.fields ?? [], item[field.key])
    else if (field.type !== 'repeater' && item[field.key] === undefined) item[field.key] = null
  }
  return item
}

/** An answer a comparison read: in the row for a field of the row, in the form otherwise. */
function answerTo(
  path: string,
  answers: Readonly<Record<string, unknown>>,
  row: RowScope | undefined,
): unknown {
  const inRow = row === undefined ? undefined : `${row.wire}[].`
  return inRow !== undefined && path.startsWith(inRow)
    ? read(row?.item ?? {}, path.slice(inRow.length))
    : read(answers, path)
}

function read(answers: Readonly<Record<string, unknown>>, path: string): unknown {
  let current: unknown = answers
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}
