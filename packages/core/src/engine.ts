import type { FieldDef, FormSchema, LogicRule, Text } from '@formancy/spec'
import { resolveText } from '@formancy/spec'
import { captureCapabilities, compile, evaluate } from '@formancy/expressions'
import type {
  Capabilities,
  CapabilitySource,
  DeclaredType,
  ExpressionKind,
  Program,
  VariableDeclarations,
} from '@formancy/expressions'
import { buildGraph } from './graph.js'
import type { GraphNode } from './graph.js'
import { fieldIds } from './ids.js'
import type { Check } from './checks.js'
import type { BuiltInErrorCode, ValidationReport } from './error-codes.js'
import type { FieldSnapshot } from './snapshot.js'
import { createInteractionState } from './interaction.js'
import { modelViolations, storedShapeViolations } from './model-validators.js'
import { unanswered } from './answered.js'
import { formatPath, parsePath, templateWire, topSegment, withinAny } from './path.js'
import { buildFieldProps } from './props.js'
import type { Path } from './path.js'
import { createValueStore } from './store.js'
import { computedTargets, isTarget, staticTargets, withoutValuesAt } from './computed-targets.js'
import { computedWriter } from './computed-value.js'
import { filled, refusedDefault, reopened } from './defaults.js'
import { getAt, setAt } from './value.js'
import { refusedRule } from './rule-refusal.js'
import { ruleMessages } from './rule-messages.js'
import { optionOrders } from './option-order.js'
import { createRows, repeaterViolations } from './rows.js'
import type { RepeaterNode } from './rows.js'
import { bagType, topLevelDataFields } from './top-level-fields.js'
import { createWizard } from './wizard.js'
import type { Wizard } from './wizard.js'

export interface FormEngineOptions {
  schema: FormSchema
  /**
   * The namespace for this engine's element ids. Defaults to `schema.id`.
   *
   * For rendering one schema twice on one page, which is otherwise not
   * expressible: two engines over one schema mint identical ids, and a
   * duplicate id breaks `<label for>` and `aria-describedby` silently — the
   * second form's controls lose their accessible names altogether
   * ([0095](../../../docs/decisions/0095-one-schema-two-renderers.md)).
   */
  formId?: string
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
  /**
   * Validators the deployment answers, by the name a `check` rule gives.
   *
   * The same shape `optionsSource` uses and for the same reasons: the document
   * names a check, the deployment says how to answer it, and nothing in this
   * package fetches anything. A check that is declared and not supplied fails the
   * field closed rather than passing it.
   */
  checks?: Record<string, Check>
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
  /**
   * The wizard pages in order, each saying whether the answers walk past it.
   *
   * `skipped` rather than a filtered list: `page()` is an absolute index, so a
   * list with holes in it and an index that counts them differently is two
   * numbers that disagree about the same page.
   */
  pages(): ReadonlyArray<{ key: string; def: FieldDef; skipped: boolean }>
  /** The current submission value. */
  value(): unknown
  rowCount(path: Path): number
  /**
   * Add an empty row. Past the repeater's `maxItems` it throws, as a row index that is not
   * a row does, rather than storing a row the document forbids (0184).
   */
  addRow(path: Path): void
  /** Whether `addRow` would add one: what a renderer asks before offering the button. */
  canAddRow(path: Path): boolean
  /** Remove a row. Below the repeater's `minItems` it throws, as `addRow` does past its maximum. */
  removeRow(path: Path, index: number): void
  /** Whether `removeRow` would remove one, which is the same answer for every row. */
  canRemoveRow(path: Path): boolean
  /**
   * Move a row from one position to another, taking its state with it.
   *
   * Reordering is a VALUE change, so it notifies like any other and anything derived
   * from `items[0]` recomputes. Moving a row to where it already is changes nothing and
   * says nothing — a cancelled drag should not re-render every row of every subscriber.
   *
   * An index that is not a row throws, as `removeRow` does. A silent clamp would move a
   * row somewhere the caller did not ask for, and a drag ending off the end of the list
   * is exactly how that gets called.
   */
  moveRow(path: Path, from: number, to: number): void
  /**
   * The stable identity of a row, which is NOT its position — removing a row
   * renumbers everything after it. Renderers key on this so that focus and
   * animation follow the row a person was working in.
   */
  rowId(path: Path, index: number): string
  pageOf(path: Path): number
  /** A field's state — or a repeater's, whose errors are its bounds' and its rules' (0184). */
  getFieldSnapshot(path: Path): FieldSnapshot
  /** Not on a field a computed rule writes, whose value is the rule's (`readOnly`, 0181). */
  setValue(path: Path, value: unknown): void
  touch(path: Path): void
  subscribeField(path: Path, listener: () => void): () => void
  /** Hears every change: values, metadata, touch state and validation results. */
  subscribe(listener: () => void): () => void
  /** Errors a user should currently SEE — touched and invalid — in document
   *  order. Identity-stable until something changes, for useSyncExternalStore. */
  visibleErrors(): ReadonlyArray<{ path: string; codes: readonly string[] }>
  /**
   * Resolves when no check is in flight.
   *
   * A host awaits this before submitting. Without it a form can be sent while a
   * verdict is still coming, and "it was valid when I pressed the button" is not
   * something the server will agree with.
   */
  settle(): Promise<void>
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
  /**
   * The locale this engine resolves text in, which is fixed for its lifetime.
   *
   * Exposed because a renderer asking a deployment's own source for options has to
   * say which language to answer in, and the schema's `i18n.defaultLocale` is the
   * wrong answer whenever a host passed a `locale` of its own. It was computed here
   * and never handed out.
   */
  locale(): string
}

