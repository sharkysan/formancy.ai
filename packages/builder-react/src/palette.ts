import schema from '@formancy/spec/schema.json' with { type: 'json' }
import type { FieldDef } from '@formancy/spec'

/**
 * The list of field types a person can add, and the starting definition for
 * each — generated from the spec's JSON Schema for the same reason the property
 * panel is (see properties.ts). The schema already names and describes every
 * type; repeating those words here would create a second place for them to be
 * wrong.
 */

export interface PaletteEntry {
  type: string
  /** "Single-line text", from the schema. */
  title: string
  description: string
}

interface TypeBranch {
  const?: unknown
  title?: string
  description?: string
}

const root = schema as unknown as { $defs: Record<string, { oneOf?: TypeBranch[] }> }

/** Types a person adds from a palette. */
export function paletteEntries(): PaletteEntry[] {
  return (root.$defs['fieldType']?.oneOf ?? [])
    .filter((branch): branch is TypeBranch & { const: string } => typeof branch.const === 'string')
    // `page` is left out: pages may only sit at the top level, so offering one
    // from a palette that can target any container would offer a choice that is
    // refused most of the time. Adding a page is its own command.
    .filter((branch) => branch.const !== 'page')
    .map((branch) => ({
      type: branch.const,
      title: branch.title ?? branch.const,
      description: branch.description ?? '',
    }))
}

const CONTAINERS = new Set(['group', 'repeater'])

/**
 * A new field of this type, ready to insert.
 *
 * The key has to be unique and the label has to be something, because a field
 * with neither cannot be found by the conformance drivers — and a builder that
 * creates fields no test can reach is a builder that creates fields a screen
 * reader cannot reach either (see 0034).
 *
 * A container starts with one child, because an empty group fails validation:
 * the spec requires at least one field inside one. Inserting something that is
 * immediately invalid would make the very first edit a refusal.
 */
export function newFieldOfType(type: string, existingKeys: ReadonlySet<string>): FieldDef {
  const key = uniqueKey(type, existingKeys)
  const title = paletteEntries().find((entry) => entry.type === type)?.title ?? type

  const def: FieldDef = { key, type, label: title } as FieldDef

  if (CONTAINERS.has(type)) {
    const childKey = uniqueKey('field', new Set([...existingKeys, key]))
    return { ...def, fields: [{ key: childKey, type: 'text', label: 'New field' } as FieldDef] }
  }

  return def
}

/** `text`, then `text2`, `text3` — the first spelling nobody is using. */
function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${String(suffix)}`
    if (!taken.has(candidate)) return candidate
  }
}
