import { canonicalize } from './canonical.js'
import type { Change, FieldDef, FormSchema } from './types.js'

/**
 * Classify what changed between two schema versions, and how much it costs the
 * data already collected under the old one.
 *
 * This is the function draft migration, the builder's "what changed before you
 * publish" view, export column unioning and the consumer CI compatibility gate
 * all read from. Getting the severity model wrong is the one mistake that
 * cannot be refactored once there is production data.
 *
 * Identity is the DATA PATH, not the position and not the layout: a `group`
 * scopes its children (`g.child`), a `repeater` scopes rows (`items[].name`),
 * and a `page` scopes nothing — so moving a field to another wizard page is no
 * change at all, while moving it into a group is a removal plus an addition,
 * because the submission shape actually changed.
 *
 * A key that changes without a declared `renamedFrom` is reported as a removal
 * plus an addition rather than guessed at — guessing wrong silently moves one
 * field's data into another. A declared rename translates the data paths of
 * everything beneath it, so renaming a group carries its children along.
 */
export function diffSchemas(before: FormSchema, after: FormSchema): Change[] {
  if (canonicalize(before) === canonicalize(after)) return []

  const changes: Change[] = []

  if (before.specVersion !== after.specVersion) {
    // Upwards is a superset and costs nothing: version 2 adds field types and
    // layout kinds and removes none, so a document that was valid stays valid
    // and every answer keeps its path. Downwards is not, because whatever was
    // added is now unreadable — and this is a diff, so it has to say which
    // direction it is looking.
    const upgrade = before.specVersion < after.specVersion
    changes.push({
      severity: upgrade ? 'compatible' : 'breaking',
      kind: 'specVersion.changed',
      path: 'specVersion',
      detail: upgrade
        ? `Spec version ${before.specVersion} to ${after.specVersion}. Version ${after.specVersion} only adds, so the data keeps its shape.`
        : `Spec version ${before.specVersion} to ${after.specVersion}. A reader of the older version cannot be given what the newer one added, so existing data cannot be rebound automatically.`,
    })
  }

  const beforeByPath = new Map<string, FlatField>()
  flatten(before.model.fields, '', '', beforeByPath)
  const afterByPath = new Map<string, FlatField>()
  flatten(after.model.fields, '', '', afterByPath)

  /** Before-side data paths claimed by a match, so they are not also removals. */
  const consumed = new Set<string>()

  for (const entry of afterByPath.values()) {
    const ownBefore = entry.beforeScope + entry.def.key
    const renameSource =
      entry.def.renamedFrom === undefined ? undefined : entry.beforeScope + entry.def.renamedFrom
    const path = `model.fields.${entry.dataPath}`

    if (
      renameSource !== undefined &&
      beforeByPath.has(renameSource) &&
      !beforeByPath.has(ownBefore) &&
      !consumed.has(renameSource)
    ) {
      consumed.add(renameSource)
      changes.push({
        severity: 'compatible',
        kind: 'field.renamed',
        path,
        detail: `Renamed from "${entry.def.renamedFrom}". Existing data maps across.`,
      })
      changes.push(...comparePair(beforeByPath.get(renameSource)!.def, entry.def, path))
      continue
    }

    const previous = beforeByPath.get(ownBefore)
    if (previous !== undefined && !consumed.has(ownBefore)) {
      consumed.add(ownBefore)
      changes.push(...comparePair(previous.def, entry.def, path))
      continue
    }

    changes.push({
      severity: entry.def.required === true ? 'lossy' : 'compatible',
      kind: 'field.added',
      path,
      detail:
        entry.def.required === true
          ? `Added as required. Existing submissions have no value for it and are now invalid.`
          : `Added as optional.`,
    })
  }

  for (const entry of beforeByPath.values()) {
    if (consumed.has(entry.dataPath)) continue
    changes.push({
      severity: 'lossy',
      kind: 'field.removed',
      path: `model.fields.${entry.dataPath}`,
      detail: `Removed. Existing values move to the submission's orphaned data and are not deleted.`,
    })
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind))
}

interface FlatField {
  /** Data path in this schema, e.g. `g.child` or `items[].name`. */
  dataPath: string
  /**
   * The scope this field's parent had in the PREVIOUS schema, translating the
   * declared rename of every ancestor. Identity lookups against the before
   * map go through this, which is what lets a renamed group keep its children.
   */
  beforeScope: string
  def: FieldDef
}

function flatten(
  defs: readonly FieldDef[],
  scope: string,
  beforeScope: string,
  out: Map<string, FlatField>,
): void {
  for (const def of defs) {
    // Pages hold no data, so they contribute no identity of their own.
    if (def.type === 'page') {
      flatten(def.fields ?? [], scope, beforeScope, out)
      continue
    }

    const dataPath = scope + def.key
    out.set(dataPath, { dataPath, beforeScope, def })

    if (def.type === 'group' || def.type === 'repeater') {
      const marker = def.type === 'repeater' ? '[].' : '.'
      const childBeforeScope = beforeScope + (def.renamedFrom ?? def.key) + marker
      flatten(def.fields ?? [], dataPath + marker, childBeforeScope, out)
    }
  }
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
