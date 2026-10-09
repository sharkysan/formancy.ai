import type { FieldDef } from '@formancy/spec'
import { BUILDER_MESSAGES } from './messages.js'

/**
 * Compiling a structured condition to CEL.
 *
 * The builder edits a condition, not an expression: a form author choosing
 * "Country is Switzerland" should not have to know that `==` compares and `=`
 * does not exist. The CEL it produces is the single source of truth for
 * evaluation, and the structured form is stored beside it as `editor`
 * metadata — never evaluated, only re-read to reopen the condition here. If
 * both were evaluable, client and server drift would return through the side
 * door (see the spec's note on `{cel, editor}`).
 */

export type Operator =
  | 'is'
  | 'isNot'
  | 'isMoreThan'
  | 'isLessThan'
  | 'isAtLeast'
  | 'isAtMost'
  | 'isBefore'
  | 'isAfter'
  | 'contains'
  | 'doesNotContain'
  | 'includes'
  | 'doesNotInclude'
  | 'isAnswered'
  | 'isNotAnswered'

export interface Condition {
  /** A data path: `country`, `billing.city`, `items[].qty`. */
  field: string
  operator: Operator
  /** Absent for the operators that take no value. */
  value?: string | number | boolean | null
  /**
   * What the field's answer is. Absent in a condition written before this existed,
   * which compiles as it always did. It matters to one question: whether a list of
   * ticks or files is answered, which an empty list is not.
   */
  answer?: AnswerKind
}

/**
 * Several comparisons, joined one way — and at most one level of groups inside.
 *
 * **One level, deliberately.** "(A and B) or C" is a question people ask, and a flat
 * list cannot say it; three levels in, nobody can tell what the parentheses do. So a
 * group may hold comparisons and groups of comparisons, and a group inside a group
 * holds comparisons only. Somebody who needs more can eject to CEL
 * ([0127](../../../docs/decisions/0127-a-condition-nests-one-level.md)).
 */
export interface ConditionGroup {
  join: 'all' | 'any'
  conditions: ReadonlyArray<Condition | ConditionGroup>
}

export function isGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return 'conditions' in item
}

/**
 * What a field's answer is, which decides what it can be compared with.
 *
 * Asked of the field rather than of the value typed, because the value is text in a
 * box until it is narrowed: a choice whose stored value is `"10"` is a string, and
 * narrowing the typed `10` to a number compared a string field to a double — a type
 * error CEL catches at save time, for a condition the author built correctly.
 */
export type AnswerKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'choice'
  | 'list'
  | 'date'
  | 'time'
  | 'datetime'
  | 'files'
  | 'other'

export function answerKindOf(def: Pick<FieldDef, 'type'>): AnswerKind {
  switch (def.type) {
    case 'text':
    case 'textarea':
    case 'hidden':
      return 'text'
    case 'number':
      return 'number'
    case 'checkbox':
      return 'boolean'
    case 'select':
    case 'radio':
      return 'choice'
    case 'selectboxes':
      return 'list'
    case 'file':
      return 'files'
    case 'date':
    case 'time':
    case 'datetime':
      return def.type
    default:
      return 'other'
  }
}

/**
 * The comparisons a kind of answer can take, in the order a builder offers them.
 *
 * Words that fit the answer: a date is before or after, a number is more or less,
 * text contains, a list of ticks includes. "Is answered" is offered for everything,
 * because every answer can be missing.
 */
const BY_KIND: Readonly<Record<AnswerKind, readonly Operator[]>> = {
  text: ['is', 'isNot', 'contains', 'doesNotContain', 'isAnswered', 'isNotAnswered'],
  number: [
    'is',
    'isNot',
    'isMoreThan',
    'isLessThan',
    'isAtLeast',
    'isAtMost',
    'isAnswered',
    'isNotAnswered',
  ],
  boolean: ['is', 'isNot'],
  choice: ['is', 'isNot', 'isAnswered', 'isNotAnswered'],
  list: ['includes', 'doesNotInclude', 'isAnswered', 'isNotAnswered'],
  date: ['is', 'isNot', 'isBefore', 'isAfter', 'isAnswered', 'isNotAnswered'],
  time: ['is', 'isNot', 'isBefore', 'isAfter', 'isAnswered', 'isNotAnswered'],
  datetime: ['is', 'isNot', 'isBefore', 'isAfter', 'isAnswered', 'isNotAnswered'],
  files: ['isAnswered', 'isNotAnswered'],
  other: ['isAnswered', 'isNotAnswered'],
}

