import type { FieldDef, FieldType, FormSchema, LogicRule, Text } from '@formancy/spec'
import { ROW_ID, ROW_ID_PREFIX, resolveText } from '@formancy/spec'
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
import { modelViolations } from './model-validators.js'
import { formatPath, parsePath } from './path.js'
import { buildFieldProps } from './props.js'
import type { FieldProps } from './props.js'
import type { Path } from './path.js'
import { createValueStore } from './store.js'
import { getAt, setAt } from './value.js'
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
 * A rule targeting `items[].total` is row-scoped: it runs once per row, with
 * two extra variables in scope — `item`, the row, and `index`, its position.
 *
 * Snapshots are identity-stable: a field's snapshot object is replaced only
 * when its value, visibility, requiredness, touched state or errors actually
 * change, which is what lets useSyncExternalStore and OnPush change detection
 * work with no memoisation on the consumer's side.
 */
export interface FieldSnapshot {
  value: unknown
  /** The model field type, so component registries can dispatch on it. */
  type: FieldType
  required: boolean
  visible: boolean
  disabled: boolean
  touched: boolean
  /** Error CODES (e.g. "required") — text belongs to the message catalog, not the engine. */
  errors: readonly string[]
  /**
   * The label already resolved to a string in the engine's locale.
   *
   * `def.label` may be a reference into the message catalogue, and resolving it
   * in the engine rather than in each renderer is what keeps React and Angular
   * from disagreeing about what a field is called — the same reasoning that put
   * ids and ARIA wiring here.
   *
   * Always present, undefined when the field declares no label at all — a
   * renderer then falls back to something of its own.
   */
  label: string | undefined
  /** The model definition, verbatim — renderers read options and extras from it. */
  def: FieldDef
  ids: FieldIds
  /** Ready-to-spread ARIA wiring; see props.ts for the rules it encodes. */
  props: FieldProps
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
  /**
   * Which message catalogue to read. Defaults to the schema's own default
   * locale; an unknown locale falls back to it rather than showing message ids.
   */
  locale?: string
  /**
   * Which side this engine is. Decides which `runsOn` validation rules apply;
   * everything else behaves identically, because a replay that behaved
   * differently would not be a check.
   *
   * Defaults to `client`, since that is where a form is filled in.
   */
  mode?: 'client' | 'server'
}

export interface FormEngine {
  /**
   * The document this engine was built from, frozen.
   *
   * Renderers need it for the parts of the spec that are presentation rather
   * than state: which `layouts` exist, and which locale the catalogues default
   * to. Exposing it is cheaper and more honest than mirroring those onto the
   * engine one at a time — but it is read-only, and nothing about the form's
   * behaviour should be recomputed from it rather than asked of the engine.
   */
  schema(): FormSchema
  /** Wire paths of every input field, in document order. */
  fieldPaths(): string[]
  /** Wire paths of every repeater, so renderers can give rows their own chrome. */
  repeaterPaths(): string[]
  /** Each repeater with its definition — add/remove labels ride on it. */
  repeaters(): ReadonlyArray<{ wire: string; def: FieldDef }>
  /** The wizard pages in order, with their definitions. Empty when unpaged. */
  pages(): ReadonlyArray<{ key: string; def: FieldDef }>
  /** The current submission value. */
  value(): unknown
  rowCount(path: Path): number
  addRow(path: Path): void
  removeRow(path: Path, index: number): void
  /**
   * The stable identity of a row, which is NOT its position — removing a row
   * renumbers everything after it. Renderers key on this so that focus and
   * animation follow the row a person was working in.
   */
  rowId(path: Path, index: number): string
  pageOf(path: Path): number
  getFieldSnapshot(path: Path): FieldSnapshot
  setValue(path: Path, value: unknown): void
  touch(path: Path): void
  subscribeField(path: Path, listener: () => void): () => void
  /** Hears every change: values, metadata, touch state and validation results. */
  subscribe(listener: () => void): () => void
  /** Errors a user should currently SEE — touched and invalid — in document
   *  order. Identity-stable until something changes, for useSyncExternalStore. */
  visibleErrors(): ReadonlyArray<{ path: string; codes: readonly string[] }>
  validate(): ValidationReport
  submit(): { ok: boolean; errors: Record<string, string[]> }
  /** Present when the schema has pages; the same instance for the form's lifetime. */
  wizard(): Wizard | undefined
  /** Server verdicts render through the same path as local errors. Cleared per field on edit. */
  applyServerErrors(errors: Record<string, readonly string[]>): void
  /** First invalid field in document order — the error summary focuses it. Null when clean. */
  firstInvalid(): string | null
  /**
   * Resolve any other piece of schema text — option labels, repeater buttons,
   * page titles — in the same locale the snapshots used.
   */
  text(value: Text | undefined): string | undefined
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
  /** Top-level rules: the target path. Row rules: unused (built per row). */
  targetPath: Path
  /** Present when the target is row-scoped (`items[].total`). */
  row?: { repeater: RepeaterNode; memberPath: Path; templateWire: string }
}

