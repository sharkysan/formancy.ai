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
 * A top-level answer as the rules of a pass read it: what is absent reads as the type's empty,
 * and a list stored as `null` reads as no rows, at the top and inside a group.
 *
 * Validation takes a repeater handed `null` for no rows, so an API body can send one, and
 * `size(lines)` against `null` is an error: a visible rule reading it failed open, a computed
 * count was never written, and inside a group the `has()` guard the guide recommends answered for
 * an absent list and failed open for a null one. The one reading serves the bag and both
 * read-backs a pass makes, after a computed write and after a row rule: a read-back that stored
 * the raw group would bring the null back for every rule after it.
 *
 * It reads every list-typed field this way, not only a repeater: `selectboxes`, `ranking` and
 * `file` are declared `list` to the expressions, and a rule reading an untouched list must never
 * meet `null` (`ANSWER_KINDS`). Validation refuses a null there, so it is reachable only through
 * `initialValue` or `setValue`, and reading it as `[]` costs nothing.
 *
 * A group's own `null` is left alone: validation refuses it (`type`). A repeater's rows are left
 * as stored: a list inside a row is null while untouched, which the guide's table of empty
 * answers says. Nothing is written back — `value()` still says `null` — and a value with no null
 * list in it is returned as it is, copied only where one was found.
 */
export function readNullListAsNoRows(def: FieldDef, raw: unknown): unknown {
  const type = bagType(def)
  if (raw === undefined) return type === 'map' ? {} : type === 'list' ? [] : null
  if (raw === null) return type === 'list' ? [] : null
  return def.type === 'group' ? readFields(def.fields ?? [], raw) : raw
}

/** The members of one group, each read so; pages scope nothing, so their fields sit here. */
function readFields(defs: readonly FieldDef[], holder: unknown): unknown {
  if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) return holder
  const source = holder as Record<string, unknown>
  let out: Record<string, unknown> | undefined
  for (const def of topLevelDataFields(defs)) {
    if (!Object.hasOwn(source, def.key)) continue
    const read = readNullListAsNoRows(def, source[def.key])
    if (read !== source[def.key]) (out ??= { ...source })[def.key] = read
  }
  return out ?? holder
}
