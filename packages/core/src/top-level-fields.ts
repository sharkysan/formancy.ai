import { ANSWER_KINDS } from '@formancy/spec'
import type { FieldDef } from '@formancy/spec'
import type { DeclaredType } from '@formancy/expressions'

/** The data fields sitting at the top level of the value: pages are
 *  transparent, everything else scopes.
 *
 *  Shared because `expressionProblems` has to declare exactly the same
 *  variables the engine does, and a second copy of that walk is the pair that
 *  drifts — silently, since a rule naming a field the other walk forgot
 *  reads as an undeclared identifier rather than as a bug in here. */
export function topLevelDataFields(defs: readonly FieldDef[]): FieldDef[] {
  const out: FieldDef[] = []
  for (const def of defs) {
    if (def.type === 'page') out.push(...topLevelDataFields(def.fields ?? []))
    else out.push(def)
  }
  return out
}

/**
 * How the engine declares a top-level field to its expressions, read from its answer's
 * shape (0189). Scalar leaves are `dyn`, because any field can be empty while somebody
 * types and CEL has no nullable scalars; containers and list answers keep their shape.
 *
 * A list is declared so that the bag seeds it with `[]` rather than null: `'a' in topics`
 * is false against an empty list and an ERROR against null, and a visibility rule that
 * errors fails OPEN — so a selectboxes field declared `dyn` would show every field it was
 * meant to hide, right up until the first tick. A matrix is a map, seeded `{}`, so
 * `has(rating.taste)` answers on an untouched form rather than erroring (0139).
 */
export function bagType(def: FieldDef): DeclaredType {
  const { shape } = ANSWER_KINDS[def.type]
  if (shape === 'group' || shape === 'matrix') return 'map'
  if (shape === 'choices' || shape === 'files' || shape === 'rows') return 'list'
  return 'dyn'
}

/**
 * A stored answer as a rule reads it: what is absent reads as the type's empty, and so does a
 * list stored as `null`, wherever it sits.
 *
 * Validation takes a repeater handed `null` for no rows, so an API body can send one, and
 * `size(lines)` against `null` is an error — a visible rule reading it failed open and a
 * computed count was never written. A group's own `null` is left alone: validation refuses it
 * (`type`), so no stored form reaches a rule with one. Only the bag is read this way — the
 * store keeps what was sent, so `value()` still says `null`.
 *
 * It goes down through groups and pages and stops at a repeater's rows: a list inside a row is
 * read as the row has it, null while untouched, which the guide's table of empty answers says
 * (`concepts/logic`) and a test holds. Returns the value it was given when nothing in it is a
 * null list, so a pass allocates only for the forms that have one.
 */
export function readAsStored(def: FieldDef, raw: unknown): unknown {
  const type = bagType(def)
  if (raw === undefined) return type === 'map' ? {} : type === 'list' ? [] : null
  if (raw === null) return type === 'list' ? [] : null
  return def.type === 'group' ? readFields(def.fields ?? [], raw) : raw
}

/** The members of one group, each read as stored; pages scope nothing, so their fields sit here. */
function readFields(defs: readonly FieldDef[], holder: unknown): unknown {
  if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) return holder
  const source = holder as Record<string, unknown>
  const out = { ...source }
  let any = false
  for (const def of topLevelDataFields(defs)) {
    if (!Object.hasOwn(source, def.key)) continue
    const read = readAsStored(def, source[def.key])
    if (read !== source[def.key]) {
      out[def.key] = read
      any = true
    }
  }
  return any ? out : holder
}
