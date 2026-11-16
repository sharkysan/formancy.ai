import { childNodes } from './ast.js'
import type { CelNode, ExpressionAst } from './ast.js'
import { readChains } from './chains.js'
import type { ParsedExpression } from './parse.js'

/** The operators that compare one value with another. `in` is not one: its right side is a collection. */
export type ComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>='

const COMPARISONS: ReadonlySet<string> = new Set<ComparisonOperator>(['==', '!=', '<', '<=', '>', '>='])

/** A field compared with a string written into the expression. */
export interface ComparedLiteral {
  /** The field, named as `referencedPaths` names it, so `a["b"]` is `a.b`. */
  readonly path: string
  /** As written: `"x" < a` is reported as `<`, not turned round. */
  readonly operator: ComparisonOperator
  readonly literal: string
}

/**
 * Every place the expression compares a field with a string, in the order they are written.
 *
 * The question a check needs answered before it can tell a date compared with something
 * that is not a date (0236). The answer is a comparison's two sides, which nothing outside
 * this package can see: an AST is opaque to its callers (`ast.ts`).
 *
 * **A side is a field only where `readChains` found a whole read at exactly its span.** That
 * walk is the one answer to which names are fields and which a comprehension or `bind` binds
 * itself, kept in one place so the dependency graph and the text of a rule cannot disagree
 * (`chains.ts`). A second walk deciding it again would be a second answer, so this one asks
 * the first: `x.at` in `legs.all(x, x.at == "1")` is no read there, and so no field here.
 */
export function comparedLiterals(ast: ExpressionAst): readonly ComparedLiteral[] {
  const reads = wholeReads(ast)

  const found: ComparedLiteral[] = []
  const visit = (node: CelNode): void => {
    if (COMPARISONS.has(node.op)) {
      const [left, right] = node.args as [CelNode, CelNode]
      const compared = fieldAndLiteral(left, right, reads) ?? fieldAndLiteral(right, left, reads)
      if (compared !== undefined) found.push({ ...compared, operator: node.op as ComparisonOperator })
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit((ast as ParsedExpression).node)
  return found
}

/** Two fields compared with each other. */
export interface ComparedFields {
  /** The field on the left as written, named as `referencedPaths` names it. */
  readonly left: string
  readonly right: string
  /** As written: `a > b` is reported as `>`, not turned round. */
  readonly operator: ComparisonOperator
}

/**
 * Every place the expression compares one field with another, in the order they are written.
 *
 * What a check across a field's width needs: `startedAt < endedAt` compares two answers as
 * text, which is only right when both have one width (0067). The reads come from the same
 * walk as `comparedLiterals`, so a comprehension's own variable is never a field, and
 * **`steps.all(s, s.at >= startedAt)` is not seen**: `s.at` is no read in the model. That is
 * the named limit decided in 0238, and closing it would mean teaching this package what a
 * variable stands for, which 0236 avoided on purpose.
 */
export function comparedFields(ast: ExpressionAst): readonly ComparedFields[] {
  const reads = wholeReads(ast)
  const found: ComparedFields[] = []
  const visit = (node: CelNode): void => {
    if (COMPARISONS.has(node.op)) {
      const [left, right] = node.args as [CelNode, CelNode]
      const leftPath = reads.get(spanOf(left))
      const rightPath = reads.get(spanOf(right))
      if (leftPath !== undefined && rightPath !== undefined) {
        found.push({ left: leftPath, right: rightPath, operator: node.op as ComparisonOperator })
      }
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit((ast as ParsedExpression).node)
  return found
}

/** The field each whole read names, keyed by the span it covers: the one answer to which names are fields. */
function wholeReads(ast: ExpressionAst): ReadonlyMap<string, string> {
  const reads = new Map<string, string>()
  for (const chain of readChains(ast)) {
    const whole = chain.prefixes[chain.prefixes.length - 1]!
    reads.set(spanOf(whole), whole.path)
  }
  return reads
}

function fieldAndLiteral(field: CelNode, literal: CelNode, reads: ReadonlyMap<string, string>): { path: string; literal: string } | undefined {
  const path = reads.get(spanOf(field))
  if (path === undefined || literal.op !== 'value' || typeof literal.args !== 'string') return undefined
  return { path, literal: literal.args }
}

function spanOf(node: { readonly start: number; readonly end: number }): string {
  return `${String(node.start)}:${String(node.end)}`
}
