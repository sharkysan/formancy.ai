import type { FieldDef, FormModel } from './types.js'

/**
 * Every data path the model defines, in document order.
 *
 * The walk mirrors the engine's and diffSchemas': a page is presentation and
 * scopes nothing, a group nests, a repeater scopes rows with a `[]` marker.
 * Containers appear as their own paths (they hold the object or the rows), and
 * their children after them.
 */
export function modelDataPaths(model: FormModel): string[] {
  const paths: string[] = []
  walk(model.fields, '', paths)
  return paths
}

function walk(fields: readonly FieldDef[], scope: string, out: string[]): void {
  for (const field of fields) {
    if (field.type === 'page') {
      walk(field.fields ?? [], scope, out)
      continue
    }
    const path = scope + field.key
    out.push(path)
    if (field.type === 'group') walk(field.fields ?? [], `${path}.`, out)
    else if (field.type === 'repeater') walk(field.fields ?? [], `${path}[].`, out)
  }
}
