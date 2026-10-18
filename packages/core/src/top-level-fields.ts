import type { FieldDef } from '@formancy/spec'

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
