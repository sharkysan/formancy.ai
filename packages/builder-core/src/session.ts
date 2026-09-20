import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'

/**
 * The headless document engine under the form builder.
 *
 * Three rules shape everything here.
 *
 * **A session may never hold a document the validator rejects.** Commands are
 * applied to a copy, validated, and only then committed; a command that would
 * produce an invalid document is refused with the validator's own
 * author-facing message and the held document is untouched. That is why
 * `canPublish()` is true by construction rather than by hope — and why legality
 * is decided by *trying* a command rather than by a second implementation of
 * the validator's rules, which would drift from it.
 *
 * **The document is frozen and copied at every boundary.** A builder UI is a
 * projection of this state, and a projection that can reach in and mutate the
 * model is how undo stops working.
 *
 * **Commands, never gestures.** Insert, move, remove, rename, set. WCAG 2.2
 * requires every drag operation to have a keyboard equivalent, so the keyboard
 * path is the API and a drag layer is sugar over it — not the other way round,
 * which is how the keyboard path ends up an afterthought nobody finishes.
 */
export interface Refusal {
  ok: false
  /** JSON Pointer into the document, as the validator reports it. */
  path: string
  message: string
}

export type CommandOutcome = { ok: true; document: FormSchema } | Refusal

/** Where a field goes: the key path of its container, and a position in it. */
export interface Location {
  parent: readonly string[]
  index: number
}

export interface BuilderSession {
  /** The current document: frozen, and never the caller's object. */
  document(): FormSchema
  /** A mutable deep copy, safe to hand to anything. */
  exportDocument(): FormSchema
  /** Increments once per accepted command, undo or redo. */
  revision(): number
  canUndo(): boolean
  canRedo(): boolean
  undo(): boolean
  redo(): boolean
  /** The validator's verdict on the held document. Valid by construction. */
  canPublish(): { valid: boolean; errors: SchemaError[] }
  /** One notification per accepted command, undo or redo. */
  subscribe(listener: () => void): () => void

  insertField(location: Location, def: FieldDef): CommandOutcome
  removeField(keyPath: readonly string[]): CommandOutcome
  moveField(from: readonly string[], to: Location): CommandOutcome
  renameField(keyPath: readonly string[], newKey: string): CommandOutcome
  setFieldProperty(keyPath: readonly string[], property: string, value: unknown): CommandOutcome
  addRule(rule: LogicRule): CommandOutcome
  updateRule(index: number, rule: LogicRule): CommandOutcome
  removeRule(index: number): CommandOutcome

  /**
   * Every location a field may legally land: a palette entry (pass a
   * definition) or an existing field being moved (pass its key path).
   */
  validTargets(what: FieldDef | readonly string[]): Location[]
}

const CONTAINER_TYPES = new Set(['group', 'page', 'repeater'])

