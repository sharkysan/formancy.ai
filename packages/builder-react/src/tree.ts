import { resolveText } from '@formancy/spec'
import type { FieldDef, FormSchema } from '@formancy/spec'
import type { Location } from '@formancy/builder-core'

/**
 * Turning a form document into something a keyboard can walk, and turning a
 * `Location` into something a person can choose.
 *
 * Both exist because of WCAG 2.2 SC 2.5.7: every drag operation needs a
 * keyboard alternative. The alternative is only real if the choices are
 * legible — a list of `{ parent: ['billing'], index: 1 }` satisfies the letter
 * of it and helps nobody.
 */

export interface TreeNode {
  /** Keys from the root down to this field, which is what commands take. */
  keyPath: readonly string[]
  def: FieldDef
  /** 0 for a top-level field. Drives indentation and `aria-level`. */
  depth: number
  /** Whether other fields can live inside it. */
  isContainer: boolean
}

const CONTAINERS = new Set(['group', 'page', 'repeater'])

/**
 * Every field in the document, in the order a person reading the form meets
 * them — a container immediately followed by its contents, which is what makes
 * arrow-key navigation match what the eye expects.
 */
export function flatten(schema: FormSchema): TreeNode[] {
  const nodes: TreeNode[] = []

  const walk = (fields: readonly FieldDef[], parent: readonly string[], depth: number): void => {
    for (const def of fields) {
      const keyPath = [...parent, def.key]
      const isContainer = CONTAINERS.has(def.type)
      nodes.push({ keyPath, def, depth, isContainer })
      if (isContainer) walk(def.fields ?? [], keyPath, depth + 1)
    }
  }

  walk(schema.model.fields, [], 0)
  return nodes
}

/**
 * What a person should call this field.
 *
 * A label may be a reference into the message catalogue, and a builder that
 * fell back to the key for those would show `items.qty` as `qty` the moment a
 * form was translated — which is precisely the form whose structure is hardest
 * to read. Resolved in the document's default locale, because that is the one
 * the spec guarantees is complete.
 */
export function nameOf(schema: FormSchema, def: FieldDef): string {
  const resolved = resolveText(schema, def.label, schema.i18n?.defaultLocale ?? '')
  if (resolved !== undefined && resolved !== '') return resolved
  return def.key
}

/** The fields directly inside a container, or the top level for an empty path. */
function childrenAt(schema: FormSchema, parent: readonly string[]): readonly FieldDef[] {
  let fields: readonly FieldDef[] = schema.model.fields

  for (const key of parent) {
    const found = fields.find((field) => field.key === key)
    if (found === undefined) return []
    fields = found.fields ?? []
  }

  return fields
}

/** The container itself, or undefined at the top level. */
function containerAt(schema: FormSchema, parent: readonly string[]): FieldDef | undefined {
  let found: FieldDef | undefined
  let fields: readonly FieldDef[] = schema.model.fields

  for (const key of parent) {
    found = fields.find((field) => field.key === key)
    if (found === undefined) return undefined
    fields = found.fields ?? []
  }

  return found
}

/**
 * A `Location` as a sentence: which container, and what the field would land
 * between. This is the text a screen reader announces when somebody is moving
 * a field without a mouse, so it has to be enough on its own.
 */
export function describeTarget(
  schema: FormSchema,
  location: Location,
  /**
   * The field being moved, if this is a move rather than an insertion.
   *
   * A move index counts positions in the container AFTER the field has been
   * lifted out, so describing it against the document as it stands names the
   * wrong neighbours — "between Customer and Billing" for what is really
   * "after Billing". Excluding the traveller is what makes the sentence true.
   */
  moving?: readonly string[],
): string {
  const container = containerAt(schema, location.parent)
  const where = container === undefined ? schema.title : nameOf(schema, container)

  const movingKey = moving?.[moving.length - 1]
  const fromSameContainer =
    moving !== undefined &&
    moving.length === location.parent.length + 1 &&
    location.parent.every((key, at) => key === moving[at])

  const siblings = childrenAt(schema, location.parent).filter(
    (field) => !(fromSameContainer && field.key === movingKey),
  )

  if (siblings.length === 0) return `${where}, as its first field`

  const before = siblings[location.index - 1]
  const after = siblings[location.index]

  if (before === undefined) return `${where}, before ${nameOf(schema, after!)}`
  if (after === undefined) return `${where}, after ${nameOf(schema, before)}`
  return `${where}, between ${nameOf(schema, before)} and ${nameOf(schema, after)}`
}
