import { canonicalize } from './canonical.js'
import type { Change, FieldDef, FormSchema } from './types.js'

/**
 * Classify what changed between two schema versions, and how much it costs the
 * data already collected under the old one.
 *
 * This is the function draft migration, the builder's "what changed before you
 * publish" view, export column unioning and the consumer CI compatibility gate
 * all read from. It exists before the server does, on purpose: getting the
 * severity model wrong is the one mistake that cannot be refactored once there
 * is production data.
 *
 * Field identity is the `key`, never the position, so reordering is not a
 * change. A key that changes without a declared `renamedFrom` is reported as a
 * removal plus an addition rather than guessed at — guessing wrong silently
 * moves one field's data into another.
 */
export function diffSchemas(before: FormSchema, after: FormSchema): Change[] {
  if (canonicalize(before) === canonicalize(after)) return []

  const changes: Change[] = []

  if (before.specVersion !== after.specVersion) {
    changes.push({
      severity: 'breaking',
      kind: 'specVersion.changed',
      path: 'specVersion',
      detail: `Spec version ${before.specVersion} to ${after.specVersion}. Existing data cannot be rebound automatically.`,
    })
  }

  const beforeFields = byKey(before.model.fields)
  const afterFields = byKey(after.model.fields)

  /** Old keys claimed by a declared rename, so they are not also reported removed. */
  const renamedAway = new Set<string>()

  for (const field of after.model.fields) {
    const path = `model.fields.${field.key}`
    const source = field.renamedFrom

    if (source !== undefined && beforeFields.has(source) && !beforeFields.has(field.key)) {
      renamedAway.add(source)
      changes.push({
        severity: 'compatible',
        kind: 'field.renamed',
        path,
        detail: `Renamed from "${source}". Existing data maps across.`,
      })
      changes.push(...comparePair(beforeFields.get(source)!, field, path))
      continue
    }

    const previous = beforeFields.get(field.key)

    if (previous === undefined) {
      changes.push({
        severity: field.required === true ? 'lossy' : 'compatible',
        kind: 'field.added',
        path,
        detail:
          field.required === true
            ? `Added as required. Existing submissions have no value for it and are now invalid.`
            : `Added as optional.`,
      })
      continue
    }

    changes.push(...comparePair(previous, field, path))
  }

  for (const field of before.model.fields) {
    if (afterFields.has(field.key) || renamedAway.has(field.key)) continue
    changes.push({
      severity: 'lossy',
      kind: 'field.removed',
      path: `model.fields.${field.key}`,
      detail: `Removed. Existing values move to the submission's orphaned data and are not deleted.`,
    })
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind))
}

function comparePair(previous: FieldDef, next: FieldDef, path: string): Change[] {
  const changes: Change[] = []

  if (previous.type !== next.type) {
    changes.push({
      severity: 'lossy',
      kind: 'field.typeChanged',
      path,
      detail: `Type ${previous.type} to ${next.type}. Existing values may not coerce.`,
    })
  }

  const wasRequired = previous.required === true
  const isRequired = next.required === true

  if (wasRequired && !isRequired) {
    changes.push({
      severity: 'compatible',
      kind: 'field.requiredRelaxed',
      path,
      detail: `No longer required. Every existing value stays valid.`,
    })
  } else if (!wasRequired && isRequired) {
    changes.push({
      severity: 'lossy',
      kind: 'field.requiredTightened',
      path,
      detail: `Now required. Existing submissions that left it empty are now invalid.`,
    })
  }

  return changes
}

function byKey(fields: readonly FieldDef[]): Map<string, FieldDef> {
  return new Map(fields.map((field) => [field.key, field]))
}