export function createBuilderSession(initial: FormSchema): BuilderSession {
  const opened = deepFreeze(copy(initial))
  const verdict = verdictFor(opened)
  if (!verdict.valid) {
    // Opening an invalid document would make every later refusal ambiguous:
    // the caller could not tell whether their command broke the form or merely
    // failed to fix it.
    throw new Error(
      `Cannot open this document in a builder session: ${verdict.errors
        .map((error) => `${error.path} ${error.message}`)
        .join('; ')}`,
    )
  }

  /**
   * The keys every field had when the session opened. A rename declares
   * `renamedFrom` against THIS, never against the previous key: chaining
   * would point a migration at an interim key no submission ever used.
   */
  const baselineKeys = new Map<FieldDef, string>()
  indexBaseline(opened.model.fields, baselineKeys)

  const past: FormSchema[] = []
  const future: FormSchema[] = []
  let present: FormSchema = opened
  let revision = 0
  const listeners = new Set<() => void>()

  /** Identity survives edits by data path, so a renamed field keeps its
   *  baseline. Keyed by the path a field had in the baseline document. */
  const baselineByCurrentKey = new Map<string, string>()
  seedBaselineByKey(opened.model.fields, baselineByCurrentKey)

  function commit(candidate: FormSchema): CommandOutcome {
    const check = verdictFor(candidate)
    if (!check.valid) {
      const first = check.errors[0]!
      return { ok: false, path: first.path, message: first.message }
    }
    past.push(present)
    // A new command abandons the redo branch: redoing onto a different history
    // would replay an edit against a document it was never made against.
    future.length = 0
    present = deepFreeze(candidate)
    revision += 1
    for (const listener of [...listeners]) listener()
    return { ok: true, document: present }
  }

  function refuse(path: string, message: string): Refusal {
    return { ok: false, path, message }
  }

  /** Apply `edit` to a working copy and commit if the validator agrees. */
  function attempt(edit: (draft: FormSchema) => Refusal | undefined): CommandOutcome {
    const draft = copy(present)
    const problem = edit(draft)
    if (problem !== undefined) return problem
    return commit(draft)
  }

  return {
    document: () => present,
    exportDocument: () => copy(present),
    revision: () => revision,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    undo() {
      const previous = past.pop()
      if (previous === undefined) return false
      future.push(present)
      present = previous
      revision += 1
      for (const listener of [...listeners]) listener()
      return true
    },

    redo() {
      const next = future.pop()
      if (next === undefined) return false
      past.push(present)
      present = next
      revision += 1
      for (const listener of [...listeners]) listener()
      return true
    },

    canPublish: () => verdictFor(present),

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    insertField(location, def) {
      return attempt((draft) => {
        const container = containerAt(draft, location.parent)
        if (container === undefined) {
          return refuse('/model/fields', `No container at "${location.parent.join('.')}".`)
        }
        container.splice(clampIndex(location.index, container.length), 0, copy(def))
        return undefined
      })
    },

    removeField(keyPath) {
      return attempt((draft) => {
        const found = locate(draft, keyPath)
        if (found === undefined) return refuse('/model/fields', `No field at "${keyPath.join('.')}".`)
        found.siblings.splice(found.index, 1)
        return undefined
      })
    },

    moveField(from, to) {
      if (isPrefix(from, to.parent)) {
        return refuse(
          '/model/fields',
          `Cannot move "${from.join('.')}" inside itself or one of its own children.`,
        )
      }
      return attempt((draft) => {
        const found = locate(draft, from)
        if (found === undefined) return refuse('/model/fields', `No field at "${from.join('.')}".`)
        const [moved] = found.siblings.splice(found.index, 1)
        const container = containerAt(draft, to.parent)
        if (container === undefined) {
          return refuse('/model/fields', `No container at "${to.parent.join('.')}".`)
        }
        container.splice(clampIndex(to.index, container.length), 0, moved!)
        return undefined
      })
    },

    renameField(keyPath, newKey) {
      return attempt((draft) => {
        const found = locate(draft, keyPath)
        if (found === undefined) return refuse('/model/fields', `No field at "${keyPath.join('.')}".`)
        const field = found.siblings[found.index]!
        const baseline = baselineByCurrentKey.get(field.key) ?? field.key

        field.key = newKey
        if (newKey === baseline) {
          // Back where it started: there is nothing to migrate, and leaving a
          // renamedFrom pointing at the current key is itself invalid.
          delete field.renamedFrom
        } else {
          field.renamedFrom = baseline
        }
        baselineByCurrentKey.set(newKey, baseline)
        return undefined
      })
    },

    setFieldProperty(keyPath, property, value) {
      return attempt((draft) => {
        const found = locate(draft, keyPath)
        if (found === undefined) return refuse('/model/fields', `No field at "${keyPath.join('.')}".`)
        const field = found.siblings[found.index]! as unknown as Record<string, unknown>
        if (value === undefined) delete field[property]
        else field[property] = copy(value)
        return undefined
      })
    },

    addRule(rule) {
      return attempt((draft) => {
        draft.logic = draft.logic ?? { rules: [] }
        draft.logic.rules.push(copy(rule))
        return undefined
      })
    },

    updateRule(index, rule) {
      return attempt((draft) => {
        const rules = draft.logic?.rules
        if (rules === undefined || index < 0 || index >= rules.length) {
          return refuse('/logic/rules', `No rule at index ${index}.`)
        }
        rules[index] = copy(rule)
        return undefined
      })
    },

    removeRule(index) {
      return attempt((draft) => {
        const rules = draft.logic?.rules
        if (rules === undefined || index < 0 || index >= rules.length) {
          return refuse('/logic/rules', `No rule at index ${index}.`)
        }
        rules.splice(index, 1)
        return undefined
      })
    },

    validTargets(what) {
      const movingPath = Array.isArray(what) ? (what as readonly string[]) : undefined
      const probe: FieldDef =
        movingPath === undefined
          ? (what as FieldDef)
          : (locate(present, movingPath)?.siblings[locate(present, movingPath)!.index] as FieldDef)
      if (probe === undefined) return []

      const targets: Location[] = []
      for (const parent of containerPaths(present)) {
        // A container cannot be moved into itself or its own descendants.
        if (movingPath !== undefined && isPrefix(movingPath, parent)) continue

        // Legality is decided by TRYING the edit against the validator, so
        // these rules can never drift from the ones publish enforces.
        const draft = copy(present)
        if (movingPath !== undefined) {
          const found = locate(draft, movingPath)
          if (found === undefined) continue
          found.siblings.splice(found.index, 1)
        }
        const container = containerAt(draft, parent)
        if (container === undefined) continue
        container.push(movingPath === undefined ? withUniqueKey(copy(probe), draft) : copy(probe))

        if (verdictFor(draft).valid) targets.push({ parent, index: container.length - 1 })
      }
      return targets
    },
  }
}

