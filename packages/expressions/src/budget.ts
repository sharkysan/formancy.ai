/**
 * A bound on the work one evaluation may do.
 *
 * The structural limits in `limits.ts` bound the shape of an expression; this
 * bounds what that shape costs against real data. `items.all(x, others.exists(
 * y, ...))` is a small, legal expression and is quadratic in data the author
 * never sees, so the ceiling has to be enforced where the data is.
 */
export interface EvaluationBudget {
  /**
   * Steps are reads of the value bag plus calls into our own functions. They
   * are counted deterministically, so the same evaluation costs the same on a
   * phone and on a server, and a submission that succeeded in the browser
   * cannot fail its replay.
   */
  readonly maxSteps: number
  /**
   * An optional wall-clock ceiling, for defence in depth. Needs `monotonicMs`:
   * this package never reads a clock of its own.
   */
  readonly maxDurationMs?: number | undefined
  readonly monotonicMs?: (() => number) | undefined
}

export const DEFAULT_BUDGET: EvaluationBudget = Object.freeze({ maxSteps: 20_000 })

export class BudgetExceeded extends Error {
  override readonly name = 'BudgetExceeded'
  readonly reason: 'steps' | 'time'
  readonly steps: number

  constructor(reason: 'steps' | 'time', steps: number, detail: string) {
    super(detail)
    this.reason = reason
    this.steps = steps
  }
}

export interface Meter {
  /** Steps spent so far. */
  readonly steps: number
  /**
   * Set once the budget was broken, and never cleared.
   *
   * CEL's logical operators absorb an error from one operand when the other
   * decides the result, so a thrown budget failure can vanish. The caller
   * checks this after the pass and refuses a result the meter did not pay for.
   */
  readonly overspent: BudgetExceeded | undefined
  /** Spend a step, or throw `BudgetExceeded`. */
  charge(): void
  /** A view of `values` that charges a step for every read reaching into it. */
  measure(values: unknown): unknown
}

/**
 * How often the wall clock is consulted. Reading a clock is far more expensive
 * than the step it guards, and an overshoot of a few hundred cheap steps does
 * not matter when the budget is measured in milliseconds.
 */
const CLOCK_INTERVAL = 256

export function createMeter(budget: EvaluationBudget): Meter {
  const { maxSteps, maxDurationMs, monotonicMs } = budget
  const deadline =
    maxDurationMs !== undefined && monotonicMs !== undefined
      ? monotonicMs() + maxDurationMs
      : undefined

  let steps = 0
  let overspent: BudgetExceeded | undefined

  function stop(reason: 'steps' | 'time', detail: string): never {
    overspent ??= new BudgetExceeded(reason, steps, detail)
    throw overspent
  }

  function charge(): void {
    steps += 1
    if (steps > maxSteps) {
      stop('steps', `Evaluation used more than ${maxSteps} steps and was stopped.`)
    }
    if (deadline !== undefined && monotonicMs !== undefined && steps % CLOCK_INTERVAL === 0) {
      if (monotonicMs() > deadline) {
        stop('time', `Evaluation ran longer than ${String(maxDurationMs)}ms and was stopped.`)
      }
    }
  }

  /**
   * Only plain objects and arrays are wrapped. A Proxy has no internal slots,
   * so a wrapped Date throws from getTime() and a wrapped Decimal would no
   * longer be recognised as one; those values are handed through untouched,
   * which is safe because they hold a bounded amount of data.
   */
  function measure(value: unknown): unknown {
    if (!isTraversable(value)) return value
    return new Proxy(value as object, {
      get(target, key, receiver) {
        charge()
        return measure(Reflect.get(target, key, receiver))
      },
    })
  }

  return {
    get steps() {
      return steps
    },
    get overspent() {
      return overspent
    },
    charge,
    measure,
  }
}

function isTraversable(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return true
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === Object.prototype || prototype === null
}
