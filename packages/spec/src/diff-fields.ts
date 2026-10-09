import { canonicalize, same } from './canonical.js'
import type { Change, FieldDef, FieldOption, FormSchema } from './types.js'

/**
 * What changed about the fields themselves.
 *
 * Split out of `diff.ts` when the size budget refused the comparators for
 * options, constraints and a field’s residual properties. One reason to
 * change: everything here is about a field’s identity and what it will still
 * accept. The document-level areas — naming, catalogues, layouts — stayed
 * behind with the orchestration, and the rules went to `diff-rules.ts`.
 */

/**
 * What happened to the fields, and where a declared rename moved each one.
 *
 * The map is not a by-product. A rename rewrites the expressions that
 * referenced the old path, so `compareRules` needs it to tell an expression
 * that followed a field from one that changed its mind.
 */
export function compareFields(
  before: FormSchema,
  after: FormSchema,
): { changes: Change[]; renamed: ReadonlyMap<string, string> } {
  const changes: Change[] = []
  const renamed = new Map<string, string>()

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
      renamed.set(renameSource, entry.dataPath)
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

  return { changes, renamed }
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

/**
 * Which direction makes a constraint stricter.
 *
 * `higher` is a floor — raising it rejects values that used to pass. `lower` is
 * a ceiling. `either` is one this function cannot order: a changed `pattern`
 * may be looser, stricter or neither, and there is no cheap way to know, so it
 * counts as a tightening. Fail closed: calling a tightening a relaxation
 * rebinds a draft the form will then reject.
 */
const CONSTRAINT_DIRECTION: Readonly<Record<string, 'higher' | 'lower' | 'either'>> = {
  min: 'higher',
  minLength: 'higher',
  minItems: 'higher',
  earliest: 'higher',
  max: 'lower',
  maxLength: 'lower',
  maxItems: 'lower',
  maxFileSize: 'lower',
  maxPoints: 'lower',
  latest: 'lower',
  pattern: 'either',
  mask: 'either',
  format: 'either',
  step: 'either',
  accept: 'either',
  optionsSource: 'either',
}

/** Properties a comparison above already accounts for, excluded from the residual. */
const COMPARED_PROPERTIES: ReadonlySet<string> = new Set([
  'key',
  'type',
  'required',
  'renamedFrom',
  'label',
  'options',
  // Children have identities of their own and are walked separately.
  'fields',
  ...Object.keys(CONSTRAINT_DIRECTION),
])

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

  if (!same(previous.label, next.label)) {
    changes.push({
      severity: 'compatible',
      kind: 'field.relabelled',
      path,
      detail: `The question is worded differently. Every stored answer keeps its path and its validity — but it was given to the old wording, which is worth knowing before comparing one period with another.`,
    })
  }

  changes.push(...compareOptions(previous.options, next.options, path))
  changes.push(...compareConstraints(previous, next, path))
  changes.push(...residualChange(previous, next, path))

  return changes
}

/**
 * What a choice offers.
 *
 * Identity is `value`, because that is what a submission stores — a label is
 * what a person read. So withdrawing an option is the one edit here that
 * leaves an answer outside the document's own vocabulary, and relabelling one
 * leaves every answer exactly where it was.
 */
function compareOptions(
  previous: readonly FieldOption[] | undefined,
  next: readonly FieldOption[] | undefined,
  path: string,
): Change[] {
  if (previous === undefined && next === undefined) return []

  const was = new Map((previous ?? []).map((option) => [option.value, option]))
  const now = new Map((next ?? []).map((option) => [option.value, option]))
  const changes: Change[] = []

  const gone = [...was.keys()].filter((value) => !now.has(value))
  if (gone.length > 0) {
    changes.push({
      severity: 'lossy',
      kind: 'field.optionRemoved',
      path,
      detail: `No longer offers ${gone.map((value) => `"${value}"`).join(', ')}. Submissions already carrying one of those hold a value this form no longer defines.`,
    })
  }

  const fresh = [...now.keys()].filter((value) => !was.has(value))
  if (fresh.length > 0) {
    changes.push({
      severity: 'compatible',
      kind: 'field.optionAdded',
      path,
      detail: `Now also offers ${fresh.map((value) => `"${value}"`).join(', ')}. Existing answers are unaffected.`,
    })
  }

  const relabelled = [...now.keys()].filter(
    (value) => was.has(value) && !same(was.get(value)?.label, now.get(value)?.label),
  )
  if (relabelled.length > 0) {
    changes.push({
      severity: 'compatible',
      kind: 'field.optionRelabelled',
      path,
      detail: `${relabelled.map((value) => `"${value}"`).join(', ')} reads differently. The stored value is unchanged, so no answer moves.`,
    })
  }

  return changes
}