interface FieldNode {
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


/*
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
 *
 * A block comment rather than JSDoc, with one line of that below for the declaration a host
 * reads in an editor.
 */
/** An engine over a validated document: its answers, its rules compiled once, and a snapshot per field. */
export function createFormEngine(options: FormEngineOptions): FormEngine {
  const { schema } = options

  // Validated now, not when a field is first rendered and the argument is gone.
  const elementNamespace = options.formId ?? schema.id
  fieldIds(elementNamespace, [])

  // ---------------------------------------------------------------- the walk

  const staticNodes: FieldNode[] = []
  const repeaters: RepeaterNode[] = []
  const pageDefs: Array<{ key: string; def: FieldDef }> = []
  /** Groups by wire, for what a rule hiding one does to the answers in it. */
  const groupDefs = new Map<string, FieldDef>()
  let pageCount = 0

  function walk(defs: readonly FieldDef[], parent: Path, page: number): void {
    for (const def of defs) {
      if (def.type === 'page') {
        pageDefs.push({ key: def.key, def })
        walk(def.fields ?? [], parent, pageCount++)
      } else if (def.type === 'group') {
        groupDefs.set(formatPath([...parent, def.key]), def)
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

  /** Every field that exists RIGHT NOW: static fields plus one template
   *  instantiation per existing row — and, for what is validated, touched and listed
   *  as an error, each repeater itself just before its rows, since it has bounds,
   *  requiredness and rules of its own (0184). */
  function activeNodes(withRepeaters = false): FieldNode[] {
    const nodes = [...staticNodes]
    for (const repeater of repeaters) {
      if (withRepeaters) nodes.push(repeater)
      const count = rows.count(repeater)
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

  const allRules = schema.logic?.rules ?? []
  /**
   * The rules that ARE an expression.
   *
   * A `check` is not one: it names a validator the deployment answers, so there is
   * nothing to compile, nothing to derive a dependency from, and nothing for the
   * graph to recompute. Separating them here rather than skipping them at each use
   * is what keeps the compile step from having to ask, and what made the type
   * checker point at every place that had assumed a rule has an expression.
   */
  const rules = allRules.filter(
    // A predicate rather than a plain filter, so the compile step below reads
    // `rule.cel` as a string and `rule.kind` as an expression kind without a cast.
    // The schema guarantees both: a rule that is not a check requires `cel`.
    //
    // A `skip` leaves too, and for a different reason from a check: it HAS an
    // expression, and its target is a page's key rather than a data path, so
    // every walk here that resolves a target would resolve it to nothing.
    (rule): rule is LogicRule & { cel: string; kind: ExpressionKind } =>
      rule.kind !== 'check' && rule.kind !== 'skip' && rule.cel !== undefined,
  )
  const checkRules = allRules.filter((rule) => rule.kind === 'check')
  const skipRules = allRules.filter((rule) => rule.kind === 'skip')
  const capabilitySource = options.capabilities
  const checks = options.checks

  // Fixed for the engine's lifetime: a snapshot's identity is supposed to change
  // only when that field's state changes, and a locale that could move under it
  // would make every cached snapshot silently wrong. Switching language means
  // building a new engine.
  const locale = options.locale ?? schema.i18n?.defaultLocale ?? ''
  // What each field's rules say for their codes, in that language, by the rules' own target (0198).
  const messagesOf = ruleMessages(allRules, (text) => resolveText(schema, text, locale))
  const orders = optionOrders(schema.model, capabilitySource)

  if (rules.length > 0 && capabilitySource === undefined) {
    throw new Error(
      `Schema "${schema.id}" has logic rules, so createFormEngine needs a capabilities source: ` +
        `now()/today()/random() are injected, never ambient, or the server could not replay a submission.`,
    )
  }

  const topLevel = topLevelDataFields(schema.model.fields)
  const declarations: VariableDeclarations = Object.fromEntries(topLevel.map((def) => [def.key, bagType(def)]))

  if (rules.some((rule) => rule.target.includes('[]'))) {
    for (const reserved of Object.keys(ROW_VARIABLES)) {
      if (reserved in declarations) {
        throw new Error(
          `A top-level field is named "${reserved}", which row-scoped rules reserve for the current row. Rename the field.`,
        )
      }
    }
  }

  /** For saying what to write instead when a rule is refused. */
  const fieldsByKey = new Map(topLevel.map((def) => [def.key, def]))

  const compiledRules: CompiledRule[] = rules.map((rule) => {
    const marker = rule.target.indexOf('[]')

    if (marker === -1) {
      const outcome = compile(rule.cel, { kind: rule.kind, variables: declarations })
      if (!outcome.ok) throw new Error(refusedRule(rule, outcome.error, fieldsByKey))
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
    if (!outcome.ok) throw new Error(refusedRule(rule, outcome.error, fieldsByKey))
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
  // The side a rule must be marked for in order NOT to run here.
  const otherSide = mode === 'client' ? 'server' : 'client'
  const validateRules = compiledRules.filter(
    (entry) => entry.rule.kind === 'validate' && (entry.rule.runsOn ?? 'both') !== otherSide,
  )
  const validateByTemplateWire = new Map<string, CompiledRule[]>()
  for (const entry of validateRules) {
    const key = entry.row ? entry.row.templateWire : entry.rule.target
    const list = validateByTemplateWire.get(key)
    if (list) list.push(entry)
    else validateByTemplateWire.set(key, [entry])
  }

  // ------------------------------------------------------------------- state

  /** The fields only a computed rule writes: nothing handed in stands in for them (0181). */
  const computed = computedTargets(allRules)
  /** Those, and the fields that collect nothing: nothing handed in or set lands on either. */
  const unwritable = new Set([...computed, ...staticTargets(schema.model)])
  const refusal = refusedDefault(schema.model, computed)
  if (refusal !== undefined) throw new Error(refusal)
  // A new form starts with the document's defaults; anything handed in, as it was handed (0197).
  const store = createValueStore(withoutValuesAt(options.initialValue ?? filled(schema.model.fields, {}), unwritable))
  const interaction = createInteractionState()
  const rows = createRows(store, interaction)
  const errorsByWire = new Map<string, string[]>()
  const serverErrorsByWire = new Map<string, string[]>()

  /** Absence means visible, enabled, and not expression-required. Row-scoped
   *  entries use instance wires (`items[0].discount`). */
  const hiddenWires = new Set<string>()
  const disabledWires = new Set<string>()
  const requiredWires = new Set<string>()
  // Inherited: what a rule hides or disables, it hides or disables whole — a group with
  // the fields in it, a repeater with its rows (0184).
  const hiddenAt = (path: Path): boolean => withinAny(hiddenWires, path)
  const disabledAt = (path: Path): boolean => withinAny(disabledWires, path)

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

  /** One value bag per pass: every declared top-level name present, read as the root's own
   *  (0185), with null standing in for an empty leaf so expressions bind rather than throw. */
  function buildBag(): Record<string, unknown> {
    const root = store.root()
    const bag: Record<string, unknown> = {}
    for (const [name, type] of Object.entries(declarations)) {
      const raw = getAt(root, [name])
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

  /** A computed result as its field stores it, or `undefined` when it does not fit (0189). */
  const storable = computedWriter(schema.model)

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
        if (index >= rows.count(repeater)) {
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
    let seeded = false
    try {
      const capabilities: Capabilities = captureCapabilities(capabilitySource!)
      const bag = buildBag()
      const metaChanged: string[] = []
      const shown: string[] = []

      store.transact(() => {
        for (const entry of computedInOrder) {
          if (entry.row === undefined) {
            const outcome = evaluate(entry.program, bag, { capabilities })
            // A computed rule that cannot evaluate (half-filled inputs) writes
            // nothing; the previous value stands until the inputs make sense.
            const stored = outcome.ok ? storable(entry.rule.target, outcome.value) : undefined
            if (stored !== undefined) {
              store.set(entry.targetPath, stored.value)
              bag[topSegment(entry.rule.target)] = stored.value
            }
            continue
          }

          const { repeater } = entry.row
          rows.of(repeater).forEach((row, index) => {
            const outcome = evaluate(entry.program, rowBag(bag, repeater, row, index), { capabilities })
            const stored = outcome.ok ? storable(entry.rule.target, outcome.value) : undefined
            if (stored !== undefined) store.set(instancePath(entry, index), stored.value)
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
            if (visible === wasHidden) {
              // A group's and a repeater's own `clearOnHide` too, which a lookup that knew
              // only leaf fields never read: their answers were cleared whatever it said.
              const def = resolveNode(path)?.def ?? repeaterByWire.get(wire)?.def ?? groupDefs.get(wire)
              metaChanged.push(wire)
              if (visible) {
                hiddenWires.delete(wire)
                shown.push(wire)
                seeded = reopened(store, def, path) || seeded
              } else {
                hiddenWires.add(wire)
                if (def?.clearOnHide !== false) store.remove(path)
              }
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
          rows.of(entry.row.repeater).forEach((row, index) => {
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

        // A repeater shown again opens as it opened the first time, with its minimum —
        // not with the rows its hiding cleared and an error for rows nobody removed (0023).
        for (const repeater of repeaters) {
          const under = shown.some((wire) => repeater.wire === wire || repeater.wire.startsWith(`${wire}.`))
          if (under && !hiddenAt(repeater.path)) seeded = rows.topUp(repeater) || seeded
        }

        metaChanged.push(...pruneStaleInstances())
      })

      invalidate(withContents(metaChanged))
    } finally {
      applyingRules = false
    }
    // The rows just seeded are rows like any other, and their own rules run now.
    if (seeded) applyRules()
  }

  /** A container's change is its contents' too: hiding a group hides every field in it. */
  function withContents(wires: readonly string[]): Set<string> {
    return new Set(wires.length === 0 ? [] : [...wires, ...valueRelated(new Set(wires))])
  }

  // ----------------------------------------------------------------- skipping

  /**
   * Pages the answers walk past.
   *
   * A `skip` rule is an expression like `visible`, and it is compiled as one:
   * same policy, same boolean result, same refusal of anything that could reach
   * outside the document. What differs is its TARGET — a page's key rather than a
   * data path, because a page is transparent for data and has no path at all.
   *
   * The consequence that matters is not the stepper. It is that the fields on a
   * skipped page are hidden, and therefore not validated: a required answer on a
   * page somebody never saw is a form that cannot be submitted and will not say
   * why ([0087](../../../docs/decisions/0087-a-page-can-be-walked-past.md)).
   */
  const compiledSkips = skipRules.map((rule) => {
    // `visible` rather than a policy of its own: the question is the same shape,
    // the result is the same boolean, and giving it a second policy would be a
    // second list of allowed functions for somebody to forget to keep level.
    const outcome = compile(rule.cel ?? '', { kind: 'visible', variables: declarations })
    if (!outcome.ok) throw new Error(refusedRule(rule, outcome.error, fieldsByKey))
    const index = pageDefs.findIndex((page) => page.key === rule.target)
    return { rule, program: outcome.program, index }
  })

  const skippedPages = new Set<number>()

  /** Recomputed whenever anything the expressions read changes. */
  function applySkips(): string[] {
    if (compiledSkips.length === 0) return []
    const capabilities: Capabilities = captureCapabilities(capabilitySource!)
    const bag = buildBag()
    const changed: string[] = []

    for (const entry of compiledSkips) {
      if (entry.index === -1) continue
      const outcome = evaluate(entry.program, bag, { capabilities })
      // A rule that cannot evaluate does NOT skip. Failing open here is the one
      // place it is right: a page hidden by a broken expression takes its
      // questions away silently, while a page shown in error is visible and
      // answerable ([0054] on what a rule that never works costs).
      const skip = outcome.ok && outcome.value === true
      const was = skippedPages.has(entry.index)
      if (skip === was) continue
      if (skip) skippedPages.add(entry.index)
      else skippedPages.delete(entry.index)

      // Every field on the page: hidden follows the page, and hidden is what
      // keeps the answers out of validation and out of the submission.
      for (const node of staticNodes) {
        if (node.page !== entry.index) continue
        if (skip) hiddenWires.add(node.wire)
        else hiddenWires.delete(node.wire)
        changed.push(node.wire)
      }
      for (const repeater of repeaters) {
        if (repeater.page !== entry.index) continue
        if (skip) hiddenWires.add(repeater.wire)
        else hiddenWires.delete(repeater.wire)
        changed.push(repeater.wire)
      }
    }
    return changed
  }

  // ------------------------------------------------------------------ checks

  /**
   * Validators the deployment answers, and the three ways this goes wrong.
   *
   * **A stale answer wins.** Somebody types an address, the check goes out, they
   * correct it, and the first answer lands second and marks the corrected address
   * taken. Every call carries a generation, and a verdict whose generation is not
   * the current one is dropped. Debouncing narrows that window; only a token
   * closes it.
   *
   * **Submit outruns the verdict.** `settle()` resolves when nothing is in
   * flight, so a host can await it before submitting rather than sending a form
   * whose verdict was not in.
   *
   * **The field says nothing while it waits.** `checking` is on the snapshot, so a
   * control can say so rather than looking finished.
   *
   * A check that cannot be answered — no checker supplied, or one that throws —
   * fails the field CLOSED, like every other thing here that cannot get an
   * answer: an accepted bogus value is undetectable afterwards and a refusal is
   * retryable.
   */
  const checkErrorsByWire = new Map<string, string[]>()
  const checkingWires = new Set<string>()
  const checkGeneration = new Map<string, number>()
  let inFlight = 0
  let idle: (() => void) | undefined
  let idleWaiters: Array<() => void> = []

  /** The check rules that apply on this side. */
  const activeChecks = checkRules.filter((rule) => {
    const runsOn = rule.runsOn ?? 'server'
    return runsOn === 'both' || runsOn === mode
  })

  const checksByTarget = new Map<string, typeof activeChecks>()
  for (const rule of activeChecks) {
    const held = checksByTarget.get(rule.target) ?? []
    held.push(rule)
    checksByTarget.set(rule.target, held)
  }

  function settleWaiters(): void {
    if (inFlight > 0) return
    const waiting = idleWaiters
    idleWaiters = []
    for (const resolve of waiting) resolve()
    idle?.()
  }

  function runChecksFor(wire: string): void {
    const rules = checksByTarget.get(wire)
    if (rules === undefined || rules.length === 0) return

    const node = resolveNode(parsePath(wire))
    if (!node) return
    const value = store.get(node.path)

    // Emptiness is `required`'s question, not a check's, and asking a deployment
    // whether nothing is taken is asking it nothing.
    const empty = value === undefined || value === null || value === ''
    const generation = (checkGeneration.get(wire) ?? 0) + 1
    checkGeneration.set(wire, generation)

    if (empty) {
      checkErrorsByWire.delete(wire)
      checkingWires.delete(wire)
      invalidate([wire])
      return
    }

    checkingWires.add(wire)
    checkErrorsByWire.delete(wire)
    invalidate([wire])

    for (const rule of rules) {
      const checker = checks !== undefined && Object.hasOwn(checks, rule.check ?? '') ? checks[rule.check ?? ''] : undefined
      inFlight += 1
      const settled = (codes: string[] | undefined): void => {
        inFlight -= 1
        // The generation is the whole mechanism: a verdict about a value nobody
        // holds any more is not a verdict about this field.
        if (checkGeneration.get(wire) === generation) {
          if (codes !== undefined && codes.length > 0) {
            checkErrorsByWire.set(wire, [...(checkErrorsByWire.get(wire) ?? []), ...codes])
          }
          if (inFlight === 0) checkingWires.delete(wire)
          invalidate([wire])
        }
        settleWaiters()
      }

      if (checker === undefined) {
        // Named and absent from the deployment's own checks, `toString` among them (0185): the
        // document asks for one this deployment has not supplied, and fails closed as `optionsSource` does.
        settled(['check_unavailable' satisfies BuiltInErrorCode])
        continue
      }

      // Called synchronously, not off a microtask. Deferring it delays the moment
      // the deployment learns there is a question, which for a debounced checker
      // is the moment its own timer starts — and it made `checking` true before
      // anything had actually been asked.
      let answer: Promise<string | undefined> | string | undefined
      try {
        answer = checker({ check: rule.check ?? '', path: wire, value, data: store.root() })
      } catch {
        settled(['check_unavailable' satisfies BuiltInErrorCode])
        continue
      }
      void Promise.resolve(answer)
        .then((verdict) => {
          settled(verdict === undefined ? undefined : [verdict])
        })
        .catch(() => {
          settled(['check_unavailable' satisfies BuiltInErrorCode])
        })
    }
  }

  store.subscribe((written) => {
    const related = valueRelated(written)
    // A new value invalidates the server's old verdict about the old value.
    for (const wire of related) serverErrorsByWire.delete(wire)
    invalidate(related)
    // And it invalidates every check about it, which is what the generation
    // inside `runChecksFor` enforces for answers already in flight.
    for (const wire of related) runChecksFor(wire)
    // Which pages are live can change with any answer, and the fields on a page
    // that has just been walked past have to stop being validated in the same
    // turn — not on the next one, when somebody has already pressed Submit.
    const pagesChanged = applySkips()
    if (pagesChanged.length > 0) {
      invalidate(withContents(pagesChanged))
      wizardInstance?.refresh()
    }
    applyRules()
    if (validatedOnce && !applyingRules) runValidation()
  })
  interaction.subscribe((changed) => invalidate(changed))

  // -------------------------------------------------------------- validation

  /** What the model says about one answer, or about a repeater's rows as a whole. */
  function modelCodes(node: FieldNode, value: unknown): string[] {
    const required = node.def.required === true || requiredWires.has(node.wire)
    if (node.def.type === 'repeater') return repeaterViolations(node.def, value, required)
    const codes: string[] = required && unanswered(node.def, value) ? ['required' satisfies BuiltInErrorCode] : []
    return [...codes, ...modelViolations(node.def, value)]
  }

  function runValidation(): ValidationReport {
    validatedOnce = true
    const report: Record<string, string[]> = Object.fromEntries(storedShapeViolations(schema.model.fields, store.root(), hiddenAt))
    const changedWires: string[] = []
    const capabilities = capabilitySource === undefined ? undefined : captureCapabilities(capabilitySource)
    const bag = compiledRules.length > 0 ? buildBag() : undefined

    for (const node of activeNodes(true)) {
      // A hidden field is not part of the conversation: not validated,
      // required or otherwise — nor is anything inside a hidden group or a
      // hidden repeater. The server applies the same reading.
      if (hiddenAt(node.path)) {
        if (errorsByWire.has(node.wire)) {
          errorsByWire.delete(node.wire)
          changedWires.push(node.wire)
        }
        continue
      }

      const value = store.get(node.path)
      const codes = modelCodes(node, value)

      // A rule aimed at the repeater itself reads the form's bag, as a field's does.
      const checks = validateByTemplateWire.get(templateWire(node.wire))
      if (checks !== undefined && bag !== undefined && capabilities !== undefined) {
        const repeater = repeaterOf(node.path)
        const evaluationBag =
          repeater === undefined
            ? bag
            : rowBag(
                bag,
                repeater,
                rows.of(repeater)[node.path[repeater.path.length] as number],
                node.path[repeater.path.length] as number,
              )
        for (const entry of checks) {
          const outcome = evaluate(entry.program, evaluationBag, { capabilities })
          // Fail CLOSED: a validate rule that cannot evaluate cannot vouch for
          // the value; the author sees the broken rule instead of bad data.
          if (!outcome.ok) codes.push(entry.rule.code ?? ('invalid' satisfies BuiltInErrorCode))
          else if (outcome.value === false) codes.push(entry.rule.code ?? ('invalid' satisfies BuiltInErrorCode))
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
    const pageNodes = activeNodes(true).filter((node) => node.page === pageIndex)
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
    rows.adopt(repeater)
    rows.topUp(repeater)
  }

  // The first pass: initial visibility and computed values, before anyone asks.
  applyRules()
  // Which pages are live, before anybody has typed: a form that opens on a page
  // the answers already walk past would open on an empty step.
  applySkips()

  return {
    schema: () => schema,
    fieldPaths: () => activeNodes().map((node) => node.wire),
    repeaterPaths: () => repeaters.map((node) => node.wire),
    repeaters: () => repeaters.map((node) => ({ wire: node.wire, def: node.def })),
    pages: () =>
      // The `skipped` flag rather than a filtered list: the stepper needs to
      // leave a page out AND `page()` is an absolute index, so a filtered list
      // would put the two out of step with each other.
      pageDefs.map((page, index) => ({ ...page, skipped: skippedPages.has(index) })),
    value: () => store.root(),

    rowCount: (path) => rows.count(requireRepeater(path)),
    addRow: (path) => rows.add(requireRepeater(path)),
    canAddRow: (path) => rows.canAdd(requireRepeater(path)),
    rowId: (path, index) => rows.id(requireRepeater(path), index),
    removeRow: (path, index) => rows.remove(requireRepeater(path), index),
    canRemoveRow: (path) => rows.canRemove(requireRepeater(path)),
    moveRow: (path, from, to) => rows.move(requireRepeater(path), from, to),

    pageOf(path) {
      const node = resolveNode(path) ?? repeaterByWire.get(formatPath(path))
      if (!node) throw new Error(`Unknown field "${formatPath(path)}"`)
      return node.page
    },

    getFieldSnapshot(path) {
      const wire = formatPath(path)
      const cached = snapshotCache.get(wire)
      if (cached) return cached

      // A repeater answers too: its bounds and its rules give it errors of its own (0184).
      const node = resolveNode(path) ?? repeaterByWire.get(wire)
      if (!node) throw new Error(`Unknown field "${wire}"`)

      const required = node.def.required === true || requiredWires.has(wire)
      const disabled = disabledAt(node.path)
      const touched = interaction.isTouched(node.path)
      const errors = Object.freeze([
        ...(errorsByWire.get(wire) ?? NO_ERRORS),
        ...(serverErrorsByWire.get(wire) ?? NO_ERRORS),
        ...(checkErrorsByWire.get(wire) ?? NO_ERRORS),
      ])
      const ids = fieldIds(elementNamespace, node.path)
      const snapshot: FieldSnapshot = Object.freeze({
        checking: checkingWires.has(wire),
        value: store.get(node.path),
        type: node.def.type,
        label: resolveText(schema, node.def.label, locale),
        description: resolveText(schema, node.def.description, locale),
        messages: messagesOf(templateWire(wire)),
        optionOrder: orders.get(templateWire(wire)),
        def: node.def,
        required,
        visible: !hiddenAt(node.path),
        disabled,
        readOnly: isTarget(computed, wire),
        touched,
        errors,
        ids,
        props: buildFieldProps({
          wire,
          ids,
          required,
          disabled,
          touched,
          errors,
          def: node.def,
          checking: checkingWires.has(wire),
        }),
      })
      snapshotCache.set(wire, snapshot)
      return snapshot
    },

    setValue: (path, value) => {
      if (!isTarget(unwritable, formatPath(path))) store.set(path, value)
    },
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
      for (const node of activeNodes(true)) {
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

    settle() {
      // Resolves immediately when nothing is in flight, so a host may await it
      // unconditionally rather than asking whether this form has checks at all.
      if (inFlight === 0) return Promise.resolve()
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve)
      })
    },
    validate: runValidation,

    wizard() {
      if (pageCount === 0) return undefined
      wizardInstance ??= createWizard({
        pageCount,
        validatePage: validateOnePage,
        // Absolute page indices throughout: a skipped page is walked past rather
        // than removed, so `page()` still means the same thing it always did and
        // `pageOf(field)` still compares against it.
        isLive: (index) => !skippedPages.has(index),
      })
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
      for (const node of activeNodes(true)) {
        if (errorsByWire.has(node.wire) || serverErrorsByWire.has(node.wire)) return node.wire
      }
      return null
    },

    locale() {
      return locale
    },

    text(value) {
      return resolveText(schema, value, locale)
    },

    submit() {
      interaction.touchMany(activeNodes(true).map((node) => node.path))
      const report = runValidation()
      return { ok: report.valid, errors: report.errors }
    },
  }
}
