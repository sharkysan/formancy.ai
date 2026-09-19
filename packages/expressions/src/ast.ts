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
