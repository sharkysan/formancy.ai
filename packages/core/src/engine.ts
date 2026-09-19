import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { captureCapabilities, compile, evaluate } from '@formancy/expressions'
import type {
  Capabilities,
  CapabilitySource,
  DeclaredType,
  Program,
  VariableDeclarations,
} from '@formancy/expressions'
import { buildGraph } from './graph.js'
import type { GraphNode } from './graph.js'
import { fieldIds } from './ids.js'
import type { FieldIds } from './ids.js'
import { createInteractionState } from './interaction.js'
import { formatPath, parsePath } from './path.js'
import type { Path } from './path.js'
import { createValueStore } from './store.js'
import { createWizard } from './wizard.js'
import type { Wizard } from './wizard.js'

/**
 * The engine assembly for spec version 0.
 *
 * The schema walk fixes the data shape: a `group` scopes its children into a
 * nested object, a `repeater` into rows — but a `page` scopes NOTHING. Pages
 * are presentation; if they scoped data, moving a field to another wizard step
 * would be a data migration for every existing submission.
 *
 * Logic rules are compiled ONCE, when the engine is built: parse, type-check,
 * kind policy and the computed-dependency cycle check all happen here, so a
 * form that can loop or read a ghost field never reaches a user. Evaluation
 * failures on half-filled forms, by contrast, are normal control flow and fail
 * OPEN for metadata (a broken visibility rule shows the field rather than
 * silently swallowing data) and CLOSED for validation.
 *
 * Snapshots are identity-stable: a field's snapshot object is replaced only
 * when its value, visibility, requiredness, touched state or errors actually
 * change, which is what lets useSyncExternalStore and OnPush change detection
 * work with no memoisation on the consumer's side.
 */
export interface FieldSnapshot {
  value: unknown
  required: boolean
  visible: boolean
  disabled: boolean
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
  /**
   * Where now()/today()/random() come from. Required when the schema has
   * logic rules: the engine never reads an ambient clock, because the server
   * must be able to replay a submission and get byte-identical results.
   */
  capabilities?: CapabilitySource
}

