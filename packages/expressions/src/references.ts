import { readChains } from './chains.js'
import type { ExpressionAst } from './ast.js'

/**
 * The set of variable paths an expression reads, e.g. `total`, `address.city`.
 *
 * The engine builds its dependency graph from this and rejects cyclic forms at
 * save time, so the answer must be conservative and complete: over-reporting a
 * dependency only costs a redundant recomputation, missing one produces a form
 * whose computed values are silently stale.
 *
 * A returned path implies its prefixes: `address.city` is also a read of
 * `address`. Consumers keyed on field roots should take the first segment.
 *
 * The walk itself lives in `chains.ts`, shared with `rewritePath`: what counts
 * as a field read and what is a local bound by a comprehension has to be one
 * answer, or the dependency graph and the text of a rule can disagree about the
 * same identifier.
 */
export function referencedPaths(ast: ExpressionAst): readonly string[] {
  const found = new Set<string>()
  for (const chain of readChains(ast)) {
    found.add(chain.prefixes[chain.prefixes.length - 1]!.path)
  }
  return [...found].sort()
}
