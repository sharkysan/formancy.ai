import schema from '@formancy/spec/schema.json' with { type: 'json' }
import { createBuilderText } from './messages.js'
import type { BuilderText } from './messages.js'

/**
 * What the property panel offers for a field, read out of the spec's own JSON
 * Schema.
 *
 * Generated rather than written down, because a hand-written panel per field
 * type rots within two releases: somebody adds a property to the spec, nobody
 * remembers the panel, and the builder quietly cannot set it. The schema
 * already says which properties belong to which type — that is what its
 * `allOf` / `if` / `then` branches are — so reading them is both less code and
 * the only version that cannot drift.
 */

export type PropertyKind =
  'string' | 'number' | 'boolean' | 'enum' | 'options' | 'columns' | 'strings'

export interface EditableProperty {
  name: string
  /** The schema's own title, so the builder and the reference agree. */
  title: string
  description: string
  kind: PropertyKind
  /** For `enum`: the values the schema allows. */
  choices?: string[]
  default?: unknown
  minimum?: number
  maximum?: number
  /**
   * Whether a bare NUMBER is also a legal value here, alongside text.
   *
   * `span` is the case: `anyOf: [{ type: "integer" }, { const: "all" }]`. It is not a
   * number property — a number box could not express `all`, which is the value an
   * author almost always wants — and it is not an enum either. So it is a text box
   * that has to hand over `2` rather than `"2"`, and the schema is what says so.
   *
   * Measured before this existed: `setLayoutNodeProperty(..., 'span', '2')` is refused
   * and `..., 2` is accepted, so typing a numeric span did nothing at all and nothing
   * said why. Pinned in `packages/builder-core/src/layout.test.ts`.
   */
  numericAlternative?: boolean
}

/**
 * Properties the panel deliberately does not offer.
 *
 * `key` is a rename: it carries `renamedFrom` semantics and has its own
 * command, and typing over it in a text box is how answers get orphaned.
 * `fields` is structure, which the tree edits. `type` would be a different
 * field. `renamedFrom` is written by the session, never by a person.
 */
const NOT_OURS = new Set(['key', 'type', 'fields', 'renamedFrom'])

interface JsonSchemaNode {
  title?: string
  description?: string
  type?: string
  default?: unknown
  minimum?: number
  maximum?: number
  enum?: unknown[]
  oneOf?: JsonSchemaNode[]
  const?: unknown
  $ref?: string
  items?: JsonSchemaNode
  properties?: Record<string, JsonSchemaNode>
  if?: { properties?: Record<string, JsonSchemaNode> }
  then?: JsonSchemaNode
  else?: JsonSchemaNode
  allOf?: JsonSchemaNode[]
  anyOf?: JsonSchemaNode[]
}

const root = schema as unknown as JsonSchemaNode & { $defs: Record<string, JsonSchemaNode> }

function deref(node: JsonSchemaNode | undefined): JsonSchemaNode | undefined {
  if (node?.$ref === undefined) return node
  return root.$defs[node.$ref.replace('#/$defs/', '')]
}

/** Whether an `if` branch's type condition matches this field type. */
function matches(condition: JsonSchemaNode | undefined, type: string): boolean {
  if (condition === undefined) return false
  if (condition.const !== undefined) return condition.const === type
  if (Array.isArray(condition.enum)) return condition.enum.includes(type)
  return false
}

/** The allowed values of a closed list, however the schema spells it. */
function choicesOf(node: JsonSchemaNode): string[] | undefined {
  if (Array.isArray(node.enum)) return node.enum.map(String)
  if (Array.isArray(node.oneOf) && node.oneOf.every((branch) => branch.const !== undefined)) {
    return node.oneOf.map((branch) => String(branch.const))
  }
  return undefined
}

function kindOf(node: JsonSchemaNode, name: string): PropertyKind {
  // Options are a list of value/label pairs and need their own editor; the
  // generic renderer would produce a textarea full of JSON.
  if (name === 'options') return 'options'
  // A datagrid's columns are the same shape of problem: an array of objects, one of
  // which names a sibling field. Found missing by the guard in properties.test.ts
  // rather than by anybody using the builder.
  if (name === 'columns' && node.type === 'array') return 'columns'
  if (choicesOf(node) !== undefined) return 'enum'
  if (node.type === 'boolean') return 'boolean'
  if (node.type === 'number' || node.type === 'integer') return 'number'
  // A plain list of strings — a file field's `accept`, today. Read from the
  // schema rather than from the property's name, so the next one the spec
  // grows gets an editor without anybody remembering to add it here.
  if (node.type === 'array' && node.items?.type === 'string') return 'strings'
  return 'string'
}

function describe(name: string, raw: JsonSchemaNode): EditableProperty {
  // A property may carry its own title next to a $ref — `label` does, pointing
  // at the shared Text definition — and its own words win.
  const resolved = deref(raw) ?? raw
  const choices = choicesOf(resolved)

  return {
    name,
    title: raw.title ?? resolved.title ?? name,
    description: raw.description ?? resolved.description ?? '',
    kind: kindOf(resolved, name),
    ...(choices === undefined ? {} : { choices }),
    ...(raw.default === undefined ? {} : { default: raw.default }),
    ...(resolved.minimum === undefined ? {} : { minimum: resolved.minimum }),
    ...(resolved.maximum === undefined ? {} : { maximum: resolved.maximum }),
    ...(allowsANumber(resolved) ? { numericAlternative: true } : {}),
  }
}

