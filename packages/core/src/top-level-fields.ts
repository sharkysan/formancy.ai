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
