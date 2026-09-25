import type { FieldDef, LogicRule } from '@formancy/spec'
import type { ExpressionError } from '@formancy/expressions'

/**
 * The engine's refusal of one rule, in words an author can act on.
 *
 * The expression package says what is wrong with the expression; this adds
 * what to write instead, when that can be said with confidence. The package's
 * own hints — the decimal ones — are carried through as well. Until now they
 * were attached to the error and then dropped by the one caller whose message
 * actually reaches an author: the engine, whose refusal is what the publish
 * gate, `validate_form` and the builder's authoring loop all report.
 */
export function refusedRule(
  rule: LogicRule,
  error: ExpressionError,
  fields: ReadonlyMap<string, FieldDef>,
): string {
  const hint = error.hint ?? conditionHint(rule, error, fields)
  return `Rule on "${rule.target}" (${rule.kind}): ${error.message}${hint === undefined ? '' : ` ${hint}`}`
}

/**
 * A checkbox written as a condition on its own.
 *
 * `halfBoard` is the most natural thing to write for "show this when the box
 * is ticked", and it is refused, correctly: a box nobody has touched is null,
 * CEL has no nullable bool, so the engine declares the field `dyn` — and a
 * condition has to be certain to produce a bool, or a rule over an untouched
 * box would fail open and show what it was meant to hide. The expression
 * package can only say "produces dyn", which means nothing to the person who
 * wrote it. The fix is always the same, so it is said.
 */
function conditionHint(
  rule: LogicRule,
  error: ExpressionError,
  fields: ReadonlyMap<string, FieldDef>,
): string | undefined {
  if (error.code !== 'result_type_not_allowed') return undefined
  const name = rule.cel.trim()
  if (fields.get(name)?.type !== 'checkbox') return undefined
  return `A checkbox nobody has touched is null rather than false, so it cannot be a condition on its own: write ${name} == true.`
}