export function operatorsFor(kind: AnswerKind): readonly Operator[] {
  return BY_KIND[kind]
}

const NO_VALUE: ReadonlySet<Operator> = new Set(['isAnswered', 'isNotAnswered'])

/** Whether a comparison is with a value, or about whether there is one. */
export function operatorTakesValue(operator: Operator): boolean {
  return !NO_VALUE.has(operator)
}

/**
 * The comparisons the editor offers, in English. The words are the
 * catalogue's `operator.<id>`, read rather than copied, for the reason
 * `RULE_KIND_CHOICES` reads its own.
 */
export const OPERATORS: ReadonlyArray<{ id: Operator; label: string; takesValue: boolean }> = (
  [
    'is',
    'isNot',
    'isMoreThan',
    'isLessThan',
    'isAtLeast',
    'isAtMost',
    'isBefore',
    'isAfter',
    'contains',
    'doesNotContain',
    'includes',
    'doesNotInclude',
    'isAnswered',
    'isNotAnswered',
  ] as const
).map((id) => ({ id, label: BUILDER_MESSAGES[`operator.${id}`], takesValue: operatorTakesValue(id) }))

/**
 * A value as a CEL literal.
 *
 * Hand-rolled quoting is how an apostrophe in somebody's surname becomes a
 * syntax error and a backslash becomes something worse — `"C:\"` escapes the
 * closing quote and the expression runs on into whatever follows. Every
 * troublesome character is escaped explicitly rather than hoped about.
 */
export function celLiteral(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  if (typeof value === 'number') {
    // Always a double. CEL does not convert implicitly, and every number a
    // form collects is a double — so `qty > 5` against one is a type error at
    // check time, and `qty > 5.0` is what the author meant.
    return Number.isInteger(value) ? `${String(value)}.0` : String(value)
  }

  const escaped = value
    // Backslash first, or it would escape the escapes added below.
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
  return `"${escaped}"`
}

/**
 * The path as the engine will see it at evaluation time.
 *
 * Inside a repeater row the engine binds `item`, so a rule about a field in
 * the same row says `item.qty`. Saying `qty` would look for a top-level field
 * that does not exist.
 */
function reference(field: string): { path: string; inGroup: boolean; inRow: boolean } {
  const marker = field.indexOf('[]')
  if (marker === -1) return { path: field, inGroup: field.includes('.'), inRow: false }
  const own = field.slice(marker + '[].'.length)
  return { path: `item.${own}`, inGroup: own.includes('.'), inRow: true }
}

/**
 * A compiled comparison, and the weakest operator it is joined by at its top level —
 * which is what decides whether it needs parentheses where it is used.
 */
interface Compiled {
  cel: string
  /** `or` when the expression is an `||` at its top, `and` for `&&`, `atom` otherwise. */
  top: 'atom' | 'and' | 'or'
}

/**
 * The CEL for one condition, guarded so that a missing answer is an answer.
 *
 * **Every comparison that reads a value checks it is there first.** Unguarded, two
 * conditions the editor produced threw on a form nobody had touched, and a rule that
 * throws fails open — so the field it was meant to hide was shown
 * ([0022](../../../docs/decisions/0022-fail-open-fail-closed.md)). Measured: `visible`
 * on `address.country == "CH"` left its field visible on an empty form, because the
 * group itself is null and reading into it throws; and `qty > 5.0` throws on an empty
 * number, because CEL has no `>` between null and a double. `has()` is the one guard
 * that answers for a path into a group; `!= null` is enough at the top level, where
 * the field always exists and is null when unanswered.
 */
export function compileCondition(condition: Condition): string {
  return compiled(condition).cel
}