/** A value two of which can be put in order, which is what a bound needs. */
function comparable(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string'
}

/** Bounds, patterns and formats: what the field will still accept. */
function compareConstraints(previous: FieldDef, next: FieldDef, path: string): Change[] {
  const tightened: string[] = []
  const relaxed: string[] = []

  for (const [property, direction] of Object.entries(CONSTRAINT_DIRECTION)) {
    const was = (previous as unknown as Record<string, unknown>)[property]
    const now = (next as unknown as Record<string, unknown>)[property]
    if (same(was, now)) continue

    if (now === undefined) {
      relaxed.push(property)
    } else if (direction === 'either' || !comparable(was) || !comparable(now) || typeof was !== typeof now) {
      /*
       * Three cases, one answer, and the answer is "stricter".
       *
       * A constraint arriving where there was none can only reject what used
       * to pass. A `pattern` or a `format` that changed cannot be ordered at
       * all. And a property that changed shape — a number where a string was —
       * is not a bound this function understands.
       *
       * There was a fourth branch here for `was === undefined`, written first
       * and removed when a mutation of it reddened nothing: `comparable`
       * already answers for it, so the branch was dead rather than untested.
       */
      tightened.push(property)
    } else {
      const stricter = direction === 'higher' ? now > was : now < was
      ;(stricter ? tightened : relaxed).push(property)
    }
  }

  const changes: Change[] = []
  if (tightened.length > 0) {
    changes.push({
      severity: 'lossy',
      kind: 'field.constraintTightened',
      path,
      detail: `${tightened.join(', ')} now accepts less than it did. Stored answers outside the new bound are invalid where they were not.`,
    })
  }
  if (relaxed.length > 0) {
    changes.push({
      severity: 'compatible',
      kind: 'field.constraintRelaxed',
      path,
      detail: `${relaxed.join(', ')} now accepts at least as much as it did. Every stored answer stays valid.`,
    })
  }
  return changes
}

/**
 * Anything about a field this function has no comparator for.
 *
 * `widget`, `clearOnHide`, a repeater's `addLabel`, a datagrid's `columns` —
 * and whatever the next spec version adds. Reported rather than ignored,
 * because the alternative is a field that changed and a diff that says it did
 * not. `lossy` because `clearOnHide` is in this set and it decides whether a
 * hidden field's answer survives at all: a property nobody compared must not
 * be assumed harmless.
 */
function residualChange(previous: FieldDef, next: FieldDef, path: string): Change[] {
  const rest = (def: FieldDef): string =>
    canonicalize(
      Object.fromEntries(
        Object.entries(def).filter(([property]) => !COMPARED_PROPERTIES.has(property)),
      ),
    )

  if (rest(previous) === rest(next)) return []

  const differing = new Set<string>()
  for (const property of [...Object.keys(previous), ...Object.keys(next)]) {
    if (COMPARED_PROPERTIES.has(property)) continue
    const was = (previous as unknown as Record<string, unknown>)[property]
    const now = (next as unknown as Record<string, unknown>)[property]
    if (!same(was, now)) differing.add(property)
  }

  return [
    {
      severity: 'lossy',
      kind: 'field.changed',
      path,
      detail: `${[...differing].sort().join(', ')} changed. This diff has no rule for what that costs stored answers, so it is reported as though it costs something.`,
    },
  ]
}
