import { childNodes } from './ast.js'
import type { CelNode, ExpressionAst } from './ast.js'
import { translateCelError } from './cel.js'
import { decimalFromString } from './decimal.js'
import { ExpressionError, withHint } from './errors.js'
import { KIND_POLICIES } from './kinds.js'
import type { ExpressionKind, KindPolicy } from './kinds.js'
import type { ParsedExpression } from './parse.js'
import type { ResultType } from './types.js'

export interface CheckOptions {
  readonly kind: ExpressionKind
}

export type CheckOutcome =
  | { readonly ok: true; readonly type: ResultType }
  | { readonly ok: false; readonly error: ExpressionError }

/**
 * Check a parsed expression against the environment it was parsed with and
 * against the policy of its kind.
 *
 * Everything here happens when the form author saves, never when a user
 * submits: an undeclared field, a mistyped comparison or a call the kind does
 * not permit must be impossible to persist.
 */
export function check(ast: ExpressionAst, options: CheckOptions): CheckOutcome {
  const parsed = ast as ParsedExpression
  if (!parsed.declared) {
    // Without declarations every identifier is dyn and the type checker agrees
    // with anything, so a check that looked like it passed would be worthless.
    throw new TypeError('check needs an expression parsed with variable declarations')
  }
  const policy = KIND_POLICIES[options.kind]

  const outcome = parsed.program.check()
  if (!outcome.valid) {
    const error = translateCelError(outcome.error, parsed.source)
    const hint = hintForTypeError(error.message, parsed)
    return { ok: false, error: hint === undefined ? error : withHint(error, hint) }
  }

  const badLiteral = findInvalidDecimalLiteral(parsed.node, parsed.source)
  if (badLiteral !== undefined) return { ok: false, error: badLiteral }

  // Type checking first: a misspelled function should be reported as unknown
  // rather than as forbidden, which would send the author looking for a
  // permission they cannot grant.
  const forbidden = findForbiddenCall(parsed.node, policy, options.kind, parsed.source)
  if (forbidden !== undefined) return { ok: false, error: forbidden }

  if (policy.resultTypes !== 'any' && !policy.resultTypes.has(outcome.type)) {
    return {
      ok: false,
      error: new ExpressionError({
        kind: 'policy',
        code: 'result_type_not_allowed',
        message: `A ${options.kind} expression must produce ${describe(policy.resultTypes)}, but this one produces ${outcome.type}.`,
        source: parsed.source,
        position: { start: parsed.node.start, end: parsed.node.end },
      }),
    }
  }

  return { ok: true, type: outcome.type }
}

/**
 * The allow-list is checked on the AST rather than by leaving functions out of
 * the environment, because the set differs per kind and the environment is
 * shared. A name that reaches evaluation is therefore one that two independent
 * gates agreed on.
 */
function findForbiddenCall(
  node: CelNode,
  policy: KindPolicy,
  kind: ExpressionKind,
  source: string,
): ExpressionError | undefined {
  const called = calledFunctionName(node)
  if (called !== undefined && !policy.allowedFunctions.has(called)) {
    return new ExpressionError({
      kind: 'policy',
      code: 'function_not_allowed',
      message: `${called}() cannot be used in a ${kind} expression.`,
      source,
      position: { start: node.start, end: node.end },
      hint: `Allowed here: ${[...policy.allowedFunctions].sort().join(', ')}.`,
    })
  }

  for (const child of childNodes(node)) {
    const forbidden = findForbiddenCall(child, policy, kind, source)
    if (forbidden !== undefined) return forbidden
  }
  return undefined
}

/**
 * Turn the implementation's overload message into advice.
 *
 * `no such overload: decimal * double` is accurate and tells a form author
 * nothing. The missing overload is deliberate — see `decimal.ts` — so the
 * error has to carry the way to write what they meant.
 */
function hintForTypeError(message: string, parsed: ParsedExpression): string | undefined {
  if (!/no such overload:.*\bdecimal\b/.test(message)) return undefined

  if (/decimal \/ decimal/.test(message)) {
    return 'Decimal division needs a number of places: write divide(a, b, 2).'
  }
  if (!/\b(double|u?int)\b/.test(message)) return undefined

  const literal = firstNumericLiteral(parsed.node, parsed.source)
  const replacement = literal === undefined ? 'dec("0.19")' : `dec(${JSON.stringify(literal)})`
  const offending = literal === undefined ? 'the plain number' : literal
  return `Write ${replacement} instead of ${offending}: mixing decimal with double or int would give back the rounding error decimal exists to avoid.`
}

function firstNumericLiteral(node: CelNode, source: string): string | undefined {
  if (node.op === 'value' && (typeof node.args === 'number' || typeof node.args === 'bigint')) {
    return source.slice(node.start, node.end)
  }
  for (const child of childNodes(node)) {
    const found = firstNumericLiteral(child, source)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * `dec("nineteen ninety")` type-checks, because its argument is a string. The
 * argument is almost always a literal, and a literal can be validated now
 * rather than at the moment a user submits the form.
 */
function findInvalidDecimalLiteral(node: CelNode, source: string): ExpressionError | undefined {
  if (node.op === 'call') {
    const [name, args] = node.args as [string, CelNode[]]
    const argument = Array.isArray(args) && args.length === 1 ? args[0] : undefined
    if (name === 'dec' && argument?.op === 'value' && typeof argument.args === 'string') {
      try {
        decimalFromString(argument.args)
      } catch (error) {
        return new ExpressionError({
          kind: 'type',
          code: 'invalid_decimal_literal',
          message: `${JSON.stringify(argument.args)} is not a decimal number.`,
          source,
          position: { start: argument.start, end: argument.end },
          hint: 'Write the digits with an optional sign and decimal point, e.g. dec("19.90").',
          cause: error,
        })
      }
    }
  }

  for (const child of childNodes(node)) {
    const invalid = findInvalidDecimalLiteral(child, source)
    if (invalid !== undefined) return invalid
  }
  return undefined
}

function calledFunctionName(node: CelNode): string | undefined {
  if (node.op !== 'call' && node.op !== 'rcall') return undefined
  const name = (node.args as [string, ...unknown[]])[0]
  return typeof name === 'string' ? name : undefined
}

function describe(types: ReadonlySet<string>): string {
  return [...types].sort().join(' or ')
}
