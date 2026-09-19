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
  rowCount(path: Path): number
  addRow(path: Path): void
  removeRow(path: Path, index: number): void
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

interface RepeaterNode {
  path: Path
  wire: string
  def: FieldDef
  page: number
}

const NO_ERRORS: readonly string[] = Object.freeze([])

export function createFormEngine(options: FormEngineOptions): FormEngine {
  const { schema } = options

  const staticNodes: FieldNode[] = []
  const repeaters: RepeaterNode[] = []
  let pageCount = 0

  function walk(defs: readonly FieldDef[], parent: Path, page: number): void {
    for (const def of defs) {
      if (def.type === 'page') {
        walk(def.fields ?? [], parent, pageCount++)
      } else if (def.type === 'group') {
        walk(def.fields ?? [], [...parent, def.key], page)
      } else if (def.type === 'repeater') {
        const path = [...parent, def.key]
        repeaters.push({ path, wire: formatPath(path), def, page })
      } else {
        const path = [...parent, def.key]
        staticNodes.push({ path, wire: formatPath(path), def, page })
      }
    }
  }
  walk(schema.model.fields, [], 0)

  const byWire = new Map(staticNodes.map((node) => [node.wire, node]))
  const repeaterByWire = new Map(repeaters.map((node) => [node.wire, node]))

  /** Template fields of one row, instantiated at that row's paths. A page
   *  inside a template cannot start a wizard step, so it scopes nothing and
   *  keeps the repeater's page; nested repeaters are rejected by
   *  validateSchema and skipped defensively here. */
  function walkTemplate(defs: readonly FieldDef[], parent: Path, page: number, out: FieldNode[]): void {
    for (const def of defs) {
      if (def.type === 'page') {
        walkTemplate(def.fields ?? [], parent, page, out)
      } else if (def.type === 'group') {
        walkTemplate(def.fields ?? [], [...parent, def.key], page, out)
      } else if (def.type !== 'repeater') {
        const path = [...parent, def.key]
        out.push({ path, wire: formatPath(path), def, page })
      }
    }
  }

  function currentRowCount(repeater: RepeaterNode): number {
    const value = store.get(repeater.path)
    return Array.isArray(value) ? value.length : 0
  }

  /** Every field that exists RIGHT NOW: static fields plus one template
   *  instantiation per existing row. */
  function activeNodes(): FieldNode[] {
    const nodes = [...staticNodes]
    for (const repeater of repeaters) {
      const count = currentRowCount(repeater)
      for (let row = 0; row < count; row++) {
        walkTemplate(repeater.def.fields ?? [], [...repeater.path, row], repeater.page, nodes)
      }
    }
    return nodes
  }

  /** Resolve any path — static or inside a repeater row — to its definition. */
  function resolveNode(path: Path): FieldNode | undefined {
    const wire = formatPath(path)
    const hit = byWire.get(wire)
    if (hit) return hit

    for (const repeater of repeaters) {
      if (path.length <= repeater.path.length + 1) continue
      if (!repeater.path.every((segment, i) => path[i] === segment)) continue
      if (typeof path[repeater.path.length] !== 'number') continue

      const def = resolveTemplate(repeater.def.fields ?? [], path.slice(repeater.path.length + 1))
      if (def) return { path, wire, def, page: repeater.page }
    }
    return undefined
  }

  function resolveTemplate(defs: readonly FieldDef[], rest: Path): FieldDef | undefined {
    const head = rest[0]
    if (head === undefined) return undefined
    for (const def of defs) {
      if (def.type === 'page') {
        const found = resolveTemplate(def.fields ?? [], rest)
        if (found) return found
      } else if (def.key === head) {
        if (def.type === 'group') return resolveTemplate(def.fields ?? [], rest.slice(1))
        return rest.length === 1 && def.type !== 'repeater' ? def : undefined
      }
    }
    return undefined
  }

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
    for (const node of activeNodes()) {
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

    for (const node of activeNodes()) {
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

  function requireRepeater(path: Path): RepeaterNode {
    const repeater = repeaterByWire.get(formatPath(path))
    if (!repeater) throw new Error(`"${formatPath(path)}" is not a repeater`)
    return repeater
  }

  return {
    fieldPaths: () => activeNodes().map((node) => node.wire),

    rowCount: (path) => currentRowCount(requireRepeater(path)),

    addRow(path) {
      const repeater = requireRepeater(path)
      const rows = store.get(repeater.path)
      store.set(repeater.path, Array.isArray(rows) ? [...rows, {}] : [{}])
    },

    removeRow(path, index) {
      const repeater = requireRepeater(path)
      const rows = store.get(repeater.path)
      if (!Array.isArray(rows) || index < 0 || index >= rows.length) {
        throw new RangeError(`Cannot remove row ${index} of "${repeater.wire}"`)
      }
      store.set(repeater.path, rows.filter((_, i) => i !== index))
    },

    pageOf(path) {
      const node = resolveNode(path)
      if (!node) throw new Error(`Unknown field "${formatPath(path)}"`)
      return node.page
    },

    getFieldSnapshot(path) {
      const wire = formatPath(path)
      const cached = snapshotCache.get(wire)
      if (cached) return cached

      const node = resolveNode(path)
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
      interaction.touchMany(activeNodes().map((node) => node.path))
      const report = runValidation()
      return { ok: report.valid, errors: report.errors }
    },
  }
}
