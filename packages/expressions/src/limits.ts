import { childNodes } from './ast.js'
import type { CelNode } from './ast.js'
import { ExpressionError } from './errors.js'

/**
 * The structural budget an expression must fit in, enforced BEFORE evaluation.
 *
 * CEL is non-Turing-complete, so an expression always terminates; these limits
 * are about how long that takes and how much memory it costs on the way. The
 * defaults sit far below anything a form author writes by hand: they are a
 * ceiling on hostile input, not a style guide.
 */
export interface StructuralLimits {
  readonly maxAstNodes: number
  readonly maxDepth: number
  readonly maxStringLiteralLength: number
  readonly maxListElements: number
  readonly maxMapEntries: number
  readonly maxCallArguments: number
  /**
   * How deeply comprehension macros may nest inside one another's predicates.
   * Cost is multiplicative in this depth, which is the one way a structurally
   * legal expression can be made to do an enormous amount of work.
   */
  readonly maxComprehensionDepth: number
}

export const DEFAULT_LIMITS: StructuralLimits = Object.freeze({
  maxAstNodes: 256,
  maxDepth: 16,
  maxStringLiteralLength: 1024,
  maxListElements: 64,
  maxMapEntries: 64,
  maxCallArguments: 8,
  maxComprehensionDepth: 2,
})

export function resolveLimits(overrides?: Partial<StructuralLimits> | undefined): StructuralLimits {
  if (overrides === undefined) return DEFAULT_LIMITS
  return Object.freeze({
    maxAstNodes: overrides.maxAstNodes ?? DEFAULT_LIMITS.maxAstNodes,
    maxDepth: overrides.maxDepth ?? DEFAULT_LIMITS.maxDepth,
    maxStringLiteralLength:
      overrides.maxStringLiteralLength ?? DEFAULT_LIMITS.maxStringLiteralLength,
    maxListElements: overrides.maxListElements ?? DEFAULT_LIMITS.maxListElements,
    maxMapEntries: overrides.maxMapEntries ?? DEFAULT_LIMITS.maxMapEntries,
    maxCallArguments: overrides.maxCallArguments ?? DEFAULT_LIMITS.maxCallArguments,
    maxComprehensionDepth: overrides.maxComprehensionDepth ?? DEFAULT_LIMITS.maxComprehensionDepth,
  })
}

const COMPREHENSION_MACROS: ReadonlySet<string> = new Set([
  'all',
  'exists',
  'exists_one',
  'filter',
  'map',
])

/**
 * The limits the CEL parser can enforce for us while it builds the AST.
 * Everything else in `StructuralLimits` is checked by `findLimitViolation`.
 */
export function parserLimits(limits: StructuralLimits): {
  maxAstNodes: number
  maxDepth: number
  maxListElements: number
  maxMapEntries: number
  maxCallArguments: number
} {
  return {
    maxAstNodes: limits.maxAstNodes,
    maxDepth: limits.maxDepth,
    maxListElements: limits.maxListElements,
    maxMapEntries: limits.maxMapEntries,
    maxCallArguments: limits.maxCallArguments,
  }
}

/** The first limit the parsed expression breaks, or undefined when it fits. */
export function findLimitViolation(
  node: CelNode,
  limits: StructuralLimits,
  source: string,
): ExpressionError | undefined {
  return (
    findStringViolation(node, limits, source) ??
    findComprehensionViolation(node, limits, source, 0)
  )
}

function findStringViolation(
  node: CelNode,
  limits: StructuralLimits,
  source: string,
): ExpressionError | undefined {
  if (node.op === 'value' && typeof node.args === 'string') {
    if (node.args.length > limits.maxStringLiteralLength) {
      return new ExpressionError({
        kind: 'limit',
        code: 'string_literal_too_long',
        message: `String literal of ${node.args.length} characters exceeds the limit of ${limits.maxStringLiteralLength}.`,
        source,
        position: { start: node.start, end: node.end },
      })
    }
  }
  for (const child of childNodes(node)) {
    const violation = findStringViolation(child, limits, source)
    if (violation !== undefined) return violation
  }
  return undefined
}

function findComprehensionViolation(
  node: CelNode,
  limits: StructuralLimits,
  source: string,
  depth: number,
): ExpressionError | undefined {
  const macro = asComprehension(node)
  if (macro === undefined) {
    for (const child of childNodes(node)) {
      const violation = findComprehensionViolation(child, limits, source, depth)
      if (violation !== undefined) return violation
    }
    return undefined
  }

  const nested = depth + 1
  if (nested > limits.maxComprehensionDepth) {
    return new ExpressionError({
      kind: 'limit',
      code: 'comprehension_too_deep',
      message: `Comprehensions are nested ${nested} deep, which exceeds the limit of ${limits.maxComprehensionDepth}.`,
      source,
      position: { start: node.start, end: node.end },
      hint: 'Compute the inner collection in a separate field and reference that field here.',
    })
  }

  // The receiver runs once, so chaining filter into map costs a plus b rather
  // than a times b, and keeps the current depth. Only the predicate and the
  // transform run per element, which is where nesting multiplies.
  const receiverViolation = findComprehensionViolation(macro.receiver, limits, source, depth)
  if (receiverViolation !== undefined) return receiverViolation

  for (const arg of macro.args) {
    const violation = findComprehensionViolation(arg, limits, source, nested)
    if (violation !== undefined) return violation
  }
  return undefined
}

function asComprehension(
  node: CelNode,
): { readonly receiver: CelNode; readonly args: readonly CelNode[] } | undefined {
  if (node.op !== 'rcall') return undefined
  const [name, receiver, macroArgs] = node.args as [string, CelNode, CelNode[]]
  if (!COMPREHENSION_MACROS.has(name) || !Array.isArray(macroArgs) || macroArgs.length < 2) {
    return undefined
  }
  return { receiver, args: macroArgs.slice(1) }
}
