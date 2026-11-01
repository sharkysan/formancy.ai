/**
 * The shape of a parsed expression, described structurally so that nothing
 * outside `cel.ts` has to name a type from the CEL implementation.
 *
 * `op` is the node's operator: `id`, `.`, `[]`, `call`, `rcall`, `list`, `map`,
 * `?:`, `||`, `&&`, `value`, the binary operators, and the unary `!_` / `-_`.
 * `args` is operator-specific, which is why it is `unknown` here and narrowed
 * at each use site.
 */
export interface CelNode {
  readonly op: string
  readonly args: unknown
  readonly start: number
  readonly end: number
}

/**
 * A parsed expression, opaque to callers.
 *
 * It deliberately exposes nothing but its source: an AST bound to the
 * environment that parsed it is not portable to another environment, because
 * type checking annotates the nodes in place.
 */
export interface ExpressionAst {
  readonly source: string
}

export function isCelNode(value: unknown): value is CelNode {
  return typeof value === 'object' && value !== null && typeof (value as CelNode).op === 'string'
}

/** Every child node of `node`, in source order, ignoring non-node payload. */
export function childNodes(node: CelNode): readonly CelNode[] {
  const children: CelNode[] = []
  collectNodes(node.args, children)
  return children
}

function collectNodes(value: unknown, into: CelNode[]): void {
  if (isCelNode(value)) {
    into.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, into)
  }
}

/**
 * The function a node calls, or undefined when it calls none: a call, `f(x)`, or a method,
 * `x.f()`, macros among them. The kind's allow-list and the calls a program lists read this one
 * answer, so what was let through and what is said to be called cannot disagree.
 */
export function calledFunctionName(node: CelNode): string | undefined {
  if (node.op !== 'call' && node.op !== 'rcall') return undefined
  const name = (node.args as [string, ...unknown[]])[0]
  return typeof name === 'string' ? name : undefined
}

/**
 * The static type the checker wrote onto a node, when it wrote one. Iteration
 * variables of a comprehension are never checked as expressions, so the field
 * can be absent; the caller has to treat "unknown" as "not provably wrong".
 */
export function checkedTypeName(node: CelNode): string | undefined {
  const type = (node as { checkedType?: { name?: unknown } }).checkedType
  return typeof type?.name === 'string' ? type.name : undefined
}