// ---------------------------------------------------------------- navigation

interface Located {
  siblings: FieldDef[]
  index: number
}

/** The child list of the container at `keyPath` — the root list for []. */
function containerAt(document: FormSchema, keyPath: readonly string[]): FieldDef[] | undefined {
  if (keyPath.length === 0) return document.model.fields
  const found = locate(document, keyPath)
  if (found === undefined) return undefined
  const field = found.siblings[found.index]!
  if (!CONTAINER_TYPES.has(field.type)) return undefined
  field.fields = field.fields ?? []
  return field.fields
}

function locate(document: FormSchema, keyPath: readonly string[]): Located | undefined {
  if (keyPath.length === 0) return undefined
  let siblings: FieldDef[] = document.model.fields
  for (let depth = 0; depth < keyPath.length; depth++) {
    const index = siblings.findIndex((field) => field.key === keyPath[depth])
    if (index === -1) return undefined
    if (depth === keyPath.length - 1) return { siblings, index }
    const next = siblings[index]!.fields
    if (next === undefined) return undefined
    siblings = next
  }
  return undefined
}

/** Every container's key path, root first. */
function containerPaths(document: FormSchema): string[][] {
  const paths: string[][] = [[]]
  const walk = (fields: readonly FieldDef[], prefix: string[]): void => {
    for (const field of fields) {
      if (!CONTAINER_TYPES.has(field.type)) continue
      const here = [...prefix, field.key]
      paths.push(here)
      walk(field.fields ?? [], here)
    }
  }
  walk(document.model.fields, [])
  return paths
}

function isPrefix(prefix: readonly string[], candidate: readonly string[]): boolean {
  if (prefix.length > candidate.length) return false
  return prefix.every((segment, index) => candidate[index] === segment)
}

function clampIndex(index: number, length: number): number {
  if (!Number.isInteger(index) || index < 0) return 0
  return Math.min(index, length)
}

/** A palette probe must not fail purely because its placeholder key is taken —
 *  validTargets answers "may this SHAPE go here", not "is this key free". */
function withUniqueKey(def: FieldDef, document: FormSchema): FieldDef {
  const taken = new Set<string>()
  const walk = (fields: readonly FieldDef[]): void => {
    for (const field of fields) {
      taken.add(field.key)
      walk(field.fields ?? [])
    }
  }
  walk(document.model.fields)

  let candidate = def.key
  let counter = 1
  while (taken.has(candidate)) candidate = `${def.key}_${counter++}`
  return { ...def, key: candidate }
}

// ------------------------------------------------------------------ baseline

function indexBaseline(fields: readonly FieldDef[], into: Map<FieldDef, string>): void {
  for (const field of fields) {
    into.set(field, field.key)
    indexBaseline(field.fields ?? [], into)
  }
}

function seedBaselineByKey(fields: readonly FieldDef[], into: Map<string, string>): void {
  for (const field of fields) {
    // A field opened with a renamedFrom already declared keeps pointing there:
    // that is the key the collected answers actually live under.
    into.set(field.key, field.renamedFrom ?? field.key)
    seedBaselineByKey(field.fields ?? [], into)
  }
}

// --------------------------------------------------------------------- utils

function verdictFor(document: FormSchema): { valid: boolean; errors: SchemaError[] } {
  const result = validateSchema(document)
  return result.valid ? { valid: true, errors: [] } : { valid: false, errors: result.errors }
}

/** JSON round-trip: a form document is JSON by definition, and this package
 *  runs without structuredClone in its lib on purpose. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return Object.freeze(value)
}
