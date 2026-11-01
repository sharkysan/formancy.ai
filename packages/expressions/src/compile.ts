import { check } from './check.js'
import type { ExpressionError } from './errors.js'
import type { ExpressionKind } from './kinds.js'
import type { StructuralLimits } from './limits.js'
import { parse } from './parse.js'
import type { ParsedExpression } from './parse.js'
import { calledFunctions, inexactSteps } from './program-facts.js'
import type { FunctionCall, InexactStep } from './program-facts.js'
import { referencedPaths } from './references.js'
import type { ResultType, VariableDeclarations } from './types.js'

export interface CompileOptions {
  readonly kind: ExpressionKind
  readonly variables: VariableDeclarations
  readonly limits?: Partial<StructuralLimits> | undefined
  /** Refuse the clock and the random source, whatever the kind allows; see `CheckOptions`. */
  readonly reproducible?: boolean | undefined
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
  /** The functions it calls, each at its call; see `calledFunctions`. */
  readonly calls: readonly FunctionCall[]
  /** Where it computes through a double or divides integers; see `inexactSteps`. */
  readonly inexact: readonly InexactStep[]
}

/** The internal view of a program; see `Program`. */
export interface CompiledProgram extends Program {
  readonly parsed: ParsedExpression
  readonly variables: VariableDeclarations
}

export type CompileOutcome = { readonly ok: true; readonly program: Program } | { readonly ok: false; readonly error: ExpressionError }

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

  const checked = check(parsed.ast, { kind: options.kind, reproducible: options.reproducible })
  if (!checked.ok) return checked

  const ast = parsed.ast as ParsedExpression
  const program: CompiledProgram = {
    source,
    kind: options.kind,
    resultType: checked.type,
    references: referencedPaths(ast),
    // After the check, which writes the types `inexactSteps` reads onto the nodes.
    calls: calledFunctions(ast.node),
    inexact: inexactSteps(ast.node),
    parsed: ast,
    variables: options.variables,
  }
  return { ok: true, program }
}
