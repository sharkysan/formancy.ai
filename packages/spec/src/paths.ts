import type { FieldDef, FormModel } from './types.js'

/**
 * Every data path the model defines, in document order, with the field that answers there.
 *
 * The walk mirrors the engine's and diffSchemas': a page is presentation and
 * scopes nothing, a group nests, a repeater scopes rows with a `[]` marker.
 * Containers appear as their own paths (they hold the object or the rows), and
 * their children after them. A path is in a rule target's own form, so
 * `items[].note` names that member of every row.
 */
export function modelDataFields(model: FormModel): Array<{ path: string; def: FieldDef }> {
  const out: Array<{ path: string; def: FieldDef }> = []
  walk(model.fields, '', out)
  return out
}

/** `modelDataFields`' paths alone. */
export function modelDataPaths(model: FormModel): string[] {
  return modelDataFields(model).map((field) => field.path)
}

function walk(fields: readonly FieldDef[], scope: string, out: Array<{ path: string; def: FieldDef }>): void {
  for (const field of fields) {
    if (field.type === 'page') {
      walk(field.fields ?? [], scope, out)
      continue
    }
    const path = scope + field.key
    out.push({ path, def: field })
    if (field.type === 'group') walk(field.fields ?? [], `${path}.`, out)
    else if (field.type === 'repeater') walk(field.fields ?? [], `${path}[].`, out)
  }
}
