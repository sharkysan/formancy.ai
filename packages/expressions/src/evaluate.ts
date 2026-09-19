import { BudgetExceeded, DEFAULT_BUDGET, createMeter } from './budget.js'
import type { EvaluationBudget } from './budget.js'
import type { Capabilities } from './capabilities.js'
import { translateCelError } from './cel.js'
import type { CompiledProgram, Program } from './compile.js'
import { ExpressionError } from './errors.js'
import { bindValues, toExpressionValue } from './values.js'
import type { ExpressionValue } from './values.js'

export interface EvaluateOptions {
  /** One frozen draw of everything impure; see `capabilities.ts`. */
  readonly capabilities: Capabilities
  readonly budget?: Partial<EvaluationBudget> | undefined
}

export type EvaluationOutcome =
  | {
      readonly ok: true
      readonly value: ExpressionValue
      /** What the pass cost, for tuning a budget against real forms. */
      readonly steps: number
    }
  | { readonly ok: false; readonly error: ExpressionError }

/**
 * Evaluate a compiled program against one value bag.
 *
 * Failures come back as values rather than exceptions: a form that a user has
 * half filled in produces evaluation errors constantly, and they are part of
 * the engine's normal control flow rather than an exceptional condition.
 */
export function evaluate(
  program: Program,
  values: Record<string, unknown>,
  options: EvaluateOptions,
): EvaluationOutcome {
  const compiled = program as CompiledProgram
  const meter = createMeter(resolveBudget(options.budget))
  const pass = { capabilities: options.capabilities, meter }

  try {
    const bound = bindValues(compiled.variables, values, compiled.source)
    const raw = compiled.parsed.program.run(meter.measure(bound) as Record<string, unknown>, pass)
    const value = toExpressionValue(raw, compiled.source)

    // The CEL logical operators absorb an error from one side when the other
    // side decides the result, which can swallow a budget failure. The meter
    // remembers, so an over-budget pass is reported even when it produced one.
    if (meter.overspent !== undefined) {
      return { ok: false, error: budgetError(meter.overspent, compiled.source) }
    }
    return { ok: true, value, steps: meter.steps }
  } catch (error) {
    return { ok: false, error: translateEvaluationError(error, compiled.source) }
  }
}

function resolveBudget(overrides?: Partial<EvaluationBudget> | undefined): EvaluationBudget {
  if (overrides === undefined) return DEFAULT_BUDGET
  return {
    maxSteps: overrides.maxSteps ?? DEFAULT_BUDGET.maxSteps,
    maxDurationMs: overrides.maxDurationMs,
    monotonicMs: overrides.monotonicMs,
  }
}

/**
 * Unwrap whatever the evaluator threw. Our own errors travel as the `cause` of
 * the implementation's error once it has wrapped a failing handler.
 */
function translateEvaluationError(error: unknown, source: string): ExpressionError {
  for (let current: unknown = error, depth = 0; current != null && depth < 8; depth++) {
    if (current instanceof BudgetExceeded) return budgetError(current, source)
    if (current instanceof ExpressionError) return current
    if (current instanceof RangeError) {
      return new ExpressionError({
        kind: 'runtime',
        code: 'invalid_value',
        message: current.message,
        source,
        cause: error,
      })
    }
    current = (current as { cause?: unknown }).cause
  }
  return translateCelError(error, source)
}

function budgetError(exceeded: BudgetExceeded, source: string): ExpressionError {
  return new ExpressionError({
    kind: 'budget',
    code: exceeded.reason === 'steps' ? 'steps_exceeded' : 'time_exceeded',
    message: exceeded.message,
    source,
    hint: 'Narrow the collection this expression walks, or move part of it into its own field.',
    cause: exceeded,
  })
}
