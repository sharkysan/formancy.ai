import type { FieldDef, FormSchema, LayoutNode, LogicRule, SpecVersion, Text } from '@formancy/spec'
import { CURRENT_SPEC_VERSION, unreferencedPaths } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import {
  childrenAt as layoutChildrenAt,
  containerPaths as layoutContainerPaths,
  encloses,
  isLayoutContainer,
  nodeAt as layoutNodeAt,
  nodesOfLayout,
} from './layout.js'
import type { LayoutAddress, LayoutLocation } from './layout.js'

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

  /**
   * Take a whole document, as ONE undoable edit.
   *
   * For a change that is not an edit to the document so much as a different
   * document — a form written from an instruction, or a paste into the
   * schema editor. It goes through the same validator every other command
   * does, so a session can never come to hold something invalid, and it lands
   * on the undo stack as a single step: Ctrl+Z after "write me a contact form"
   * puts back what was there before, which is the only behaviour anybody
   * would expect.
   */
  replaceDocument(next: FormSchema): CommandOutcome

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

  // --- the arrangement, which is a second document over the same model ---

  addLayout(name: string): CommandOutcome
  removeLayout(name: string): CommandOutcome
  insertLayoutNode(location: LayoutLocation, node: LayoutNode): CommandOutcome
  removeLayoutNode(address: LayoutAddress): CommandOutcome
  /** Replace a container with its children, in order, where it stood. */
  unwrapLayoutNode(address: LayoutAddress): CommandOutcome
  moveLayoutNode(from: LayoutAddress, to: LayoutLocation): CommandOutcome
  setLayoutNodeLabel(address: LayoutAddress, label: Text | undefined): CommandOutcome

  /**
   * Every position a layout node may legally occupy: a new node (pass it) or
   * an existing one being moved (pass its index path).
   */
  validLayoutTargets(layout: string, what: LayoutNode | readonly number[]): LayoutLocation[]

  /** Data paths the named layout does not place. Empty for an unknown layout. */
  unplacedFields(layout: string): string[]

  /**
   * Move the document to a newer spec version.
   *
   * One line of document change, undoable like any other command, and the
   * reason it is a command at all: the builder offers the newer field types
   * only to a document that allows them, so somebody who wants one has to be
   * able to say yes from inside the builder rather than by editing JSON.
   */
  upgradeSpec(to?: SpecVersion): CommandOutcome
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

    replaceDocument(next) {
      return attempt((draft) => {
        // Assigned key by key rather than returned, because `attempt` commits
        // the draft it was given and a new object would be dropped.
        const mutable = draft as unknown as Record<string, unknown>
        for (const key of Object.keys(mutable)) delete mutable[key]
        Object.assign(draft, copy(next))
        return undefined
      })
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
        // Read before the removal: afterwards the path cannot be resolved.
        const dataPath = dataPathOf(draft, keyPath)
        found.siblings.splice(found.index, 1)
        // A layout node placing a field that no longer exists is invalid, so
        // without this the command is simply refused and a form author cannot
        // delete a field at all once it has been arranged. Pruning it here is
        // not a convenience: an arrangement is a view of the model, and it
        // cannot outlive what it is a view of.
        if (dataPath !== undefined) unplaceEverywhere(draft, dataPath)
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

        const before = dataPathOf(draft, keyPath)
        field.key = newKey
        if (newKey === baseline) {
          // Back where it started: there is nothing to migrate, and leaving a
          // renamedFrom pointing at the current key is itself invalid.
          delete field.renamedFrom
        } else {
          field.renamedFrom = baseline
        }
        // Every arrangement follows the rename. A layout addresses fields by
        // data path, so leaving them behind would make the document invalid
        // and the rename impossible — for exactly the fields most likely to
        // need one, the ones somebody has already arranged.
        const after = dataPathOf(draft, [...keyPath.slice(0, -1), newKey])
        if (before !== undefined && after !== undefined) repathEverywhere(draft, before, after)
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

    // ------------------------------------------------------------- layouts

    addLayout(name) {
      return attempt((draft) => {
        draft.layouts = draft.layouts ?? []
        draft.layouts.push({ name, nodes: [] })
        return undefined
      })
    },

    removeLayout(name) {
      return attempt((draft) => {
        const at = draft.layouts?.findIndex((layout) => layout.name === name) ?? -1
        if (at === -1 || draft.layouts === undefined) {
          return refuse('/layouts', `No layout called "${name}".`)
        }
        draft.layouts.splice(at, 1)
        // An empty list and no list at all mean the same thing to a renderer,
        // and only one of them survives a round trip unchanged.
        if (draft.layouts.length === 0) delete draft.layouts
        return undefined
      })
    },

    insertLayoutNode(location, node) {
      return attempt((draft) => {
        const container = layoutChildrenAt(draft, location.layout, location.parent)
        if (container === undefined) return noSuchContainer(location)
        container.splice(clampIndex(location.index, container.length), 0, copy(node))
        return undefined
      })
    },

    removeLayoutNode(address) {
      return attempt((draft) => {
        const found = locateLayout(draft, address)
        if (found === undefined) return noSuchNode(address)
        found.siblings.splice(found.index, 1)
        return undefined
      })
    },

    unwrapLayoutNode(address) {
      return attempt((draft) => {
        const found = locateLayout(draft, address)
        if (found === undefined) return noSuchNode(address)
        const node = found.siblings[found.index]!
        if (!isLayoutContainer(node)) {
          return refuse(
            layoutPointer(address),
            'A field node places one field. There is nothing inside it to keep.',
          )
        }
        found.siblings.splice(found.index, 1, ...node.children)
        return undefined
      })
    },

    moveLayoutNode(from, to) {
      // A field has one place per arrangement, so moving it across layouts
      // would silently unplace it where it came from — a deletion wearing the
      // word "move". Two commands, deliberately, so the second is deliberate.
      if (from.layout !== to.layout) {
        return refuse(
          layoutPointer(from),
          `Cannot move between the "${from.layout}" and "${to.layout}" layouts. Remove it from one and place it in the other.`,
        )
      }
      if (encloses(from.path, to.parent)) {
        return refuse(
          layoutPointer(from),
          'Cannot move this inside itself or one of its own children.',
        )
      }

      return attempt((draft) => {
        const found = locateLayout(draft, from)
        if (found === undefined) return noSuchNode(from)
        const [moved] = found.siblings.splice(found.index, 1)
        // `to.parent` addresses the container as the CALLER sees it, before
        // anything is lifted — so it is corrected here, once, in the one place
        // that knows the lift has happened. `to.index`, by contrast, already
        // counts positions after the lift, the same convention moveField uses.
        // Splitting it this way is what lets the self-containment check above
        // compare two paths in the same frame of reference.
        const container = layoutChildrenAt(draft, to.layout, shiftAfterLift(to.parent, from.path))
        if (container === undefined) return noSuchContainer(to)
        container.splice(clampIndex(to.index, container.length), 0, moved!)
        return undefined
      })
    },

    setLayoutNodeLabel(address, label) {
      return attempt((draft) => {
        const found = locateLayout(draft, address)
        if (found === undefined) return noSuchNode(address)
        const node = found.siblings[found.index]!
        if (!isLayoutContainer(node)) {
          return refuse(layoutPointer(address), 'A field node takes its name from the field it places.')
        }
        if (label === undefined) delete node.label
        else node.label = copy(label)
        return undefined
      })
    },

    validLayoutTargets(layout, what) {
      const movingPath = Array.isArray(what) ? (what as readonly number[]) : undefined
      const probe =
        movingPath === undefined ? (what as LayoutNode) : layoutNodeAt(present, layout, movingPath)
      if (probe === undefined) return []
      if (nodesOfLayout(present, layout) === undefined) return []

      const targets: LayoutLocation[] = []
      for (const parent of layoutContainerPaths(present, layout)) {
        // Nothing may be moved into itself or its own descendants.
        if (movingPath !== undefined && encloses(movingPath, parent)) continue

        // Legality is decided by TRYING the edit against the validator, the
        // same way field moves are, so these rules cannot drift from the ones
        // publish enforces — a field already placed elsewhere is refused here
        // because the validator refuses it there.
        const draft = copy(present)
        if (movingPath !== undefined) {
          const found = locateLayout(draft, { layout, path: movingPath })
          if (found === undefined) continue
          found.siblings.splice(found.index, 1)
        }
        // `parent` is the container as the caller sees it. Finding it in the
        // lifted draft needs the correction; handing it back does not, because
        // a Location addresses the document the caller is looking at.
        const container = layoutChildrenAt(draft, layout, shiftAfterLift(parent, movingPath))
        if (container === undefined) continue
        container.push(copy(probe))
        if (!verdictFor(draft).valid) continue
        container.pop()

        // Every position, not just the end: offering only the end makes the
        // keyboard path weaker than a drag, which is what SC 2.5.7 forbids.
        for (let index = 0; index <= container.length; index += 1) {
          // Within the container it came from, the slot it already occupies is
          // not a move. After the lift, that is the index it was lifted from.
          if (
            movingPath !== undefined &&
            sameLayoutPath(parent, movingPath.slice(0, -1)) &&
            index === movingPath[movingPath.length - 1]
          ) {
            continue
          }
          targets.push({ layout, parent, index })
        }
      }
      return targets
    },

    unplacedFields(layout) {
      return unreferencedPaths(present, layout) ?? []
    },

    upgradeSpec(to = CURRENT_SPEC_VERSION) {
      return attempt((draft) => {
        if (draft.specVersion > to) {
          return refuse(
            '/specVersion',
            `This form is written against spec ${draft.specVersion} and cannot go back to ${to}: whatever the newer version added has nowhere to go, so it would be data loss rather than a change.`,
          )
        }
        draft.specVersion = to
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

        // Legality is tested once per container, at the end, and then every
        // position in that container is offered. Nothing the validator checks
        // depends on where among its siblings a field sits — duplicate keys,
        // nesting depth and rule targets are all position-blind — so testing
        // each index separately would run the validator n times to learn the
        // same thing.
        //
        // Offering only the last position would be cheaper still, and was what
        // this did first. It also made the keyboard path weaker than a drag:
        // you could move a field to the end of a group but never between two
        // of its fields, which is not the equivalent function WCAG 2.2 SC
        // 2.5.7 asks for.
        if (!verdictFor(draft).valid) continue
        for (let index = 0; index < container.length; index += 1) {
          targets.push({ parent, index })
        }
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

// ----------------------------------------------- keeping layouts in step

/**
 * The data path of a field, which is not its key path.
 *
 * A page contributes no segment — a layout arranges what a person sees, and
 * `page1.email` is not what the engine calls that answer. Undefined when the
 * key path reaches nothing, or passes through something that holds no fields.
 */
function dataPathOf(document: FormSchema, keyPath: readonly string[]): string | undefined {
  const segments: string[] = []
  let fields: readonly FieldDef[] = document.model.fields

  for (const [depth, key] of keyPath.entries()) {
    const field = fields.find((candidate) => candidate.key === key)
    if (field === undefined) return undefined
    if (field.type !== 'page') segments.push(key)
    if (depth === keyPath.length - 1) return segments.join('.')
    fields = field.fields ?? []
  }
  return undefined
}

/** Whether `path` is `prefix` itself or a field inside it. */
function underPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`)
}

/** Drop every layout node placing `dataPath`, or anything inside it. */
function unplaceEverywhere(draft: FormSchema, dataPath: string): void {
  for (const layout of draft.layouts ?? []) {
    layout.nodes = pruned(layout.nodes, dataPath)
  }
}

function pruned(nodes: readonly LayoutNode[], dataPath: string): LayoutNode[] {
  const kept: LayoutNode[] = []
  for (const node of nodes) {
    if (node.kind === 'field') {
      if (!underPath(node.path, dataPath)) kept.push(node)
      continue
    }
    // The container stays even when it empties. Removing one field should not
    // silently take a row with it and rearrange everything beside it.
    kept.push({ ...node, children: pruned(node.children, dataPath) })
  }
  return kept
}

/** Point every layout node at the new path, including fields inside a group. */
function repathEverywhere(draft: FormSchema, before: string, after: string): void {
  const walk = (nodes: LayoutNode[]): void => {
    for (const [index, node] of nodes.entries()) {
      if (node.kind === 'field') {
        if (underPath(node.path, before)) {
          nodes[index] = { ...node, path: after + node.path.slice(before.length) }
        }
        continue
      }
      walk(node.children)
    }
  }
  for (const layout of draft.layouts ?? []) walk(layout.nodes)
}

// ----------------------------------------------------------- layout helpers

interface LocatedNode {
  siblings: LayoutNode[]
  index: number
}

function locateLayout(document: FormSchema, address: LayoutAddress): LocatedNode | undefined {
  if (address.path.length === 0) return undefined
  const siblings = layoutChildrenAt(document, address.layout, address.path.slice(0, -1))
  if (siblings === undefined) return undefined
  const index = address.path[address.path.length - 1]!
  if (index < 0 || index >= siblings.length) return undefined
  return { siblings, index }
}

function layoutPointer(address: LayoutAddress): string {
  return `/layouts/${address.layout}/nodes/${address.path.join('/')}`
}

function noSuchNode(address: LayoutAddress): Refusal {
  return {
    ok: false,
    path: layoutPointer(address),
    message: `Nothing at that position in the "${address.layout}" layout.`,
  }
}

function noSuchContainer(location: LayoutLocation): Refusal {
  return {
    ok: false,
    path: `/layouts/${location.layout}/nodes/${location.parent.join('/')}`,
    message:
      location.parent.length === 0
        ? `No layout called "${location.layout}".`
        : `Nothing at that position in the "${location.layout}" layout holds other nodes.`,
  }
}

/**
 * A container path, re-read after a node has been lifted out.
 *
 * Both paths index the document as it stood. If the lifted node shared a
 * container with an ancestor of this path and sat before it, that ancestor has
 * shifted up one — and walking the unshifted path now arrives at a different
 * node entirely, which is the silent kind of wrong.
 */
function shiftAfterLift(
  parent: readonly number[],
  lifted: readonly number[] | undefined,
): number[] {
  if (lifted === undefined) return [...parent]
  const depth = lifted.length - 1
  if (parent.length <= depth) return [...parent]
  // Only when the lift happened in an ancestor's own container.
  for (let at = 0; at < depth; at += 1) if (parent[at] !== lifted[at]) return [...parent]

  const shifted = [...parent]
  if (shifted[depth]! > lifted[depth]!) shifted[depth] = shifted[depth]! - 1
  return shifted
}

function sameLayoutPath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, at) => b[at] === step)
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
