import type { FieldDef } from '@formancy/spec'

/**
 * The fields a list of definitions holds for data, with every page opened: a page contributes no
 * segment to a data path, so its fields stand where it does. One function for every walk of a
 * submission from its schema, because a walk that treated a page as a group looked for the page's
 * key in the answers, found nothing, and checked none of the fields on it — the membership check
 * did, for every paged form until 2026-11-27 (hazard A7).
 */
export function flattenPages(fields: readonly FieldDef[]): FieldDef[] {
  const out: FieldDef[] = []
  for (const field of fields) {
    if (field.type === 'page') out.push(...flattenPages(field.fields ?? []))
    else out.push(field)
  }
  return out
}