function compiled(condition: Condition): Compiled {
  const { path, inGroup, inRow } = reference(condition.field)
  const value = celLiteral(condition.value)
  // A list is not compared with null at all: the type checker refuses `list != null`,
  // and `size()` and `in` already answer for a list nobody touched — measured. Both
  // renderers store a list with every tick taken off as `[]`, which is not an
  // answer, so for a list "answered" is a length.
  //
  // Except in a row. The row is read through `item`, which the checker types as
  // dynamic, so `!= null` is allowed there — and needed: a list in a row nobody has
  // touched is null rather than `[]`. Measured: `"gift" in item.tags` threw on a
  // fresh row and the rule failed open
  // ([0129](../../../docs/decisions/0129-a-row-rule-is-written-in-the-row.md)).
  const isList = condition.answer === 'list' || condition.answer === 'files'
  const neverNull = isList && !inRow
  const present = neverNull
    ? inGroup
      ? `has(${path})`
      : ''
    : inGroup
      ? `has(${path}) && ${path} != null`
      : `${path} != null`
  const absent = inGroup ? `!has(${path}) || ${path} == null` : `${path} == null`
  // A read of a value nobody gave, only where a missing value would throw or answer
  // wrongly: `==` and `!=` against null already answer at the top level.
  const read = (expression: string): Compiled =>
    present === ''
      ? { cel: expression, top: 'atom' }
      : { cel: `${present} && ${expression}`, top: 'and' }

  switch (condition.operator) {
    case 'isAnswered':
      // Not a truthiness test: an unanswered field is null, and a bare
      // `country` is a type error on a string field rather than the falsey
      // check somebody arriving from JavaScript expects.
      if (isList) return read(`size(${path}) > 0`)
      return { cel: present, top: inGroup ? 'and' : 'atom' }
    case 'isNotAnswered':
      if (isList) {
        if (!neverNull) return { cel: `${absent} || size(${path}) == 0`, top: 'or' }
        return inGroup
          ? { cel: `!has(${path}) || size(${path}) == 0`, top: 'or' }
          : { cel: `size(${path}) == 0`, top: 'atom' }
      }
      return { cel: absent, top: inGroup ? 'or' : 'atom' }
    case 'is':
      return inGroup ? read(`${path} == ${value}`) : { cel: `${path} == ${value}`, top: 'atom' }
    case 'isNot':
      return inGroup
        ? { cel: `${absent} || ${path} != ${value}`, top: 'or' }
        : { cel: `${path} != ${value}`, top: 'atom' }
    case 'isMoreThan':
    case 'isAfter':
      return read(`${path} > ${value}`)
    case 'isLessThan':
    case 'isBefore':
      return read(`${path} < ${value}`)
    case 'isAtLeast':
      return read(`${path} >= ${value}`)
    case 'isAtMost':
      return read(`${path} <= ${value}`)
    case 'contains':
      return read(`${path}.contains(${value})`)
    case 'doesNotContain':
      return { cel: `!(${read(`${path}.contains(${value})`).cel})`, top: 'atom' }
    case 'includes':
      return read(`${value} in ${path}`)
    case 'doesNotInclude':
      return { cel: `!(${read(`${value} in ${path}`).cel})`, top: 'atom' }
  }
}

/**
 * The CEL for a group of comparisons.
 *
 * A group of one compiles to exactly what `compileCondition` produces on its own,
 * no join and no parentheses. A part is parenthesised only where precedence needs it
 * — an `||` inside an `&&` — and a group inside a group always is, because a reader
 * checking the preview should see the grouping they built.
 */
export function compileGroup(group: ConditionGroup): string {
  return compiledGroup(group, 0).cel
}

function compiledGroup(group: ConditionGroup, depth: number): Compiled {
  if (group.conditions.length === 0) {
    // An empty group would compile to nothing, and a rule whose expression is
    // empty passes silently. An authoring mistake has to be visible as one.
    throw new Error('A condition needs at least one comparison.')
  }
  if (depth > 1) {
    // The editor cannot build one; a hand-made `editor` object could. Refused rather
    // than compiled, so the limit is the format's and not only the editor's.
    throw new Error('A group inside a group inside a group cannot be compiled.')
  }

  const parts = group.conditions.map((item) =>
    isGroup(item) ? nested(compiledGroup(item, depth + 1), item) : compiled(item),
  )
  if (parts.length === 1) return parts[0]!

  const join = group.join === 'all' ? 'and' : 'or'
  const cel = parts
    .map((part) => (join === 'and' && part.top === 'or' ? `(${part.cel})` : part.cel))
    .join(join === 'and' ? ' && ' : ' || ')
  return { cel, top: join }
}

/** A group inside a group, parenthesised when it has more than one part to show. */
function nested(part: Compiled, group: ConditionGroup): Compiled {
  return group.conditions.length > 1 ? { cel: `(${part.cel})`, top: 'atom' } : part
}
