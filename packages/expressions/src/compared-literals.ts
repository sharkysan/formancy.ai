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
  const reads = new Map<string, string>()
  for (const chain of readChains(ast)) {
    const whole = chain.prefixes[chain.prefixes.length - 1]!
    reads.set(spanOf(whole), whole.path)
  }

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

function fieldAndLiteral(field: CelNode, literal: CelNode, reads: ReadonlyMap<string, string>): { path: string; literal: string } | undefined {
  const path = reads.get(spanOf(field))
  if (path === undefined || literal.op !== 'value' || typeof literal.args !== 'string') return undefined
  return { path, literal: literal.args }
}

function spanOf(node: { readonly start: number; readonly end: number }): string {
  return `${String(node.start)}:${String(node.end)}`
}