/**
 * Whether one of a property's alternative branches is a plain number.
 *
 * Read from the schema rather than from the property's name, so the next property the
 * format writes as "a number or a word" is handled without anybody remembering.
 */
function allowsANumber(node: JsonSchemaNode): boolean {
  if (node.type === 'number' || node.type === 'integer') return false
  const branches = [...(node.anyOf ?? []), ...(node.oneOf ?? [])]
  return branches.some((branch) => branch.type === 'number' || branch.type === 'integer')
}

/**
 * Every property the panel should offer for a field, in the order the schema
 * declares them: the ones all fields share, then the ones this type adds, then the
 * ones its WIDGET adds.
 *
 * The widget is the second half and it was missing. Some branches are conditioned on
 * `type` and some on `widget` — `columns` is `if: { widget: { const: "datagrid" } }`
 * — so a walk that matched only the type silently skipped them, and the builder could
 * not configure a datagrid's columns at all. Found by the coverage guard in
 * properties.test.ts rather than by anybody using it.
 */
export function editablePropertiesFor(
  type: string,
  widget?: string,
  text: BuilderText = createBuilderText(),
): EditableProperty[] {
  const field = root.$defs['field']
  if (field === undefined) return []

  const collected = new Map<string, EditableProperty>()

  const take = (properties: Record<string, JsonSchemaNode> | undefined): void => {
    for (const [name, node] of Object.entries(properties ?? {})) {
      if (NOT_OURS.has(name) || collected.has(name)) continue
      collected.set(name, describe(name, node))
    }
  }

  take(field.properties)

  for (const branch of field.allOf ?? []) {
    const condition = branch.if?.properties
    // A branch conditions on the type or on the widget, and the schema uses both.
    const applies =
      condition?.['widget'] === undefined
        ? matches(condition?.['type'], type)
        : widget !== undefined && matches(condition['widget'], widget)
    const taken = applies ? branch.then : branch.else
    take(deref(taken)?.properties)
  }

  return [...collected.values()].map((property) => inLanguage(property, text))
}

/**
 * Properties a LAYOUT node deliberately does not offer.
 *
 * `kind` is what the node IS — changing it in a text box would turn a table into a
 * section without moving its children, which the arrangement's own commands do
 * properly. `children` is structure, which the arrangement tree edits. `path` names
 * the answer a field node places, and a node pointed at a different answer is a
 * different placement, with the one-place-per-field rule to enforce; the tree moves
 * and adds placements, and that is where a path is chosen.
 */
const NOT_OURS_IN_A_LAYOUT = new Set(['kind', 'children', 'path'])

/** The branches of the layout node union, each with the kinds it covers. */
function layoutBranches(): Array<{ kinds: string[]; properties: Record<string, JsonSchemaNode> }> {
  const union = root.$defs['layoutNode']
  const branches = union?.oneOf ?? union?.anyOf ?? []
  return branches.map((branch) => {
    const resolved = deref(branch) ?? branch
    const properties = resolved.properties ?? {}
    const kind = properties['kind']
    const kinds = kind?.const !== undefined ? [String(kind.const)] : (kind?.enum ?? []).map(String)
    return { kinds, properties }
  })
}

/**
 * Every property the panel should offer for a layout node of this kind.
 *
 * Generated from the same JSON Schema the field panel reads, for the same reason: a
 * hand-written panel per node kind rots the moment somebody adds a property to the
 * format. `span` arrived that way and had no editor at all
 * ([0074](../../../docs/decisions/0074-a-table-child-may-span.md)) — a property the
 * format validated, the renderers honoured, and the builder could not set.
 */
export function editableLayoutPropertiesFor(
  kind: string,
  text: BuilderText = createBuilderText(),
): EditableProperty[] {
  const collected = new Map<string, EditableProperty>()

  for (const branch of layoutBranches()) {
    if (!branch.kinds.includes(kind)) continue
    for (const [name, node] of Object.entries(branch.properties)) {
      if (NOT_OURS_IN_A_LAYOUT.has(name) || collected.has(name)) continue
      collected.set(name, describe(name, node))
    }
  }

  return [...collected.values()].map((property) => inLanguage(property, text))
}

/** Every layout kind the format has, derived rather than listed. */
export function layoutKinds(): string[] {
  return [...new Set(layoutBranches().flatMap((branch) => branch.kinds))]
}

/**
 * A property's title and description in the builder's language. The English is
 * the schema's, and stays the key: the reference documentation reads the same
 * words from the same place (0121).
 */
function inLanguage(property: EditableProperty, text: BuilderText): EditableProperty {
  return {
    ...property,
    title: text.schema(property.title),
    description: property.description === '' ? '' : text.schema(property.description),
  }
}
