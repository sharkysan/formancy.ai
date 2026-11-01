import { calledFunctionName, checkedTypeName, childNodes } from './ast.js'
import type { CelNode } from './ast.js'
import type { SourceSpan } from './errors.js'

/** A function an expression calls, at the span of the whole call. */
export interface FunctionCall {
  readonly name: string
  readonly position: SourceSpan
}

/**
 * A place where an expression's arithmetic is not exact. `double`: a subexpression the checker
 * typed as a double, named where it is outermost, so `double("4.35") * 100.0` is one place and
 * not three. `integer_division`: a `/` between integers, which drops the remainder.
 */
export interface InexactStep {
  readonly kind: 'double' | 'integer_division'
  readonly position: SourceSpan
}

/**
 * Every function a checked expression calls, outside in and then left to right, by the same test
 * the kind's allow-list applies (0229). A caller refusing a kind of call reads this rather than
 * probing the source, which a spelling it did not think of would get past.
 */
export function calledFunctions(root: CelNode): readonly FunctionCall[] {
  const calls: FunctionCall[] = []
  const visit = (node: CelNode): void => {
    const name = calledFunctionName(node)
    if (name !== undefined) calls.push({ name, position: spanOf(node) })
    for (const child of childNodes(node)) visit(child)
  }
  visit(root)
  return calls
}

/**
 * Where a checked expression computes through a double or divides integers, read from the types
 * the checker wrote (0229). It holds what is known before the expression runs, so a value typed
 * `dyn` is named nowhere, whatever it holds when it runs: a caller that needs a value exact
 * declares its type.
 */
export function inexactSteps(root: CelNode): readonly InexactStep[] {
  const steps: InexactStep[] = []
  const visit = (node: CelNode, insideDouble: boolean): void => {
    const type = checkedTypeName(node)
    const double = type === 'double'
    if (double && !insideDouble) steps.push({ kind: 'double', position: spanOf(node) })
    if (node.op === '/' && (type === 'int' || type === 'uint')) steps.push({ kind: 'integer_division', position: spanOf(node) })
    for (const child of childNodes(node)) visit(child, double)
  }
  visit(root, false)
  return steps
}

function spanOf(node: CelNode): SourceSpan {
  return { start: node.start, end: node.end }
}
