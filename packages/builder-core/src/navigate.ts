import type { FieldDef, FormSchema, LayoutNode } from '@formancy/spec'
import { childrenAt as layoutChildrenAt } from './layout.js'
import type { LayoutAddress } from './layout.js'

/**
 * Finding things in a document: a field by its key path, a container, the data
 * path a rule addresses it by, a layout node by its position.
 *
 * Out of `session.ts` because none of it is a command — it holds no session
 * state and changes nothing — and because the size budget refused the next
 * thing added there, which is the seam that file’s entry in
 * `apps/docs/src/size.test.ts` names: one concern per file over a shared
 * attempt-and-commit core.
 */

export const CONTAINER_TYPES = new Set(['group', 'page', 'repeater'])

export interface Located {
  siblings: FieldDef[]
  index: number
}

/** The child list of the container at `keyPath` — the root list for []. */
export function containerAt(
  document: FormSchema,
  keyPath: readonly string[],
): FieldDef[] | undefined {
  if (keyPath.length === 0) return document.model.fields
  const found = locate(document, keyPath)
  if (found === undefined) return undefined
  const field = found.siblings[found.index]!
  if (!CONTAINER_TYPES.has(field.type)) return undefined
  field.fields = field.fields ?? []
  return field.fields
}

export function locate(document: FormSchema, keyPath: readonly string[]): Located | undefined {
  if (keyPath.length === 0) return undefined
  let siblings: FieldDef[] = document.model.fields
  for (let depth = 0; depth < keyPath.length; depth++) {
    const index = siblings.findIndex((field) => field.key === keyPath[depth])
    if (index === -1) return undefined
    if (depth === keyPath.length - 1) return { siblings, index }
    const next = siblings[index]!.fields
    if (next === undefined) return undefined
    siblings = next
  }
  return undefined
}

/** Every container's key path, root first. */
export function containerPaths(document: FormSchema): string[][] {
  const paths: string[][] = [[]]
  const walk = (fields: readonly FieldDef[], prefix: string[]): void => {
    for (const field of fields) {
      if (!CONTAINER_TYPES.has(field.type)) continue
      const here = [...prefix, field.key]
      paths.push(here)
      walk(field.fields ?? [], here)
    }
  }
  walk(document.model.fields, [])
  return paths
}

/**
 * The path a rule and a layout node address a field by, which is not its key path.
 *
 * Pages are transparent for data, so a field inside one is addressed without the
 * page: `about.needsVisa` in the tree is `needsVisa` in the model. Exported
 * because the logic panel composed a rule target by joining the key path, and a
 * rule on any field inside a page was therefore refused with "No field has the
 * data path" — in the builder, for as long as pages have existed.
 */
export function dataPathOf(document: FormSchema, keyPath: readonly string[]): string | undefined {
  const segments: string[] = []
  let fields: readonly FieldDef[] = document.model.fields

  for (const [depth, key] of keyPath.entries()) {
    const field = fields.find((candidate) => candidate.key === key)
    if (field === undefined) return undefined
    if (field.type !== 'page') segments.push(key)
    if (depth === keyPath.length - 1) return segments.join('.')
    fields = field.fields ?? []
  }
  return undefined
}

/**
 * The page a page's questions should join, or nothing if there is no other.
 *
 * The page before, and the page after when there is none before — which is the
 * choice that keeps the document in its order either way, rather than the choice
 * between two directions it might look like. Nothing when this is the only page,
 * and the form then stops being a wizard.
 */
export function neighbouringPage(fields: readonly FieldDef[], at: number): number | undefined {
  for (let before = at - 1; before >= 0; before -= 1) {
    if (fields[before]!.type === 'page') return before
  }
  for (let after = at + 1; after < fields.length; after += 1) {
    if (fields[after]!.type === 'page') return after
  }
  return undefined
}

export interface LocatedNode {
  siblings: LayoutNode[]
  index: number
}

export function locateLayout(
  document: FormSchema,
  address: LayoutAddress,
): LocatedNode | undefined {
  if (address.path.length === 0) return undefined
  const siblings = layoutChildrenAt(document, address.layout, address.path.slice(0, -1))
  if (siblings === undefined) return undefined
  const index = address.path[address.path.length - 1]!
  if (index < 0 || index >= siblings.length) return undefined
  return { siblings, index }
}

export function layoutPointer(address: LayoutAddress): string {
  return `/layouts/${address.layout}/nodes/${address.path.join('/')}`
}
