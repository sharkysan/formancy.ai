import schema from '@formancy/spec/schema.json' with { type: 'json' }

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

export type PropertyKind = 'string' | 'number' | 'boolean' | 'enum' | 'options' | 'strings'

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
  }
}

/**
 * Every property the panel should offer for a field of this type, in the order
 * the schema declares them: the ones all fields share, then the ones this type
 * adds.
 */
export function editablePropertiesFor(type: string): EditableProperty[] {
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
    const applies = matches(branch.if?.properties?.['type'], type)
    const taken = applies ? branch.then : branch.else
    take(deref(taken)?.properties)
  }

  return [...collected.values()]
}
