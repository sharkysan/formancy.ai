import { childNodes, isCelNode } from './ast.js'
import type { CelNode, ExpressionAst } from './ast.js'
import type { ParsedExpression } from './parse.js'

/**
 * The comprehension macros, whose first argument NAMES A LOCAL VARIABLE rather
 * than reading one. `items.all(x, x.price > 0)` depends on `items` and not on
 * anything called `x`, and getting that wrong in either direction breaks the
 * engine: reporting `x` invents a dependency on a field that does not exist,
 * and skipping `items` loses the one that does.
 */
const COMPREHENSION_MACROS: ReadonlySet<string> = new Set([
  'all',
  'exists',
  'exists_one',
  'filter',
  'map',
])

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
 */
export function referencedPaths(ast: ExpressionAst): readonly string[] {
  const found = new Set<string>()
  visit((ast as ParsedExpression).node, found, EMPTY_SCOPE)
  return [...found].sort()
}

const EMPTY_SCOPE: ReadonlySet<string> = new Set()

function visit(node: CelNode, found: Set<string>, scope: ReadonlySet<string>): void {
  if (node.op === 'id') {
    const name = identifierName(node)
    if (name !== undefined && !scope.has(name)) found.add(name)
    return
  }

  if (node.op === '.' || node.op === '[]') {
    const resolved = resolvePath(node)
    if (resolved !== undefined) {
      if (!scope.has(resolved.root)) found.add(resolved.path)
      return
    }
    // A computed index such as `items[i]`: fall through to the children, which
    // reports the whole collection AND the expression that indexes it.
  }

  if (node.op === 'rcall' && visitComprehension(node, found, scope)) return

  for (const child of childNodes(node)) visit(child, found, scope)
}

/**
 * Walk a comprehension with its iteration variable bound, or return false when
 * this receiver call is an ordinary method and the generic walk applies.
 */
function visitComprehension(
  node: CelNode,
  found: Set<string>,
  scope: ReadonlySet<string>,
): boolean {
  const args = node.args as [string, CelNode, CelNode[]]
  const [name, receiver, macroArgs] = args
  if (!COMPREHENSION_MACROS.has(name) || !Array.isArray(macroArgs) || macroArgs.length < 2) {
    return false
  }

  const iterationVariable = macroArgs[0] !== undefined ? identifierName(macroArgs[0]) : undefined
  if (iterationVariable === undefined) return false

  if (isCelNode(receiver)) visit(receiver, found, scope)

  const inner = new Set(scope)
  inner.add(iterationVariable)
  for (let i = 1; i < macroArgs.length; i++) {
    const arg = macroArgs[i]
    if (arg !== undefined) visit(arg, found, inner)
  }
  return true
}

interface ResolvedPath {
  /** The identifier the chain starts at, which is what scoping applies to. */
  readonly root: string
  readonly path: string
}

/**
 * The full path of a static access chain, or undefined when some part of it is
 * computed and the caller has to fall back to walking the children.
 */
function resolvePath(node: CelNode): ResolvedPath | undefined {
  if (node.op === 'id') {
    const name = identifierName(node)
    return name === undefined ? undefined : { root: name, path: name }
  }

  if (node.op === '.') {
    const args = node.args as [CelNode, string]
    const base = resolvePath(args[0])
    return base === undefined ? undefined : { root: base.root, path: `${base.path}.${args[1]}` }
  }

  if (node.op === '[]') {
    const args = node.args as [CelNode, CelNode]
    const base = resolvePath(args[0])
    const segment = literalSegment(args[1])
    if (base === undefined || segment === undefined) return undefined
    return { root: base.root, path: `${base.path}${segment}` }
  }

  return undefined
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * The path segment for a constant index, or undefined when the index is
 * computed.
 *
 * `address["city"]` and `address.city` are the same read, so they must produce
 * the same path or the dependency graph would hold two nodes for one field.
 */
function literalSegment(node: CelNode): string | undefined {
  if (node.op !== 'value') return undefined
  const value = node.args
  if (typeof value === 'bigint' || typeof value === 'number') return `[${String(value)}]`
  if (typeof value === 'string') {
    return IDENTIFIER.test(value) ? `.${value}` : `[${JSON.stringify(value)}]`
  }
  return undefined
}

function identifierName(node: CelNode): string | undefined {
  return node.op === 'id' && typeof node.args === 'string' ? node.args : undefined
}
