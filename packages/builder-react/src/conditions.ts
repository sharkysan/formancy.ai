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
  | 'isAnswered'
  | 'isNotAnswered'

export interface Condition {
  /** A data path: `country`, `billing.city`, `items[].qty`. */
  field: string
  operator: Operator
  /** Absent for the operators that take no value. */
  value?: string | number | boolean | null
}

export const OPERATORS: ReadonlyArray<{ id: Operator; label: string; takesValue: boolean }> = [
  { id: 'is', label: 'is', takesValue: true },
  { id: 'isNot', label: 'is not', takesValue: true },
  { id: 'isMoreThan', label: 'is more than', takesValue: true },
  { id: 'isLessThan', label: 'is less than', takesValue: true },
  { id: 'isAnswered', label: 'is answered', takesValue: false },
  { id: 'isNotAnswered', label: 'is not answered', takesValue: false },
]

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
function reference(field: string): string {
  const inRow = field.indexOf('[]')
  if (inRow === -1) return field
  return `item.${field.slice(inRow + '[].'.length)}`
}

/** The CEL for one condition. */
export function compileCondition(condition: Condition): string {
  const target = reference(condition.field)

  switch (condition.operator) {
    case 'isAnswered':
      // Not a truthiness test: an unanswered field is null, and a bare
      // `country` is a type error on a string field rather than the falsey
      // check somebody arriving from JavaScript expects.
      return `${target} != null`
    case 'isNotAnswered':
      return `${target} == null`
    case 'isNot':
      return `${target} != ${celLiteral(condition.value)}`
    case 'isMoreThan':
      return `${target} > ${celLiteral(condition.value)}`
    case 'isLessThan':
      return `${target} < ${celLiteral(condition.value)}`
    case 'is':
      return `${target} == ${celLiteral(condition.value)}`
  }
}
