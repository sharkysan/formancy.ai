import { check } from './check.js'
import type { ExpressionError } from './errors.js'
import type { ExpressionKind } from './kinds.js'
import type { StructuralLimits } from './limits.js'
import { parse } from './parse.js'
import type { ParsedExpression } from './parse.js'
import { referencedPaths } from './references.js'
import type { ResultType, VariableDeclarations } from './types.js'

export interface CompileOptions {
  readonly kind: ExpressionKind
  readonly variables: VariableDeclarations
  readonly limits?: Partial<StructuralLimits> | undefined
}

/**
 * An expression that has passed every gate and can be evaluated as often as
 * the engine likes.
 *
 * Holding on to one matters: parsing is the expensive part and evaluation is
 * the hot path, so a form recompiles when it is saved and never again.
 */
export interface Program {
  readonly source: string
  readonly kind: ExpressionKind
  readonly resultType: ResultType
  /** The variable paths this expression reads; see `referencedPaths`. */
  readonly references: readonly string[]
}

/** The internal view of a program; see `Program`. */
export interface CompiledProgram extends Program {
  readonly parsed: ParsedExpression
  readonly variables: VariableDeclarations
}

export type CompileOutcome =
  | { readonly ok: true; readonly program: Program }
  | { readonly ok: false; readonly error: ExpressionError }

/**
 * Parse, limit-check, type-check and policy-check an expression in one step.
 *
 * Everything that can be decided without data is decided here, when the form
 * author saves, so that a submitted form can only fail for reasons that depend
 * on the data itself.
 */
export function compile(source: string, options: CompileOptions): CompileOutcome {
  const parsed = parse(source, {
    variables: options.variables,
    limits: options.limits,
  })
  if (!parsed.ok) return parsed

  const checked = check(parsed.ast, { kind: options.kind })
  if (!checked.ok) return checked

  const program: CompiledProgram = {
    source,
    kind: options.kind,
    resultType: checked.type,
    references: referencedPaths(parsed.ast),
    parsed: parsed.ast as ParsedExpression,
    variables: options.variables,
  }
  return { ok: true, program }
}
