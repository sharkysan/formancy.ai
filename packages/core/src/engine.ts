import type { FieldDef, FormSchema } from '@formancy/spec'
import { fieldIds } from './ids.js'
import type { FieldIds } from './ids.js'
import { createInteractionState } from './interaction.js'
import { formatPath } from './path.js'
import type { Path } from './path.js'
import { createValueStore } from './store.js'

/**
 * The engine assembly for spec version 0.
 *
 * The schema walk fixes the data shape: a `group` scopes its children into a
 * nested object, a `repeater` into rows — but a `page` scopes NOTHING. Pages
 * are presentation; if they scoped data, moving a field to another wizard step
 * would be a data migration for every existing submission.
 *
 * Snapshots are identity-stable: a field's snapshot object is replaced only
 * when its value, touched state or errors actually change, which is what lets
 * useSyncExternalStore and OnPush change detection work with no memoisation on
 * the consumer's side.
 */
export interface FieldSnapshot {
  value: unknown
  required: boolean
  touched: boolean
  /** Error CODES (e.g. "required") — text belongs to the message catalog, not the engine. */
  errors: readonly string[]
  ids: FieldIds
}

export interface ValidationReport {
  valid: boolean
  errors: Record<string, string[]>
}

export interface FormEngineOptions {
  schema: FormSchema
  initialValue?: unknown
}

export interface FormEngine {
  /** Wire paths of every input field, in document order. */
  fieldPaths(): string[]
  pageOf(path: Path): number
  getFieldSnapshot(path: Path): FieldSnapshot
  setValue(path: Path, value: unknown): void
  touch(path: Path): void
  subscribeField(path: Path, listener: () => void): () => void
  validate(): ValidationReport
  submit(): { ok: boolean; errors: Record<string, string[]> }
}

interface FieldNode {
  path: Path
  wire: string
  def: FieldDef
  page: number
}

const NO_ERRORS: readonly string[] = Object.freeze([])

export function createFormEngine(options: FormEngineOptions): FormEngine {
  const { schema } = options

  const nodes: FieldNode[] = []
  let pageCount = 0

  function walk(defs: readonly FieldDef[], parent: Path, page: number): void {
    for (const def of defs) {
      if (def.type === 'page') {
        walk(def.fields ?? [], parent, pageCount++)
      } else if (def.type === 'group') {
        walk(def.fields ?? [], [...parent, def.key], page)
      } else if (def.type === 'repeater') {
        // Rows are instantiated at runtime; the template walk lands in the
        // repeater work, not here.
      } else {
        const path = [...parent, def.key]
        nodes.push({ path, wire: formatPath(path), def, page })
      }
    }
  }
  walk(schema.model.fields, [], 0)

  const byWire = new Map(nodes.map((node) => [node.wire, node]))

  const store = createValueStore(options.initialValue ?? {})
  const interaction = createInteractionState()
  const errorsByWire = new Map<string, string[]>()

  const snapshotCache = new Map<string, FieldSnapshot>()
  const fieldListeners = new Map<string, Set<() => void>>()

  function invalidate(wires: Iterable<string>): void {
    for (const wire of wires) {
      snapshotCache.delete(wire)
      const listeners = fieldListeners.get(wire)
      if (listeners) for (const listener of [...listeners]) listener()
    }
  }

  /** Wires whose VALUE may be affected by a write at `written` — the written
   *  path itself, anything under it, and anything above it. */
  function valueRelated(written: ReadonlySet<string>): string[] {
    const related: string[] = []
    for (const node of nodes) {
      for (const wire of written) {
        if (
          node.wire === wire ||
          node.wire.startsWith(`${wire}.`) ||
          node.wire.startsWith(`${wire}[`) ||
          wire.startsWith(`${node.wire}.`) ||
          wire.startsWith(`${node.wire}[`)
        ) {
          related.push(node.wire)
          break
        }
      }
    }
    return related
  }

  store.subscribe((written) => invalidate(valueRelated(written)))
  interaction.subscribe((changed) => invalidate(changed))

  function requiredViolated(def: FieldDef, value: unknown): boolean {
    if (def.required !== true) return false
    // A required checkbox is a consent gate: only an actual tick satisfies it.
    if (def.type === 'checkbox') return value !== true
    if (value === undefined || value === null) return true
    if (typeof value === 'string') return value.trim() === ''
    return false
  }

  function runValidation(): ValidationReport {
    const report: Record<string, string[]> = {}
    const changedWires: string[] = []

    for (const node of nodes) {
      const codes = requiredViolated(node.def, store.get(node.path)) ? ['required'] : []
      if (codes.length > 0) report[node.wire] = codes

      const previous = errorsByWire.get(node.wire) ?? []
      if (previous.length !== codes.length || previous.some((code, i) => code !== codes[i])) {
        if (codes.length > 0) errorsByWire.set(node.wire, codes)
        else errorsByWire.delete(node.wire)
        changedWires.push(node.wire)
      }
    }

    invalidate(changedWires)
    return { valid: Object.keys(report).length === 0, errors: report }
  }

  return {
    fieldPaths: () => nodes.map((node) => node.wire),

    pageOf(path) {
      const node = byWire.get(formatPath(path))
      if (!node) throw new Error(`Unknown field "${formatPath(path)}"`)
      return node.page
    },

    getFieldSnapshot(path) {
      const wire = formatPath(path)
      const cached = snapshotCache.get(wire)
      if (cached) return cached

      const node = byWire.get(wire)
      if (!node) throw new Error(`Unknown field "${wire}"`)

      const snapshot: FieldSnapshot = Object.freeze({
        value: store.get(node.path),
        required: node.def.required === true,
        touched: interaction.isTouched(node.path),
        errors: Object.freeze(errorsByWire.get(wire)?.slice() ?? NO_ERRORS),
        ids: fieldIds(schema.id, node.path),
      })
      snapshotCache.set(wire, snapshot)
      return snapshot
    },

    setValue: (path, value) => store.set(path, value),
    touch: (path) => interaction.touch(path),

    subscribeField(path, listener) {
      const wire = formatPath(path)
      let listeners = fieldListeners.get(wire)
      if (!listeners) fieldListeners.set(wire, (listeners = new Set()))
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    validate: runValidation,

    submit() {
      interaction.touchMany(nodes.map((node) => node.path))
      const report = runValidation()
      return { ok: report.valid, errors: report.errors }
    },
  }
}
