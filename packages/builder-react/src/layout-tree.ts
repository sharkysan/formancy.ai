import { describeLayoutNode, isLayoutContainer, layoutChildrenAt, nodesOfLayout } from '@formancy/builder-core'
import type { LayoutLocation } from '@formancy/builder-core'
import type { FieldDef, FormSchema, LayoutNode } from '@formancy/spec'
import { nameOf } from './tree.js'

/**
 * Turning an arrangement into something a keyboard can walk.
 *
 * The same job `tree.ts` does for the model, and deliberately not the same
 * code: a model node is addressed by key and a layout node by position, and
 * the one function that took either would be the function that mixed them up.
 *
 * The describing matters more here than it does for fields. A field row can
 * say "Email" and be understood; a layout row that says "Row" three times over
 * tells somebody moving things by keyboard nothing at all, so a container is
 * named by what it holds.
 */

export interface LayoutTreeNode {
  /** Index path from the layout's own node list. Never empty. */
  path: readonly number[]
  node: LayoutNode
  /** 0 for a top-level node. Drives indentation and `aria-level`. */
  depth: number
  isContainer: boolean
  /** What to show in the row and read out in an announcement. */
  name: string
}

/** Every node of one layout, a container immediately followed by its contents. */
export function flattenLayout(schema: FormSchema, layout: string): LayoutTreeNode[] {
  const roots = nodesOfLayout(schema, layout)
  if (roots === undefined) return []

  const naming = (path: string): string => nameOfPath(schema, path)
  const rows: LayoutTreeNode[] = []

  const walk = (nodes: readonly LayoutNode[], prefix: readonly number[], depth: number): void => {
    for (const [index, node] of nodes.entries()) {
      const path = [...prefix, index]
      const isContainer = isLayoutContainer(node)
      rows.push({ path, node, depth, isContainer, name: describeLayoutNode(node, naming) })
      if (isContainer) walk(node.children, path, depth + 1)
    }
  }

  walk(roots, [], 0)
  return rows
}

/**
 * What a person should call the field at a data path.
 *
 * Falls back to the path itself rather than to nothing: a layout that places
 * `contact.email` when no such field exists is invalid and the builder has to
 * be able to show the broken row, not hide it behind an empty string.
 */
export function nameOfPath(schema: FormSchema, path: string): string {
  const def = fieldAtPath(schema, path)
  return def === undefined ? path : nameOf(schema, def)
}

function fieldAtPath(schema: FormSchema, path: string): FieldDef | undefined {
  const segments = path.split('.')
  let fields: readonly FieldDef[] = flattenPages(schema.model.fields)
  let found: FieldDef | undefined

  for (const segment of segments) {
    found = fields.find((field) => field.key === segment)
    if (found === undefined) return undefined
    fields = flattenPages(found.fields ?? [])
  }
  return found
}

/** A page contributes no segment to a data path, so it is stepped through. */
function flattenPages(fields: readonly FieldDef[]): FieldDef[] {
  const out: FieldDef[] = []
  for (const field of fields) {
    if (field.type === 'page') out.push(...flattenPages(field.fields ?? []))
    else out.push(field)
  }
  return out
}

/**
 * A `LayoutLocation` as a sentence, for the keyboard move palette.
 *
 * Same trap as the model's version: a move index counts positions in the
 * container AFTER the node has been lifted out, so describing it against the
 * document as it stands names the wrong neighbours. `moving` excludes the
 * traveller, and it has to be the path as it stood BEFORE the lift, which is
 * what the caller has.
 */
export function describeLayoutTarget(
  schema: FormSchema,
  location: LayoutLocation,
  moving?: readonly number[],
): string {
  const naming = (path: string): string => nameOfPath(schema, path)
  const container = containerNodeAt(schema, location)
  const where = container === undefined ? `the ${location.layout} layout` : describeLayoutNode(container, naming)

  const siblings = (layoutChildrenAt(schema, location.layout, location.parent) ?? []).filter(
    (_node, index) => !liftedFromHere(location, moving, index),
  )

  if (siblings.length === 0) return `${where}, as its first item`

  const before = siblings[location.index - 1]
  const after = siblings[location.index]

  if (before === undefined) return `${where}, before ${describeLayoutNode(after!, naming)}`
  if (after === undefined) return `${where}, after ${describeLayoutNode(before, naming)}`
  return `${where}, between ${describeLayoutNode(before, naming)} and ${describeLayoutNode(after, naming)}`
}

/** Whether index `at` in this container is the node being moved out of it. */
function liftedFromHere(
  location: LayoutLocation,
  moving: readonly number[] | undefined,
  at: number,
): boolean {
  if (moving === undefined) return false
  if (moving.length !== location.parent.length + 1) return false
  if (!location.parent.every((step, index) => step === moving[index])) return false
  return moving[moving.length - 1] === at
}

function containerNodeAt(schema: FormSchema, location: LayoutLocation): LayoutNode | undefined {
  if (location.parent.length === 0) return undefined
  const siblings = layoutChildrenAt(schema, location.layout, location.parent.slice(0, -1))
  return siblings?.[location.parent[location.parent.length - 1]!]
}
