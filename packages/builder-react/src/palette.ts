import schema from '@formancy/spec/schema.json' with { type: 'json' }
import { SPEC_1_FIELD_TYPES } from '@formancy/spec'
import type { FieldDef, SpecVersion } from '@formancy/spec'

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

const SPEC_1 = new Set<string>(SPEC_1_FIELD_TYPES)

/**
 * Types a person adds from a palette.
 *
 * `specVersion` narrows the list to what the document being edited actually
 * allows. Offering a `selectboxes` while editing a version 1 document would
 * offer a choice the session refuses every time — and the refusal would read
 * as a broken builder rather than as a document that needs upgrading, which
 * is a thing the builder can offer to do.
 */
export function paletteEntries(specVersion?: SpecVersion): PaletteEntry[] {
  return (root.$defs['fieldType']?.oneOf ?? [])
    .filter((branch): branch is TypeBranch & { const: string } => typeof branch.const === 'string')
    // `page` is left out: pages may only sit at the top level, so offering one
    // from a palette that can target any container would offer a choice that is
    // refused most of the time. Adding a page is its own command.
    .filter((branch) => branch.const !== 'page')
    .filter((branch) => specVersion !== '1' || SPEC_1.has(branch.const))
    .map((branch) => ({
      type: branch.const,
      title: branch.title ?? branch.const,
      description: branch.description ?? '',
    }))
}

/**
 * Types this document cannot hold yet, with the version that would allow them.
 *
 * So the builder can say "these need spec 2" and offer the upgrade, rather
 * than silently showing a shorter list than the spec reference documents.
 */
export function typesNeedingUpgrade(specVersion: SpecVersion): PaletteEntry[] {
  if (specVersion !== '1') return []
  return paletteEntries().filter((entry) => !SPEC_1.has(entry.type))
}

const CONTAINERS = new Set(['group', 'repeater'])

const CHOICE_TYPES = new Set(['select', 'radio', 'selectboxes'])

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

  // A choice field with no options renders as an empty list, which is a
  // control nobody can answer. One starter option is something to edit; none
  // is a dead end the person has to work out how to leave.
  if (CHOICE_TYPES.has(type)) {
    return { ...def, options: [{ value: 'option1', label: 'First option' }] }
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