const NO_ERRORS: readonly string[] = Object.freeze([])

/** Variables every row-scoped rule sees on top of the form's fields. */
const ROW_VARIABLES: Record<string, DeclaredType> = { item: 'map', index: 'int' }

/** The side a rule must be marked for in order NOT to run here. */
function otherSide(mode: 'client' | 'server'): 'client' | 'server' {
  return mode === 'client' ? 'server' : 'client'
}

export function createFormEngine(options: FormEngineOptions): FormEngine {
  const { schema } = options

  // ---------------------------------------------------------------- the walk

  const staticNodes: FieldNode[] = []
  const repeaters: RepeaterNode[] = []
  const pageDefs: Array<{ key: string; def: FieldDef }> = []
  let pageCount = 0

  function walk(defs: readonly FieldDef[], parent: Path, page: number): void {
    for (const def of defs) {
      if (def.type === 'page') {
        pageDefs.push({ key: def.key, def })
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

  /** A row is an object unless something wrote the array by hand. */
  function isRowObject(row: unknown): row is Record<string, unknown> {
    return typeof row === 'object' && row !== null && !Array.isArray(row)
  }

  function currentRowCount(repeater: RepeaterNode): number {
    const value = store.get(repeater.path)
    return Array.isArray(value) ? value.length : 0
  }

  function currentRows(repeater: RepeaterNode): readonly unknown[] {
    const value = store.get(repeater.path)
    return Array.isArray(value) ? value : []
  }

  /**
   * One counter per repeater, monotonic for the engine's lifetime. It is never
   * decremented on removal, so a deleted row's id is never reissued — a new row
   * wearing a dead row's id would be indistinguishable from it in any export or
   * audit trail that recorded the first.
   *
   * A counter rather than a random id because the engine has no ambient
   * randomness to draw on (see docs/decisions/0019-injected-capabilities.md),
   * and uniqueness is only ever needed within one repeater of one submission.
   */
  const rowIdCounters = new Map<string, number>()

  function mintRowId(repeater: RepeaterNode): string {
    const next = (rowIdCounters.get(repeater.wire) ?? 0) + 1
    rowIdCounters.set(repeater.wire, next)
    return `${ROW_ID_PREFIX}${String(next)}`
  }

  /**
   * Give every row an id, keeping any that arrived with the data.
   *
   * Data written before rows had identity is not stranded: it is adopted on
   * load. An id that IS present is kept, because a draft, a log or an export
   * may already refer to it — and the counter is advanced past it so the next
   * row cannot collide with what is already there.
   */
  function adoptRowIds(repeater: RepeaterNode): void {
    const rows = currentRows(repeater)
    if (rows.length === 0) return

    let highest = rowIdCounters.get(repeater.wire) ?? 0
    for (const row of rows) {
      const existing = isRowObject(row) ? row[ROW_ID] : undefined
      if (typeof existing !== 'string') continue
      const suffix = existing.startsWith(ROW_ID_PREFIX)
        ? Number.parseInt(existing.slice(ROW_ID_PREFIX.length), 10)
        : Number.NaN
      if (Number.isInteger(suffix) && suffix > highest) highest = suffix
    }
    rowIdCounters.set(repeater.wire, highest)

    const adopted = rows.map((row) => {
      const base = isRowObject(row) ? row : {}
      if (typeof base[ROW_ID] === 'string') return row
      return { ...base, [ROW_ID]: mintRowId(repeater) }
    })
    if (adopted.some((row, index) => row !== rows[index])) store.set(repeater.path, adopted)
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

  /** The repeater an instance path lives in, if any. */
  function repeaterOf(path: Path): RepeaterNode | undefined {
    for (const repeater of repeaters) {
      if (path.length <= repeater.path.length) continue
      if (typeof path[repeater.path.length] !== 'number') continue
      if (repeater.path.every((segment, i) => path[i] === segment)) return repeater
    }
    return undefined
  }

  // -------------------------------------------------- logic rule compilation

  const rules = schema.logic?.rules ?? []
  const capabilitySource = options.capabilities

  // Fixed for the engine's lifetime: a snapshot's identity is supposed to change
  // only when that field's state changes, and a locale that could move under it
  // would make every cached snapshot silently wrong. Switching language means
  // building a new engine.
  const locale = options.locale ?? schema.i18n?.defaultLocale ?? ''

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

  if (rules.some((rule) => rule.target.includes('[]'))) {
    for (const reserved of Object.keys(ROW_VARIABLES)) {
      if (reserved in declarations) {
        throw new Error(
          `A top-level field is named "${reserved}", which row-scoped rules reserve for the current row. Rename the field.`,
        )
      }
    }
  }

  const compiledRules: CompiledRule[] = rules.map((rule) => {
    const marker = rule.target.indexOf('[]')

    if (marker === -1) {
      const outcome = compile(rule.cel, { kind: rule.kind, variables: declarations })
      if (!outcome.ok) {
        throw new Error(`Rule on "${rule.target}" (${rule.kind}): ${outcome.error.message}`)
      }
      return { rule, program: outcome.program, targetPath: parsePath(rule.target) }
    }

    const repeater = repeaterByWire.get(rule.target.slice(0, marker))
    if (!repeater) {
      throw new Error(`Rule on "${rule.target}": "${rule.target.slice(0, marker)}" is not a repeater.`)
    }
    const memberWire = rule.target.slice(marker + '[].'.length)
    const outcome = compile(rule.cel, {
      kind: rule.kind,
      variables: { ...declarations, ...ROW_VARIABLES },
    })
    if (!outcome.ok) {
      throw new Error(`Rule on "${rule.target}" (${rule.kind}): ${outcome.error.message}`)
    }
    return {
      rule,
      program: outcome.program,
      targetPath: parsePath(memberWire),
      row: { repeater, memberPath: parsePath(memberWire), templateWire: rule.target },
    }
  })

  /** The graph node a computed rule writes. Row rules keep their `[]` form:
   *  one node stands for the member across all rows, which is sound because
   *  every row runs the same rule. */
  function ruleNodeId(entry: CompiledRule): string {
    return entry.row ? entry.rule.target : topSegment(entry.rule.target)
  }

  /** The graph nodes a reference reads, from inside a given rule. */
  function referenceNodeIds(entry: CompiledRule, reference: string): string[] {
    if (entry.row) {
      if (reference === 'index') return []
      if (reference === 'item' || reference.startsWith('item.') || reference.startsWith('item[')) {
        // A row-relative read: `item.qty` inside `items[]` reads `items[].qty`.
        const member = reference === 'item' ? '' : reference.slice('item.'.length)
        return member === ''
          ? // Reading the whole row conservatively depends on every computed
            // member of the same repeater.
            compiledRules
              .filter((other) => other.rule.kind === 'computed' && other.row?.repeater === entry.row!.repeater)
              .map(ruleNodeId)
          : [`${entry.row.repeater.wire}[].${member}`]
      }
    }
    return [topSegment(reference)]
  }

  // The cycle gate. Only computed rules WRITE, so only they can loop — and the
  // graph is known before any evaluation, so a form that can loop is rejected
  // here, cycle trace in the error, never persisted, never shipped to a user.
  // An aggregate ordering edge makes each repeater depend on its row-computed
  // members: whoever reads `items` reads the rows AFTER they are computed.
  const computedOrderIndex = (() => {
    const mentioned = new Set<string>(Object.keys(declarations))
    const edges = new Map<string, Set<string>>()
    const edge = (from: string, to: string): void => {
      mentioned.add(from)
      mentioned.add(to)
      let set = edges.get(from)
      if (!set) edges.set(from, (set = new Set()))
      set.add(to)
    }

    for (const entry of compiledRules) {
      const id = ruleNodeId(entry)
      mentioned.add(id)
      const reads = entry.program.references.flatMap((reference) => referenceNodeIds(entry, reference))
      if (entry.rule.kind === 'computed') {
        for (const read of reads) edge(id, read)
        if (entry.row) edge(entry.row.repeater.wire, id)
      } else {
        for (const read of reads) mentioned.add(read)
      }
    }

    const graphNodes: GraphNode[] = [...mentioned].map((id) => ({
      id,
      dependsOn: [...(edges.get(id) ?? [])],
    }))
    const graph = buildGraph(graphNodes) // throws GraphCycleError with the trace
    return new Map(graph.order.map((id, position) => [id, position]))
  })()

  /** Computed rules in dependency order, so one settled pass suffices. */
  const computedInOrder: CompiledRule[] = compiledRules
    .filter((entry) => entry.rule.kind === 'computed')
    .sort((a, b) => (computedOrderIndex.get(ruleNodeId(a)) ?? 0) - (computedOrderIndex.get(ruleNodeId(b)) ?? 0))

  const metaRules = compiledRules.filter(
    (entry) =>
      entry.rule.kind === 'visible' || entry.rule.kind === 'required' || entry.rule.kind === 'disabled',
  )
  // A rule that does not run on this side is dropped at compile time rather
  // than skipped at evaluation time, so it costs nothing per keystroke.
  const mode = options.mode ?? 'client'
  const validateRules = compiledRules.filter(
    (entry) => entry.rule.kind === 'validate' && (entry.rule.runsOn ?? 'both') !== otherSide(mode),
  )
  const validateByTemplateWire = new Map<string, CompiledRule[]>()
  for (const entry of validateRules) {
    const key = entry.row ? entry.row.templateWire : entry.rule.target
    const list = validateByTemplateWire.get(key)
    if (list) list.push(entry)
    else validateByTemplateWire.set(key, [entry])
  }

  // ------------------------------------------------------------------- state

  const store = createValueStore(options.initialValue ?? {})
  const interaction = createInteractionState()
  const errorsByWire = new Map<string, string[]>()
  const serverErrorsByWire = new Map<string, string[]>()

  /** Absence means visible, enabled, and not expression-required. Row-scoped
   *  entries use instance wires (`items[0].discount`). */
  const hiddenWires = new Set<string>()
  const disabledWires = new Set<string>()
  const requiredWires = new Set<string>()

  const snapshotCache = new Map<string, FieldSnapshot>()
  const fieldListeners = new Map<string, Set<() => void>>()
  const engineListeners = new Set<() => void>()

  /** Bumped on every invalidation; caches key off it. */
  let stateVersion = 0

  function invalidate(wires: Iterable<string>): void {
    let any = false
    for (const wire of wires) {
      any = true
      snapshotCache.delete(wire)
      const listeners = fieldListeners.get(wire)
      if (listeners) for (const listener of [...listeners]) listener()
    }
    if (any) {
      stateVersion++
      for (const listener of [...engineListeners]) listener()
    }
  }

  /** Wires whose VALUE may be affected by a write at `written` — the written
   *  path itself, anything under it, and anything above it. */
  function valueRelated(written: ReadonlySet<string>): string[] {
    const related: string[] = []
    // Repeater wires are subscribable in their own right (a row list is what a
    // repeater UI renders), so they participate in relatedness like any field.
    const observable: Array<{ wire: string }> = [...activeNodes(), ...repeaters]
    for (const node of observable) {
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
  /** Errors track edits LIVE only after the first validation: a pristine form
   *  must not shout while the user types their first answer, but a corrected
   *  field must not keep wearing yesterday's error either. */
  let validatedOnce = false

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

  /** A row bag follows the same convention as the top-level bag: every leaf
   *  the template declares is PRESENT, with null standing in for the answer a
   *  person has not typed yet — CEL errors on a missing map key, and a
   *  fail-closed validate rule must not misfire on an untouched field. */
  function rowBag(
    bag: Record<string, unknown>,
    repeater: RepeaterNode,
    row: unknown,
    index: number,
  ): Record<string, unknown> {
    const members: FieldNode[] = []
    walkTemplate(repeater.def.fields ?? [], [], repeater.page, members)
    let item: unknown = row !== null && typeof row === 'object' ? row : {}
    for (const member of members) {
      if (getAt(item, member.path) === undefined) item = setAt(item, member.path, null)
    }
    return { ...bag, item, index }
  }

  /** Instance wire for one row of a row-scoped rule. */
  function instanceWire(entry: CompiledRule, index: number): string {
    return `${entry.row!.repeater.wire}[${index}].${formatPath(entry.row!.memberPath)}`
  }

  function instancePath(entry: CompiledRule, index: number): Path {
    return [...entry.row!.repeater.path, index, ...entry.row!.memberPath]
  }

  /** Drop per-instance metadata for rows that no longer exist, so a removed
   *  row's hidden/required state cannot leak onto a future row. */
  function pruneStaleInstances(): string[] {
    const dropped: string[] = []
    for (const set of [hiddenWires, disabledWires, requiredWires]) {
      for (const wire of [...set]) {
        const bracket = wire.indexOf('[')
        if (bracket === -1) continue
        const repeater = repeaterByWire.get(wire.slice(0, bracket))
        if (!repeater) continue
        const index = Number(wire.slice(bracket + 1, wire.indexOf(']', bracket)))
        if (index >= currentRowCount(repeater)) {
          set.delete(wire)
          dropped.push(wire)
        }
      }
    }
    return dropped
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
          if (entry.row === undefined) {
            const outcome = evaluate(entry.program, bag, { capabilities })
            // A computed rule that cannot evaluate (half-filled inputs) writes
            // nothing; the previous value stands until the inputs make sense.
            if (outcome.ok) {
              store.set(entry.targetPath, outcome.value)
              bag[topSegment(entry.rule.target)] = outcome.value
            }
            continue
          }

          const { repeater } = entry.row
          currentRows(repeater).forEach((row, index) => {
            const outcome = evaluate(entry.program, rowBag(bag, repeater, row, index), { capabilities })
            if (outcome.ok) store.set(instancePath(entry, index), outcome.value)
          })
          // Aggregates downstream must see the rows as just written.
          bag[topSegment(repeater.wire)] = store.get(repeater.path) ?? []
        }

        const applyMeta = (entry: CompiledRule, wire: string, path: Path, ok: boolean, value: unknown): void => {
          if (entry.rule.kind === 'visible') {
            // Fail OPEN: a broken visibility rule shows the field. Hiding on
            // error would silently drop whatever the user typed into it.
            const visible = ok ? value === true : true
            const wasHidden = hiddenWires.has(wire)
            if (visible && wasHidden) {
              hiddenWires.delete(wire)
              metaChanged.push(wire)
            } else if (!visible && !wasHidden) {
              hiddenWires.add(wire)
              metaChanged.push(wire)
              if (resolveNode(path)?.def.clearOnHide !== false) store.remove(path)
            }
          } else {
            const set = entry.rule.kind === 'required' ? requiredWires : disabledWires
            const active = ok && value === true
            if (active !== set.has(wire)) {
              if (active) set.add(wire)
              else set.delete(wire)
              metaChanged.push(wire)
            }
          }
        }

        for (const entry of metaRules) {
          if (entry.row === undefined) {
            const outcome = evaluate(entry.program, bag, { capabilities })
            applyMeta(
              entry,
              entry.rule.target,
              entry.targetPath,
              outcome.ok,
              outcome.ok ? outcome.value : undefined,
            )
            continue
          }
          currentRows(entry.row.repeater).forEach((row, index) => {
            const outcome = evaluate(entry.program, rowBag(bag, entry.row!.repeater, row, index), { capabilities })
            applyMeta(
              entry,
              instanceWire(entry, index),
              instancePath(entry, index),
              outcome.ok,
              outcome.ok ? outcome.value : undefined,
            )
          })
        }

        metaChanged.push(...pruneStaleInstances())
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
    if (validatedOnce && !applyingRules) runValidation()
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
    // A required list answer needs something in it. An empty array is how a
    // selectboxes field with nothing ticked and a file field with nothing
    // attached both arrive, and `[]` is not an answer.
    if (Array.isArray(value)) return value.length === 0
    return false
  }

  /** The template form of an instance wire: `items[1].qty` -> `items[].qty`.
   *  Static wires come back unchanged. */
  function templateWireOf(wire: string): string {
    return wire.replace(/\[\d+\]/, '[]')
  }

  function runValidation(): ValidationReport {
    validatedOnce = true
    const report: Record<string, string[]> = {}
    const changedWires: string[] = []
    const capabilities = capabilitySource === undefined ? undefined : captureCapabilities(capabilitySource)
    const bag = compiledRules.length > 0 ? buildBag() : undefined

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

      const value = store.get(node.path)
      const codes: string[] = []
      if (requiredViolated(node, value)) codes.push('required')
      codes.push(...modelViolations(node.def, value))

      const checks = validateByTemplateWire.get(templateWireOf(node.wire))
      if (checks !== undefined && bag !== undefined && capabilities !== undefined) {
        const repeater = repeaterOf(node.path)
        const evaluationBag =
          repeater === undefined
            ? bag
            : rowBag(
                bag,
                repeater,
                currentRows(repeater)[node.path[repeater.path.length] as number],
                node.path[repeater.path.length] as number,
              )
        for (const entry of checks) {
          const outcome = evaluate(entry.program, evaluationBag, { capabilities })
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

  let visibleErrorsCache: ReadonlyArray<{ path: string; codes: readonly string[] }> | undefined
  let visibleErrorsCacheVersion = -1

  // minItems is a MODEL property, so the engine honours it rather than each
  // renderer seeding rows in a mount effect — which is both duplicated work
  // and, under React StrictMode's double-invoked effects, a source of extra
  // rows nobody asked for.
  for (const repeater of repeaters) {
    // Adopt first: a seeded row must not be handed an id that rows already in
    // the data are using.
    adoptRowIds(repeater)

    const minimum = repeater.def.minItems ?? 0
    if (currentRowCount(repeater) >= minimum) continue
    const rows = [...currentRows(repeater)]
    while (rows.length < minimum) rows.push({ [ROW_ID]: mintRowId(repeater) })
    store.set(repeater.path, rows)
  }

  // The first pass: initial visibility and computed values, before anyone asks.
  applyRules()

  return {
    schema: () => schema,
    fieldPaths: () => activeNodes().map((node) => node.wire),
    repeaterPaths: () => repeaters.map((node) => node.wire),
    repeaters: () => repeaters.map((node) => ({ wire: node.wire, def: node.def })),
    pages: () => pageDefs,
    value: () => store.root(),

    rowCount: (path) => currentRowCount(requireRepeater(path)),

    addRow(path) {
      const repeater = requireRepeater(path)
      store.set(repeater.path, [...currentRows(repeater), { [ROW_ID]: mintRowId(repeater) }])
    },

    rowId(path, index) {
      const repeater = requireRepeater(path)
      const row = currentRows(repeater)[index]
      if (row === undefined) {
        throw new RangeError(`No row ${String(index)} in "${repeater.wire}"`)
      }
      const id = isRowObject(row) ? row[ROW_ID] : undefined
      if (typeof id !== 'string') {
        // adoptRowIds runs for every repeater at construction and addRow mints
        // one, so a row without an id means something wrote the array directly.
        throw new Error(`Row ${String(index)} of "${repeater.wire}" has no ${ROW_ID}`)
      }
      return id
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
      const node = resolveNode(path) ?? repeaterByWire.get(formatPath(path))
      if (!node) throw new Error(`Unknown field "${formatPath(path)}"`)
      return node.page
    },

    getFieldSnapshot(path) {
      const wire = formatPath(path)
      const cached = snapshotCache.get(wire)
      if (cached) return cached

      const node = resolveNode(path)
      if (!node) throw new Error(`Unknown field "${wire}"`)

      const required = node.def.required === true || requiredWires.has(wire)
      const disabled = disabledWires.has(wire)
      const touched = interaction.isTouched(node.path)
      const errors = Object.freeze([
        ...(errorsByWire.get(wire) ?? NO_ERRORS),
        ...(serverErrorsByWire.get(wire) ?? NO_ERRORS),
      ])
      const ids = fieldIds(schema.id, node.path)
      const snapshot: FieldSnapshot = Object.freeze({
        value: store.get(node.path),
        type: node.def.type,
        label: resolveText(schema, node.def.label, locale),
        def: node.def,
        required,
        visible: !hiddenWires.has(wire),
        disabled,
        touched,
        errors,
        ids,
        props: buildFieldProps({ wire, ids, required, disabled, touched, errors }),
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

    subscribe(listener) {
      engineListeners.add(listener)
      return () => engineListeners.delete(listener)
    },

    visibleErrors() {
      if (visibleErrorsCache !== undefined && visibleErrorsCacheVersion === stateVersion) {
        return visibleErrorsCache
      }
      const list: Array<{ path: string; codes: readonly string[] }> = []
      for (const node of activeNodes()) {
        if (!interaction.isTouched(node.path)) continue
        const codes = [
          ...(errorsByWire.get(node.wire) ?? NO_ERRORS),
          ...(serverErrorsByWire.get(node.wire) ?? NO_ERRORS),
        ]
        if (codes.length > 0) list.push(Object.freeze({ path: node.wire, codes: Object.freeze(codes) }))
      }
      visibleErrorsCache = Object.freeze(list)
      visibleErrorsCacheVersion = stateVersion
      return visibleErrorsCache
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

    text(value) {
      return resolveText(schema, value, locale)
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
