import { childNodes, isCelNode } from './ast.js'
import type { CelNode, ExpressionAst } from './ast.js'
import type { ParsedExpression } from './parse.js'

/**
 * One prefix of a static access chain, with the source it occupies.
 *
 * `address.city` has two: `address` over the first seven characters, and
 * `address.city` over all twelve. A rename of `address` replaces the first
 * span; a rename of the whole chain replaces the second.
 */
export interface Prefix {
  readonly path: string
  readonly start: number
  readonly end: number
}

export interface Chain {
  /** The identifier the chain starts at, which is what scoping applies to. */
  readonly root: string
  /** Each prefix, shortest first; the last one is the whole chain. */
  readonly prefixes: readonly Prefix[]
}

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
 * The macros whose three-argument form names TWO local variables, key and
 * value. `map` is deliberately absent: its three-argument form is
 * `map(var, filter, transform)`, where the middle argument is an expression
 * that really does read fields.
 */
const TWO_VARIABLE_MACROS: ReadonlySet<string> = new Set(['all', 'exists', 'exists_one', 'filter'])

const EMPTY_SCOPE: ReadonlySet<string> = new Set()

/**
 * Every static access chain the expression reads, in the order the walk
 * reaches them.
 *
 * One walker, two callers. `referencedPaths` wants the paths and `rewritePath`
 * wants the spans, and they have to agree about which identifiers are *fields*
 * and which are locals bound by a comprehension or by `bind` — because those
 * two answers are the dependency graph and the text of a rule, and a document
 * where they disagree is a form whose logic reads a path nothing recomputes.
 * Two walkers would be two places to keep that right.
 */
export function readChains(ast: ExpressionAst): readonly Chain[] {
  const found: Chain[] = []
  visit((ast as ParsedExpression).node, found, EMPTY_SCOPE)
  return found
}

function visit(node: CelNode, found: Chain[], scope: ReadonlySet<string>): void {
  if (node.op === 'id') {
    const name = identifierName(node)
    if (name !== undefined && !scope.has(name)) {
      found.push({ root: name, prefixes: [{ path: name, start: node.start, end: node.end }] })
    }
    return
  }

  if (node.op === '.' || node.op === '[]') {
    const resolved = resolveChain(node)
    if (resolved !== undefined) {
      if (!scope.has(resolved.root)) found.push(resolved)
      return
    }
    // A computed index such as `items[i]`: fall through to the children, which
    // reaches the whole collection AND the expression that indexes it.
  }

  if (node.op === 'rcall') {
    if (visitComprehension(node, found, scope)) return
    if (visitBind(node, found, scope)) return
  }

  for (const child of childNodes(node)) visit(child, found, scope)
}

/**
 * Walk `x.bind(name, value, expression)` with its binding scoped, or return
 * false when this call is not the bind macro.
 *
 * The implementation expands `bind` by NAME, on any receiver, and never reads
 * the receiver at runtime. `cel` in particular is its namespace constant and
 * not a field, so reporting it would hand the dependency graph a node that can
 * never exist. Any other receiver is reported: it is an identifier the author
 * wrote, and over-reporting is the conservative direction here.
 */
function visitBind(node: CelNode, found: Chain[], scope: ReadonlySet<string>): boolean {
  const [name, receiver, macroArgs] = node.args as [string, CelNode, CelNode[]]
  if (name !== 'bind' || !Array.isArray(macroArgs) || macroArgs.length !== 3) return false

  const bound = macroArgs[0] !== undefined ? identifierName(macroArgs[0]) : undefined
  if (bound === undefined) return false

  if (isCelNode(receiver) && identifierName(receiver) !== 'cel') visit(receiver, found, scope)

  // The value is computed BEFORE the name exists; only the body sees it.
  if (macroArgs[1] !== undefined) visit(macroArgs[1], found, scope)
  const inner = new Set(scope)
  inner.add(bound)
  if (macroArgs[2] !== undefined) visit(macroArgs[2], found, inner)
  return true
}

/**
 * Walk a comprehension with its iteration variable bound, or return false when
 * this receiver call is an ordinary method and the generic walk applies.
 */
function visitComprehension(node: CelNode, found: Chain[], scope: ReadonlySet<string>): boolean {
  const args = node.args as [string, CelNode, CelNode[]]
  const [name, receiver, macroArgs] = args
  if (!COMPREHENSION_MACROS.has(name) || !Array.isArray(macroArgs) || macroArgs.length < 2) {
    return false
  }

  const iterationVariable = macroArgs[0] !== undefined ? identifierName(macroArgs[0]) : undefined
  if (iterationVariable === undefined) return false

  if (isCelNode(receiver)) visit(receiver, found, scope)

  // The two-variable form binds a second local — `m.all(k, v, …)` — and that
  // slot is a NAME, not a read; visiting it would report a phantom field.
  const secondVariable =
    TWO_VARIABLE_MACROS.has(name) && macroArgs.length === 3 && macroArgs[1] !== undefined
      ? identifierName(macroArgs[1])
      : undefined

  const inner = new Set(scope)
  inner.add(iterationVariable)
  if (secondVariable !== undefined) inner.add(secondVariable)
  for (let i = secondVariable === undefined ? 1 : 2; i < macroArgs.length; i++) {
    const arg = macroArgs[i]
    if (arg !== undefined) visit(arg, found, inner)
  }
  return true
}

/**
 * The chain a static access resolves to, or undefined when some part of it is
 * computed and the caller has to fall back to walking the children.
 */
function resolveChain(node: CelNode): Chain | undefined {
  if (node.op === 'id') {
    const name = identifierName(node)
    if (name === undefined) return undefined
    return { root: name, prefixes: [{ path: name, start: node.start, end: node.end }] }
  }

  if (node.op === '.') {
    const args = node.args as [CelNode, string]
    const base = resolveChain(args[0])
    if (base === undefined) return undefined
    return extend(base, `${last(base).path}.${args[1]}`, node)
  }

  if (node.op === '[]') {
    const args = node.args as [CelNode, CelNode]
    const base = resolveChain(args[0])
    const segment = literalSegment(args[1])
    if (base === undefined || segment === undefined) return undefined
    return extend(base, `${last(base).path}${segment}`, node)
  }

  return undefined
}

/**
 * The chain with one more prefix on the end.
 *
 * The new prefix takes the NODE's span rather than the end of the base's,
 * because the span of a whole chain is what a rewrite of that whole chain has
 * to replace, and the two differ wherever the author wrote bracket notation or
 * whitespace.
 */
function extend(base: Chain, path: string, node: CelNode): Chain {
  return {
    root: base.root,
    prefixes: [...base.prefixes, { path, start: node.start, end: node.end }],
  }
}

function last(chain: Chain): Prefix {
  return chain.prefixes[chain.prefixes.length - 1]!
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
