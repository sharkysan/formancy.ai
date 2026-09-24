import { check, parse } from '@formancy/expressions'
import type { DeclaredType, VariableDeclarations } from '@formancy/expressions'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { topLevelDataFields } from './engine.js'

/**
 * Expressions that can never work, found before a form is published.
 *
 * **The problem this exists for.** The engine declares every leaf field as
 * `dyn`, because a field is empty while somebody is typing into it and CEL has
 * no nullable scalars — a stricter declaration would make an unfinished answer
 * a type error on every keystroke. `dyn` agrees with anything, so the type
 * checker passes `seats * 4` happily. CEL is strongly typed at runtime though,
 * and a JSON number is a double: `double * int` has no overload, the
 * evaluation fails, and the engine writes nothing.
 *
 * Writing nothing is the right answer to a *half-filled* input — the previous
 * value stands until the inputs make sense — and it is the wrong answer to an
 * expression that will fail for every value anybody ever types. The engine
 * cannot tell those apart at runtime, so `seats * 4` leaves a computed field
 * empty forever with nothing said anywhere.
 *
 * **What this does.** Type-checks each rule a second time with leaves declared
 * as the model says, and reports only the failures that strictness is reliably
 * right about. That second run is deliberately not the engine's: declaring a
 * `number` field as `double` makes `seats == null` a type error, and checking
 * whether an optional field is empty is a perfectly good thing to write. So
 * the strict result is consulted, not obeyed.
 *
 * **Where it runs.** At publish, not at render. A form already out there with
 * this mistake renders as it always has — one field that never fills in —
 * rather than failing to open for somebody halfway through filling it in. New
 * ones cannot be published.
 */

export interface ExpressionProblem {
  /** The rule's target, as written. */
  target: string
  kind: LogicRule['kind']
  cel: string
  /** What the author has to change, in their words. */
  message: string
}

/**
 * Errors strictness is reliably right about.
 *
 * `no_such_overload` means the operator has no meaning for those two types, so
 * the expression fails for every value rather than for an unfinished one —
 * which is precisely the class the engine cannot tell apart at runtime.
 *
 * One exception, and it is the reason this is a filter rather than a straight
 * pass-through: a comparison with `null` is how somebody asks whether an
 * optional field is empty, and strict declarations make it a type error
 * because CEL has no nullable scalars. So an overload error mentioning `null`
 * is skipped. It also skips a genuinely silly `seats * null`, which returns
 * that one expression to the silence everything had before this existed —
 * a fair trade for never refusing a valid form.
 */
// CEL keeps arithmetic overloads separate across its numeric types, so seeing
// any two of these in one overload error usually means "write 4.0", not "the
// field types are wrong".
const NUMERIC = ['int', 'uint', 'double']
export const MIXED_NUMERIC_LITERAL_EXAMPLE = '4 becomes 4.0'

function reportable(code: string | undefined, message: string): boolean {
  if (code !== 'no_such_overload') return false
  return !message.includes('null')
}

/**
 * Whether the fix is a decimal point.
 *
 * Two numeric types either side of an operator is somebody writing what looks
 * like ordinary arithmetic and meeting CEL's refusal to widen an int. Anything
 * else — `double * string`, say — is a real mistake, and telling that
 * author to write `4.0` would send them looking in the wrong place.
 */
function isMixedNumeric(message: string): boolean {
  return NUMERIC.filter((type) => message.includes(type)).length >= 2
}

/**
 * How a field's answer types, when it has one.
 *
 * Only what the engine already promises about the shape of a stored answer, so
 * this cannot disagree with what actually arrives. A `date` is an ISO string,
 * a choice is its option's value, and the list types are lists. `selectboxes`
 * is a list of selected option values and `file` is a list of stored file
 * metadata objects; both stay `list` here because CEL overload resolution only
 * needs to know that arithmetic and scalar comparisons do not apply.
 */
const STRICT_TYPES: Record<string, DeclaredType> = {
  text: 'string',
  textarea: 'string',
  richtext: 'string',
  date: 'string',
  hidden: 'string',
  static: 'string',
  select: 'string',
  radio: 'string',
  number: 'double',
  checkbox: 'bool',
  selectboxes: 'list',
  file: 'list',
  group: 'map',
  repeater: 'list',
}

/** Row variables, matching the engine's own. */
const ROW_VARIABLES: VariableDeclarations = { item: 'map', index: 'int' }

export function expressionProblems(schema: FormSchema): ExpressionProblem[] {
  const rules = schema.logic?.rules ?? []
  if (rules.length === 0) return []

  const declarations: VariableDeclarations = Object.fromEntries(
    topLevelDataFields(schema.model.fields).map((def): [string, DeclaredType] => [
      def.key,
      STRICT_TYPES[def.type] ?? 'dyn',
    ]),
  )

  const problems: ExpressionProblem[] = []

  for (const rule of rules) {
    const variables = rule.target.includes('[]')
      ? { ...declarations, ...ROW_VARIABLES }
      : declarations

    const parsed = parse(rule.cel, { variables })
    // A parse failure is the engine's business and is already fatal there;
    // reporting it twice, in different words, helps nobody.
    if (!parsed.ok) continue

    const outcome = check(parsed.ast, { kind: rule.kind })
    if (outcome.ok) continue
    if (!reportable(outcome.error.code, outcome.error.message)) continue

    const hint = isMixedNumeric(outcome.error.message)
      ? ` A number field holds a double and CEL will not widen a whole number to meet it, so write the literals with a decimal point — ${MIXED_NUMERIC_LITERAL_EXAMPLE}.`
      : ''

    problems.push({
      target: rule.target,
      kind: rule.kind,
      cel: rule.cel,
      message:
        `Rule on "${rule.target}" (${rule.kind}): ${outcome.error.message}. ` +
        `This evaluates to nothing for every value anybody enters, so the rule ` +
        `never does anything.${hint}`,
    })
  }

  return problems
}