export interface FormEngine {
  /** Wire paths of every input field, in document order. */
  fieldPaths(): string[]
  /** The current submission value. */
  value(): unknown
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
  /** Present when the schema has pages; the same instance for the form's lifetime. */
  wizard(): Wizard | undefined
  /** Server verdicts render through the same path as local errors. Cleared per field on edit. */
  applyServerErrors(errors: Record<string, readonly string[]>): void
  /** First invalid field in document order — the error summary focuses it. Null when clean. */
  firstInvalid(): string | null
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

interface CompiledRule {
  rule: LogicRule
  program: Program
  targetPath: Path
}

const NO_ERRORS: readonly string[] = Object.freeze([])

export function createFormEngine(options: FormEngineOptions): FormEngine {
  const { schema } = options

  // ---------------------------------------------------------------- the walk

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

  // -------------------------------------------------- logic rule compilation

  const rules = schema.logic?.rules ?? []
  const capabilitySource = options.capabilities

  if (rules.length > 0 && capabilitySource === undefined) {
    throw new Error(
      `Schema "${schema.id}" has logic rules, so createFormEngine needs a capabilities source: ` +
        `now()/today()/random() are injected, never ambient, or the server could not replay a submission.`,
    )
  }

  /** Top-level declarations: leaves are dyn because any field can be empty
   *  while the user types; containers keep their shape. Nested reads go
   *  through the container dynamically. */
  const declarations: VariableDeclarations = Object.fromEntries(
    topLevelDataFields(schema.model.fields).map((def): [string, DeclaredType] => [
      def.key,
      def.type === 'group' ? 'map' : def.type === 'repeater' ? 'list' : 'dyn',
    ]),
  )

  const compiledRules: CompiledRule[] = rules.map((rule) => {
    if (rule.target.includes('[]')) {
      throw new Error(
        `Rule on "${rule.target}": row-scoped rules are not supported yet. Target a field outside the repeater.`,
      )
    }
    const outcome = compile(rule.cel, { kind: rule.kind, variables: declarations })
    if (!outcome.ok) {
      throw new Error(`Rule on "${rule.target}" (${rule.kind}): ${outcome.error.message}`)
    }
    return { rule, program: outcome.program, targetPath: parsePath(rule.target) }
  })

  // The cycle gate. Only computed rules WRITE, so only they can loop — and the
  // graph is known before any evaluation, so a form that can loop is rejected
  // here, cycle trace in the error, never persisted, never shipped to a user.
  {
    const mentioned = new Set<string>(Object.keys(declarations))
    const computedEdges = new Map<string, string[]>()
    for (const { rule, program } of compiledRules) {
      const tops = program.references.map(topSegment)
      for (const top of tops) mentioned.add(top)
      mentioned.add(topSegment(rule.target))
      if (rule.kind === 'computed') computedEdges.set(topSegment(rule.target), tops)
    }
    const graphNodes: GraphNode[] = [...mentioned].map((id) => ({
      id,
      dependsOn: computedEdges.get(id) ?? [],
    }))
    buildGraph(graphNodes) // throws GraphCycleError with the trace
  }

  /** Computed rules in dependency order, so one settled pass suffices. */
  const computedInOrder: CompiledRule[] = (() => {
    const computed = compiledRules.filter((entry) => entry.rule.kind === 'computed')
    const byTarget = new Map(computed.map((entry) => [topSegment(entry.rule.target), entry]))
    const sorted: CompiledRule[] = []
    const done = new Set<string>()
    const visiting = new Set<string>()
    function visit(entry: CompiledRule): void {
      const id = topSegment(entry.rule.target)
      if (done.has(id) || visiting.has(id)) return
      visiting.add(id)
      for (const reference of entry.program.references) {
        const upstream = byTarget.get(topSegment(reference))
        if (upstream) visit(upstream)
      }
      visiting.delete(id)
      done.add(id)
      sorted.push(entry)
    }
    for (const entry of computed) visit(entry)
    return sorted
  })()

  const metaRules = compiledRules.filter(
    (entry) =>
      entry.rule.kind === 'visible' || entry.rule.kind === 'required' || entry.rule.kind === 'disabled',
  )
  const validateRules = compiledRules.filter((entry) => entry.rule.kind === 'validate')

  // ------------------------------------------------------------------- state

  const store = createValueStore(options.initialValue ?? {})
  const interaction = createInteractionState()
  const errorsByWire = new Map<string, string[]>()
  const serverErrorsByWire = new Map<string, string[]>()

  /** Absence means visible, enabled, and not expression-required. */
  const hiddenWires = new Set<string>()
  const disabledWires = new Set<string>()
  const requiredWires = new Set<string>()

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

  // ------------------------------------------------------------ rule running

  let applyingRules = false

  /** One value bag per pass: every declared top-level name present, with null
   *  standing in for an empty leaf so expressions bind rather than throw. */
  function buildBag(): Record<string, unknown> {
    const root = store.root() as Record<string, unknown> | null
    const bag: Record<string, unknown> = {}
    for (const [name, type] of Object.entries(declarations)) {
      const raw = root !== null && typeof root === 'object' ? root[name] : undefined
      bag[name] = raw !== undefined ? raw : type === 'map' ? {} : type === 'list' ? [] : null
    }
    return bag
  }

  function applyRules(): void {
    if (compiledRules.length === 0 || applyingRules) return
    applyingRules = true
    try {
      const capabilities: Capabilities = captureCapabilities(capabilitySource!)
      const bag = buildBag()
      const metaChanged: string[] = []

      store.transact(() => {
        for (const entry of computedInOrder) {
          const outcome = evaluate(entry.program, bag, { capabilities })
          // A computed rule that cannot evaluate (half-filled inputs) writes
          // nothing; the previous value stands until the inputs make sense.
          if (outcome.ok) {
            store.set(entry.targetPath, outcome.value)
            bag[topSegment(entry.rule.target)] = outcome.value
          }
        }

        for (const entry of metaRules) {
          const outcome = evaluate(entry.program, bag, { capabilities })
          const wire = entry.rule.target
          if (entry.rule.kind === 'visible') {
            // Fail OPEN: a broken visibility rule shows the field. Hiding on
            // error would silently drop whatever the user typed into it.
            const visible = outcome.ok ? outcome.value === true : true
            const wasHidden = hiddenWires.has(wire)
            if (visible && wasHidden) {
              hiddenWires.delete(wire)
              metaChanged.push(wire)
            } else if (!visible && !wasHidden) {
              hiddenWires.add(wire)
              metaChanged.push(wire)
              const node = byWire.get(wire)
              if (node?.def.clearOnHide !== false) store.remove(entry.targetPath)
            }
          } else {
            const set = entry.rule.kind === 'required' ? requiredWires : disabledWires
            const active = outcome.ok && outcome.value === true
            if (active !== set.has(wire)) {
              if (active) set.add(wire)
              else set.delete(wire)
              metaChanged.push(wire)
            }
          }
        }
      })

      invalidate(metaChanged)
    } finally {
      applyingRules = false
    }
  }

  store.subscribe((written) => {
    const related = valueRelated(written)
    // A new value invalidates the server's old verdict about the old value.
    for (const wire of related) serverErrorsByWire.delete(wire)
    invalidate(related)
    applyRules()
  })
  interaction.subscribe((changed) => invalidate(changed))

  // -------------------------------------------------------------- validation

  function requiredViolated(node: FieldNode, value: unknown): boolean {
    const required = node.def.required === true || requiredWires.has(node.wire)
    if (!required) return false
    // A required checkbox is a consent gate: only an actual tick satisfies it.
    if (node.def.type === 'checkbox') return value !== true
    if (value === undefined || value === null) return true
    if (typeof value === 'string') return value.trim() === ''
    return false
  }

  function runValidation(): ValidationReport {
    const report: Record<string, string[]> = {}
    const changedWires: string[] = []
    const capabilities = capabilitySource === undefined ? undefined : captureCapabilities(capabilitySource)
    const bag = compiledRules.length > 0 ? buildBag() : undefined

    const validateByTarget = new Map<string, CompiledRule[]>()
    for (const entry of validateRules) {
      const list = validateByTarget.get(entry.rule.target)
      if (list) list.push(entry)
      else validateByTarget.set(entry.rule.target, [entry])
    }

    for (const node of activeNodes()) {
      // A hidden field is not part of the conversation: not validated,
      // required or otherwise. The server applies the same reading.
      if (hiddenWires.has(node.wire)) {
        if (errorsByWire.has(node.wire)) {
          errorsByWire.delete(node.wire)
          changedWires.push(node.wire)
        }
        continue
      }

      const codes: string[] = []
      if (requiredViolated(node, store.get(node.path))) codes.push('required')

      const checks = validateByTarget.get(node.wire)
      if (checks !== undefined && bag !== undefined && capabilities !== undefined) {
        for (const entry of checks) {
          const outcome = evaluate(entry.program, bag, { capabilities })
          // Fail CLOSED: a validate rule that cannot evaluate cannot vouch for
          // the value; the author sees the broken rule instead of bad data.
          if (!outcome.ok) codes.push(entry.rule.code ?? 'invalid')
          else if (outcome.value === false) codes.push(entry.rule.code ?? 'invalid')
          else if (typeof outcome.value === 'string' && outcome.value !== '') codes.push(outcome.value)
        }
      }

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

  // ------------------------------------------------------------------ wizard

  let wizardInstance: Wizard | undefined

  function validateOnePage(pageIndex: number): boolean {
    const pageNodes = activeNodes().filter((node) => node.page === pageIndex)
    // Pressing next must SHOW the page's problems, so the page gets touched
    // whether or not it validates; later pages stay pristine.
    interaction.touchMany(pageNodes.map((node) => node.path))
    const report = runValidation()
    return pageNodes.every((node) => !report.errors[node.wire])
  }

  function requireRepeater(path: Path): RepeaterNode {
    const repeater = repeaterByWire.get(formatPath(path))
    if (!repeater) throw new Error(`"${formatPath(path)}" is not a repeater`)
    return repeater
  }

  // The first pass: initial visibility and computed values, before anyone asks.
  applyRules()

  return {
    fieldPaths: () => activeNodes().map((node) => node.wire),
    value: () => store.root(),

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
      store.set(
        repeater.path,
        rows.filter((_, i) => i !== index),
      )
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
        required: node.def.required === true || requiredWires.has(wire),
        visible: !hiddenWires.has(wire),
        disabled: disabledWires.has(wire),
        touched: interaction.isTouched(node.path),
        errors: Object.freeze([
          ...(errorsByWire.get(wire) ?? NO_ERRORS),
          ...(serverErrorsByWire.get(wire) ?? NO_ERRORS),
        ]),
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

    wizard() {
      if (pageCount === 0) return undefined
      wizardInstance ??= createWizard({ pageCount, validatePage: validateOnePage })
      return wizardInstance
    },

    applyServerErrors(errors) {
      const changed: string[] = []
      for (const [wire, codes] of Object.entries(errors)) {
        serverErrorsByWire.set(wire, [...codes])
        changed.push(wire)
      }
      invalidate(changed)
    },

    firstInvalid() {
      for (const node of activeNodes()) {
        if (errorsByWire.has(node.wire) || serverErrorsByWire.has(node.wire)) return node.wire
      }
      return null
    },

    submit() {
      interaction.touchMany(activeNodes().map((node) => node.path))
      const report = runValidation()
      return { ok: report.valid, errors: report.errors }
    },
  }
}

/** The data fields sitting at the top level of the value: pages are
 *  transparent, everything else scopes. */
function topLevelDataFields(defs: readonly FieldDef[]): FieldDef[] {
  const out: FieldDef[] = []
  for (const def of defs) {
    if (def.type === 'page') out.push(...topLevelDataFields(def.fields ?? []))
    else out.push(def)
  }
  return out
}

function topSegment(reference: string): string {
  const dot = reference.indexOf('.')
  const bracket = reference.indexOf('[')
  const end = Math.min(dot === -1 ? reference.length : dot, bracket === -1 ? reference.length : bracket)
  return reference.slice(0, end)
}
