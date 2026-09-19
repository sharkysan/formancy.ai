/**
 * CEL for formancy forms: parse, check, compile, evaluate.
 *
 * Conditional logic, computed values and validation rules are written in the
 * Common Expression Language. CEL was chosen over a JavaScript sandbox because
 * it is non-Turing-complete by construction rather than by containment, over
 * JSONLogic because it has a compile-time type checker, and over both because
 * its AST yields exact static variable references — which is what lets the
 * engine build a dependency graph and reject a cyclic form when it is saved
 * instead of when it is used.
 *
 * The CEL implementation itself is wrapped, never re-exported. Nothing outside
 * this package imports it.
 */
export { parse } from './parse.js'
export type { ParseOptions, ParseOutcome } from './parse.js'
export type { ExpressionAst } from './ast.js'

export { referencedPaths } from './references.js'

export { check } from './check.js'
export type { CheckOptions, CheckOutcome } from './check.js'

export { compile } from './compile.js'
export type { CompileOptions, CompileOutcome, Program } from './compile.js'

export { evaluate } from './evaluate.js'
export type { EvaluateOptions, EvaluationOutcome } from './evaluate.js'

export { ExpressionError } from './errors.js'
export type { ExpressionErrorKind, ExpressionErrorInit, SourceSpan } from './errors.js'

export { EXPRESSION_KINDS, KIND_POLICIES } from './kinds.js'
export type { ExpressionKind, KindPolicy } from './kinds.js'

export { DEFAULT_LIMITS, DEFAULT_VALUE_LIMITS } from './limits.js'
export type { StructuralLimits, ValueLimits } from './limits.js'

export { DEFAULT_BUDGET } from './budget.js'
export type { EvaluationBudget } from './budget.js'

export { captureCapabilities, fixedCapabilities } from './capabilities.js'
export type { Capabilities, CapabilitySource } from './capabilities.js'

export {
  Decimal,
  MAX_DECIMAL_SCALE,
  addDecimal,
  compareDecimal,
  decimalFromString,
  decimalToString,
  divideDecimal,
  multiplyDecimal,
  negateDecimal,
  roundDecimal,
  subtractDecimal,
} from './decimal.js'

export type { ExpressionValue } from './values.js'
export type { DeclaredType, ResultType, VariableDeclarations } from './types.js'
