import type { FormSchema, LayoutNode } from '@formancy/spec'

/**
 * Navigating an arrangement.
 *
 * A layout node has no key. A field is `contact.email` wherever it sits; a row
 * is "the second thing inside the third thing", and every insert or removal
 * renumbers its neighbours. So a layout address is an index path, and these
 * helpers exist because reading one wrong is silent — you edit a different
 * node and the document stays valid.
 *
 * Kept apart from the field commands rather than folded in beside them,
 * because the two addressing schemes look alike and are not: `['a','b']` is a
 * key path into the model and `[0, 1]` is a position path into one layout, and
 * a function that took either would be a function that could confuse them.
 */

/** Where a layout node goes: which arrangement, which container, which slot. */
export interface LayoutLocation {
  /** The layout's name. Arrangements are asked for by name, never by index. */
  layout: string
  /** Index path of the container, root-first. `[]` is the layout itself. */
  parent: readonly number[]
  index: number
}

/** A layout node's address. `path` is never empty — that would be the layout. */
export interface LayoutAddress {
  layout: string
  path: readonly number[]
}

/** The kinds that hold other nodes. A `field` node is a leaf. */
export const LAYOUT_CONTAINER_KINDS = ['section', 'row', 'column'] as const

export type LayoutContainerKind = (typeof LAYOUT_CONTAINER_KINDS)[number]

export function isLayoutContainer(
  node: LayoutNode,
): node is Extract<LayoutNode, { children: LayoutNode[] }> {
  return node.kind !== 'field'
}

/** The named layout's top-level node list, or undefined if there is no such layout. */
export function nodesOfLayout(document: FormSchema, name: string): LayoutNode[] | undefined {
  return document.layouts?.find((layout) => layout.name === name)?.nodes
}

/**
 * The child list of the container at `parent` — the layout's own list for `[]`.
 *
 * Undefined rather than empty when the path points at a field or at nothing,
 * so a caller cannot insert into a leaf and get an array nobody reads back.
 */
export function childrenAt(
  document: FormSchema,
  layout: string,
  parent: readonly number[],
): LayoutNode[] | undefined {
  let nodes: LayoutNode[] | undefined = nodesOfLayout(document, layout)
  if (nodes === undefined) return undefined
  for (const step of parent) {
    const node: LayoutNode | undefined = nodes[step]
    if (node === undefined || !isLayoutContainer(node)) return undefined
    nodes = node.children
  }
  return nodes
}

/** The node at `path`, or undefined. An empty path addresses no node. */
export function nodeAt(
  document: FormSchema,
  layout: string,
  path: readonly number[],
): LayoutNode | undefined {
  if (path.length === 0) return undefined
  const siblings = childrenAt(document, layout, path.slice(0, -1))
  return siblings?.[path[path.length - 1]!]
}

/** Every container's index path in one layout, the layout itself first. */
export function containerPaths(document: FormSchema, layout: string): number[][] {
  const nodes = nodesOfLayout(document, layout)
  if (nodes === undefined) return []

  const paths: number[][] = [[]]
  const walk = (children: readonly LayoutNode[], prefix: number[]): void => {
    for (const [index, node] of children.entries()) {
      if (!isLayoutContainer(node)) continue
      const here = [...prefix, index]
      paths.push(here)
      walk(node.children, here)
    }
  }
  walk(nodes, [])
  return paths
}

/** Whether `maybeAncestor` is `path` itself or encloses it. */
export function encloses(maybeAncestor: readonly number[], path: readonly number[]): boolean {
  if (maybeAncestor.length > path.length) return false
  return maybeAncestor.every((step, at) => path[at] === step)
}

export function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, at) => b[at] === step)
}

/**
 * A human name for one layout node, for a tree row and for an announcement.
 *
 * A row has nothing to call itself, so it is named by what it holds: "Row with
 * First name and Last name" is findable in a list of six rows and "Row" is not.
 */
export function describeNode(node: LayoutNode, nameOfPath: (path: string) => string): string {
  if (node.kind === 'field') return nameOfPath(node.path)

  const label = typeof node.label === 'string' ? node.label : undefined
  const kind = node.kind[0]!.toUpperCase() + node.kind.slice(1)
  if (label !== undefined) return `${kind} “${label}”`

  // One level down, and no further. Recursing all the way produced "Section
  // with Row with First name and Last name and Email", where the reader has
  // no way to tell which "and" separates what. A nested container is named as
  // what it is; its own row in the tree says what is in it.
  const inside = node.children.map((child) => shortNameOf(child, nameOfPath))
  if (inside.length === 0) return `Empty ${node.kind}`
  return `${kind} with ${listOf(inside)}`
}

function shortNameOf(node: LayoutNode, nameOfPath: (path: string) => string): string {
  if (node.kind === 'field') return nameOfPath(node.path)
  const label = typeof node.label === 'string' ? node.label : undefined
  return label === undefined ? `a ${node.kind}` : `the “${label}” ${node.kind}`
}

function listOf(items: readonly string[]): string {
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]!} and ${items[1]!}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`
}
