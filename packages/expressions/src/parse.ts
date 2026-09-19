import type { CelNode, ExpressionAst } from './ast.js'
import { createRuntime, translateCelError } from './cel.js'
import type { CelProgram } from './cel.js'
import type { ExpressionError } from './errors.js'
import { findLimitViolation, resolveLimits } from './limits.js'
import type { StructuralLimits } from './limits.js'
import type { VariableDeclarations } from './types.js'

/** The internal view of a parsed expression; see `ExpressionAst`. */
export interface ParsedExpression extends ExpressionAst {
  readonly node: CelNode
  readonly program: CelProgram
  /** Whether the environment it was parsed with declares the variables. */
  readonly declared: boolean
}

export interface ParseOptions {
  readonly limits?: Partial<StructuralLimits> | undefined
  /**
   * The variables the expression may read. Omit to treat every identifier as
   * dynamic, which is enough to ask an expression what it references but not
   * enough to type-check it.
   */
  readonly variables?: VariableDeclarations | undefined
}

export type ParseOutcome =
  | { readonly ok: true; readonly ast: ExpressionAst }
  | { readonly ok: false; readonly error: ExpressionError }

/**
 * Parse expression source into an AST handle.
 *
 * Returns the failure rather than throwing: a syntax error in an expression a
 * form author is typing is an expected outcome, not an exception.
 */
export function parse(source: string, options?: ParseOptions): ParseOutcome {
  const limits = resolveLimits(options?.limits)

  let program: CelProgram
  try {
    program = createRuntime({ limits, variables: options?.variables }).parse(source)
  } catch (error) {
    return { ok: false, error: translateCelError(error, source) }
  }

  // The parser enforces the limits it knows about while building the AST; the
  // rest are ours, and have to be checked on the finished tree.
  const violation = findLimitViolation(program.node, limits, source)
  if (violation !== undefined) return { ok: false, error: violation }

  const ast: ParsedExpression = {
    source,
    node: program.node,
    program,
    declared: options?.variables !== undefined,
  }
  return { ok: true, ast }
}
