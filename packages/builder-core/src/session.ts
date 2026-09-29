import type { FieldDef, FormSchema, LayoutNode, LogicRule, SpecVersion, Text } from '@formancy/spec'
import {
  CURRENT_SPEC_VERSION,
  unreferencedPaths,
  LAYOUT_LEAF_KINDS,
  layoutChildren,
  PAGE_TARGETED_RULE_KINDS,
} from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import {
  childrenAt as layoutChildrenAt,
  containerPaths as layoutContainerPaths,
  encloses,
  isLayoutContainer,
  nodeAt as layoutNodeAt,
  nodesOfLayout,
  samePath,
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

/**
 * A catalogue as it leaves the builder, and as it comes back.
 *
 * The source travels with the target, and that is the whole design. A file of
 * ids and blanks tells a translator nothing — `country.option.CH` is the schema's
 * name for a thing rather than the thing — and a vendor's translation memory
 * matches on source text, so a file without it cannot be leveraged at all.
 *
 * Plain JSON rather than XLIFF. XLIFF is what a vendor asks for and it is a
 * format with a specification, a namespace and versions; shipping half of one
 * would be worse than shipping none, and this shape converts to it in a script
 * somebody can write in an afternoon.
 */
export interface CatalogueFile {
  locale: string
  defaultLocale: string
  messages: Array<{ id: string; source: string; target: string }>
}

/** What an import did, and what a reviewer has to look at. */
export interface ImportReport {
  /** How many targets were written. */
  written: number
  /** Ids the form does not have any more: exported before a field was deleted. */
  unknown: string[]
  /** Ids whose source has changed since the export — translated from older words. */
  stale: string[]
}

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

  /**
   * Add a wizard step, and make the form a wizard if it is not one yet.
   *
   * The first page **takes the fields already at the top level**, because the
   * engine gives a top-level field that is not inside a page to page one
   * wherever it sits: in `bare1, page one, bare2, page two` the engine reports
   * pages 0, 0, 0, 1 — `bare2` is drawn between the pages and belongs to the
   * first. A builder tree cannot show that honestly, so the shape is refused
   * rather than drawn wrongly, and "add a page" to an unpaged form means "make
   * this form a wizard": what somebody already built becomes page one.
   *
   * Its own command rather than a palette entry, which is why the palette
   * leaves `page` out: a page may sit only at the top level, and a palette that
   * can target any container would offer a choice refused most of the time.
   *
   * One undoable step either way — including the absorbing case, which moves
   * every top-level field and adds a container.
   */
  addPage(label?: Text): CommandOutcome

  insertField(location: Location, def: FieldDef): CommandOutcome
  removeField(keyPath: readonly string[]): CommandOutcome
  /**
   * Replace a container with its children, in order, where it stood.
   *
   * The inverse of `addPage`, and the reason [0081] named it as missing:
   * `removeField` removes a container WITH everything inside it, so an author
   * who made a wizard by mistake had to delete every question and type them
   * again. The arrangement tree has had `unwrapLayoutNode` since layouts
   * existed; the model tree had no equivalent, and that asymmetry was the gap.
   *
   * One undoable step, and three refusals:
   *
   * - **A leaf.** "Unwrap" pressed on a text field is somebody who meant
   *   delete, and doing it anyway removes an answer on a word that does not say
   *   remove.
   * - **A repeater.** Its children describe ONE row and its answer is a list of
   *   those, so lifting them out turns every row into one answer each and loses
   *   every row after the first — silently, because the document that comes out
   *   is perfectly valid.
   * - **A group a rule addresses or reads inside.** A group carries the answer,
   *   so unwrapping one renames every path beneath it. Layouts follow; a rule's
   *   condition is CEL text and this cannot rewrite it without pattern-matching
   *   source, so the rule is named and the edit refused.
   *
   * A page needs none of that renaming: it is transparent for data, so nothing
   * beneath it moves. It needs two other things instead.
   *
   * Its `skip` rule goes with it, because a `skip` names a page key and can only
   * ever have been about this page. Measured: without that the validator refused
   * the whole edit, which made every page somebody had routed around impossible
   * to take away.
   *
   * And its children do NOT stay at the top level while other pages remain.
   * Hazard D8: the engine gives a top-level field that is not inside a page to
   * step ONE wherever it sits, so a question left beside page three is asked on
   * page one — collected correctly and in the wrong place, which
   * [0081](../../../docs/decisions/0081-a-page-absorbs-the-form-it-joins.md)
   * built `addPage` to avoid producing. So the children merge into the
   * neighbouring page that keeps their order: the page before, or the page after
   * when this was the first. Only the last page leaves the form unpaged.
   */
  unwrapField(keyPath: readonly string[]): CommandOutcome
  moveField(from: readonly string[], to: Location): CommandOutcome
  renameField(keyPath: readonly string[], newKey: string): CommandOutcome
  setFieldProperty(keyPath: readonly string[], property: string, value: unknown): CommandOutcome
  // --- translation, which is a third document over the same model ---

  /**
   * Turn a literal into a message reference, keeping what it says.
   *
   * The command that makes a form translatable at all. Adding catalogue entries to
   * a document that already uses references is bookkeeping; this is the step that
   * takes the words somebody has already typed and makes them the default locale's
   * message, without asking them to type anything again.
   *
   * Idempotent: a property that is already a reference is left exactly as it is,
   * because a second extraction would overwrite a translation with the language it
   * was translated from.
   *
   * `locale` decides the default the first time only. A document with no `i18n` has
   * no default locale, and guessing one from the authoring browser would make the
   * document depend on who happened to open it.
   */
  extractText(keyPath: readonly string[], property: string, locale?: string): CommandOutcome

  /**
   * Turn every literal in the document into a reference, in one step.
   *
   * `Text` appears in exactly four places — a field's label, an option's label, a
   * datagrid column's heading, and a layout node's label — and this reaches all
   * four. Doing it property by property is a chore people abandon halfway, which
   * leaves a form half translatable and a catalogue that looks finished.
   *
   * The ids it mints need not be stable, which looks wrong and is not: a
   * reference lives INSIDE the thing it names, so an option's travels with the
   * option and a node's with the node. Reordering or moving carries it along.
   */
  extractAllText(locale?: string): CommandOutcome

  /** Write one message, in one locale. */
  setMessage(locale: string, id: string, text: string): CommandOutcome

  /**
   * The catalogue for one locale, with every message the form refers to.
   *
   * Untranslated messages are present with an empty target rather than absent: a
   * translator needs the list of what is left, and a file that omits them is a
   * file that says the language is finished.
   */
  exportCatalogue(locale: string): CatalogueFile

  /**
   * Write a returned catalogue's targets, and report what was odd about it.
   *
   * One undoable step. An empty target never erases a translation already
   * there — a vendor returning a partial file is normal, and writing its blanks
   * over finished work is a loss nobody notices until the form is live. An id the
   * form no longer has is reported rather than written, because resurrecting one
   * as an orphan makes the count of what is left to translate wrong forever.
   */
  importCatalogue(file: CatalogueFile): CommandOutcome

  /** What the last import did. `undefined` before one has happened. */
  lastImportReport(): ImportReport | undefined

  /** Start a locale with nothing in it, which is how a translator opens one. */
  addLocale(locale: string): CommandOutcome

  /** Remove a locale. The default is refused: everything falls back to it. */
  removeLocale(locale: string): CommandOutcome

  /**
   * Message ids nothing in the document refers to any more.
   *
   * Reported rather than collected. A translator's work outliving the field it was
   * written for is recoverable; a builder that silently discards a year of
   * translations is not one anybody trusts with the next year's.
   */
  orphanedMessages(): string[]

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
  /**
   * Put several nodes inside a new container, where the earliest of them stood.
   *
   * The inverse of `unwrapLayoutNode`, and what "drop this field beside that
   * one" compiles to. The addresses need NOT be siblings — the field being
   * dragged is usually somewhere else — and the new container's children follow
   * the order the addresses are given in, because the side somebody dropped on
   * is what decides which field ends up on the left.
   *
   * One command rather than a move plus a wrap, so one gesture is one undo. A
   * gesture that takes three presses of undo to reverse is one people stop
   * trusting.
   */
  wrapLayoutNodes(
    layout: string,
    addresses: ReadonlyArray<readonly number[]>,
    container: LayoutNode,
    /**
     * Which of the addresses the new container takes the position of.
     *
     * Defaults to the earliest in document order, which is right when there is
     * no reason to prefer one. A DROP has one: the new row belongs where the
     * thing dropped ON was, not where the thing being dragged came from --
     * otherwise dragging a field out of a row and onto a top-level field nests
     * the new row inside the old one, which is not what anybody aimed at.
     *
     * Separate from the order of `addresses` because the two are independent:
     * dropping on the left makes the dragged node the first child while the
     * position still comes from the target, which is the second address.
     */
    positionOf?: readonly number[],
  ): CommandOutcome
  moveLayoutNode(from: LayoutAddress, to: LayoutLocation): CommandOutcome
  setLayoutNodeLabel(address: LayoutAddress, label: Text | undefined): CommandOutcome
  /**
   * Set any property the format gives a layout node, or remove it with `undefined`.
   *
   * Generic on purpose: the builder's panel is generated from the JSON Schema, so a
   * command per property would have to be remembered every time the format grows one.
   * `span` arrived and had no way to be set at all
   * ([0074](../../../docs/decisions/0074-a-table-child-may-span.md)); so had a table's
   * `columns` and a section's `label`, since the day layouts existed.
   *
   * `kind`, `children` and `path` are refused: the first is what the node IS, the
   * second is structure the tree edits, and the third is which answer a placement
   * places — all three have their own commands that keep the document consistent.
   *
   * Like every command here it is attempted against the validator, so an illegal value
   * leaves the document where it was rather than requiring the panel to know the rules.
   */
  setLayoutNodeProperty(
    address: LayoutAddress,
    property: string,
    value: unknown,
  ): CommandOutcome

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

/** Document order: earlier position first, and a parent before its child. */
function comparePaths(a: readonly number[], b: readonly number[]): number {
  const depth = Math.min(a.length, b.length)
  for (let at = 0; at < depth; at += 1) {
    if (a[at] !== b[at]) return a[at]! - b[at]!
  }
  return a.length - b.length
}

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
  let lastImport: ImportReport | undefined

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

    addPage(label) {
      return attempt((draft) => {
        const top = draft.model.fields
        const paged = top.some((field) => field.type === 'page')
        const page: FieldDef = {
          key: nextPageKey(draft),
          type: 'page',
          ...(label === undefined ? {} : { label }),
          // Absorbing, when there is nothing to absorb, yields the empty page a
          // second call would have produced anyway — so the two cases are one
          // splice rather than a branch that has to agree with itself.
          fields: paged ? [] : top.splice(0, top.length),
        }
        top.push(page)
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
        const removed = found.siblings[found.index]!
        found.siblings.splice(found.index, 1)
        // A layout node placing a field that no longer exists is invalid, so
        // without this the command is simply refused and a form author cannot
        // delete a field at all once it has been arranged. Pruning it here is
        // not a convenience: an arrangement is a view of the model, and it
        // cannot outlive what it is a view of.
        if (dataPath !== undefined) unplaceEverywhere(draft, dataPath)
        // And the rule that could only ever have been about this page. Measured:
        // conditional page routing shipped in 0.3.0 and a `skip` names a page
        // key, so the validator refused the whole removal with "visa is not a
        // page" — which made every page somebody had routed around undeletable
        // from the builder. Found by writing `unwrapField`, not by reading this.
        if (removed.type === 'page') unskipEverywhere(draft, removed.key)
        return undefined
      })
    },

    unwrapField(keyPath) {
      return attempt((draft) => {
        const found = locate(draft, keyPath)
        if (found === undefined) return refuse('/model/fields', `No field at "${keyPath.join('.')}".`)
        const field = found.siblings[found.index]!
        const where = keyPath.join('.')

        if (!CONTAINER_TYPES.has(field.type)) {
          return refuse(
            '/model/fields',
            `"${where}" holds one answer. There is nothing inside it to keep, and unwrapping is not another word for deleting.`,
          )
        }
        if (field.type === 'repeater') {
          return refuse(
            '/model/fields',
            `"${where}" is a repeater, and the fields inside it describe one ROW rather than a list of questions. Lifting them out would turn every row's answers into one answer each and lose every row after the first — and nothing would say so, because the form that came out would be perfectly valid. Move the fields out one at a time if that is what you meant.`,
          )
        }

        const children = [...(field.fields ?? [])]
        // Read before the splice: afterwards neither path resolves. A page
        // contributes no segment, so this is the empty string for one — which is
        // exactly the signal that nothing beneath it is about to be renamed.
        const container = dataPathOf(draft, keyPath) ?? ''

        if (container !== '') {
          const blocking = rulesTouching(draft, container)
          if (blocking.length > 0) {
            return refuse(
              '/logic/rules',
              `Unwrapping "${where}" renames every answer inside it — "${container}.x" becomes "x" — and ${blocking.join(', ')} still ${blocking.length === 1 ? 'addresses or reads' : 'address or read'} a path inside it. A rule's condition is CEL, which this cannot rewrite without pattern-matching source, so change or delete the rule first.`,
            )
          }
          // The container's OWN placement goes: the group is what disappears, and
          // a node placing a group that no longer exists is refused — which would
          // make the command unavailable on exactly the forms somebody arranged.
          // Its children's placements are repointed rather than pruned.
          unplaceOnly(draft, container)
          const parent = container.includes('.')
            ? container.slice(0, container.lastIndexOf('.'))
            : ''
          for (const child of children) {
            repathEverywhere(
              draft,
              `${container}.${child.key}`,
              parent === '' ? child.key : `${parent}.${child.key}`,
            )
          }
        }

        if (field.type === 'page') {
          // A page sits only at the top level, so `found.siblings` IS the model's
          // field list and the neighbours are its pages.
          const host = neighbouringPage(found.siblings, found.index)
          if (host === undefined) found.siblings.splice(found.index, 1, ...children)
          else {
            const into = found.siblings[host]!
            // Appended after a preceding page's questions, prepended before a
            // following one's: both are the position that leaves the document in
            // the order somebody typed it.
            into.fields =
              host < found.index
                ? [...(into.fields ?? []), ...children]
                : [...children, ...(into.fields ?? [])]
            found.siblings.splice(found.index, 1)
          }
          unskipEverywhere(draft, field.key)
          return undefined
        }

        found.siblings.splice(found.index, 1, ...children)
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

    extractText(keyPath, property, locale) {
      return attempt((draft) => {
        const found = locate(draft, keyPath)
        if (found === undefined) {
          return refuse('/model/fields', `No field at "${keyPath.join('.')}".`)
        }
        const field = found.siblings[found.index] as unknown as Record<string, unknown>
        const current = field[property]
        // Already a reference: nothing to extract, and re-seeding would overwrite a
        // translation with the language it came from.
        if (typeof current === 'object' && current !== null && '$t' in current) return undefined
        if (typeof current !== 'string') {
          return refuse(
            `/model/fields/${String(found.index)}/${property}`,
            `"${property}" on "${keyPath.join('.')}" is not text, so there is nothing to translate.`,
          )
        }

        const defaultLocale = draft.i18n?.defaultLocale ?? locale ?? 'en'
        const id = `${keyPath.join('.')}.${property}`
        draft.i18n = {
          defaultLocale,
          messages: { ...draft.i18n?.messages },
        }
        draft.i18n.messages[defaultLocale] = {
          ...draft.i18n.messages[defaultLocale],
          [id]: current,
        }
        field[property] = { $t: id }
        return undefined
      })
    },

    extractAllText(locale) {
      return attempt((draft) => {
        const defaultLocale = draft.i18n?.defaultLocale ?? locale ?? 'en'
        const catalogue: Record<string, string> = { ...draft.i18n?.messages[defaultLocale] }
        const taken = new Set(Object.keys(catalogue))

        /** A readable id nothing else is using. */
        const mint = (base: string): string => {
          if (!taken.has(base)) {
            taken.add(base)
            return base
          }
          let counter = 2
          while (taken.has(`${base}.${String(counter)}`)) counter += 1
          const id = `${base}.${String(counter)}`
          taken.add(id)
          return id
        }

        /** Replace one property with a reference, keeping what it said. */
        const lift = (holder: Record<string, unknown>, property: string, base: string): void => {
          const current = holder[property]
          if (typeof current !== 'string') return
          const id = mint(base)
          catalogue[id] = current
          holder[property] = { $t: id }
        }

        const fields = (defs: FieldDef[], parent: readonly string[]): void => {
          for (const def of defs) {
            const at = [...parent, def.key]
            const path = at.join('.')
            lift(def as unknown as Record<string, unknown>, 'label', `${path}.label`)
            for (const option of def.options ?? []) {
              // By VALUE rather than by index: an option's value is its identity,
              // so the id reads as the thing it names rather than as a position.
              lift(option as unknown as Record<string, unknown>, 'label', `${path}.option.${option.value}`)
            }
            for (const column of def.columns ?? []) {
              lift(column as unknown as Record<string, unknown>, 'header', `${path}.column.${column.field}`)
            }
            fields(def.fields ?? [], at)
          }
        }
        fields(draft.model.fields, [])

        for (const layout of draft.layouts ?? []) {
          const walk = (nodes: LayoutNode[], trail: string): void => {
            for (const [index, node] of nodes.entries()) {
              const at = `${trail}.${node.kind}${String(index)}`
              lift(node as unknown as Record<string, unknown>, 'label', `${at}.label`)
              walk(layoutChildren(node) as LayoutNode[], at)
            }
          }
          walk(layout.nodes, layout.name)
        }

        // Nothing to lift: leave the document exactly as it was rather than
        // attaching an empty catalogue to a form nobody is translating.
        if (Object.keys(catalogue).length === 0) return undefined

        draft.i18n = {
          defaultLocale,
          messages: { ...draft.i18n?.messages, [defaultLocale]: catalogue },
        }
        return undefined
      })
    },

    setMessage(locale, id, text) {
      return attempt((draft) => {
        if (draft.i18n === undefined) {
          return refuse('/i18n', 'This form has no translations yet. Extract a label first.')
        }
        draft.i18n = {
          ...draft.i18n,
          messages: {
            ...draft.i18n.messages,
            [locale]: { ...draft.i18n.messages[locale], [id]: text },
          },
        }
        return undefined
      })
    },

    exportCatalogue(locale) {
      const defaultLocale = present.i18n?.defaultLocale ?? 'en'
      const source = present.i18n?.messages[defaultLocale] ?? {}
      const target = present.i18n?.messages[locale] ?? {}
      // Every id the DOCUMENT refers to, not every id the catalogue holds: an
      // orphan is somebody's kept work and not a thing to send out for
      // translation again.
      const live = referencedIds(present)
      return {
        locale,
        defaultLocale,
        messages: [...live].map((id) => ({
          id,
          source: source[id] ?? '',
          target: target[id] ?? '',
        })),
      }
    },

    importCatalogue(file) {
      const live = referencedIds(present)
      const report: ImportReport = { written: 0, unknown: [], stale: [] }
      const source = present.i18n?.messages[present.i18n.defaultLocale] ?? {}

      const outcome = attempt((draft) => {
        const existing = { ...draft.i18n?.messages[file.locale] }
        for (const message of file.messages) {
          if (!live.has(message.id)) {
            report.unknown.push(message.id)
            continue
          }
          // Translated from words that have since changed. Written anyway --
          // something is better than nothing and the translator may well be
          // right -- and named, because it is the one a reviewer has to look at.
          if (message.source !== '' && source[message.id] !== message.source) {
            report.stale.push(message.id)
          }
          if (message.target === '') continue
          existing[message.id] = message.target
          report.written += 1
        }

        const defaultLocale = draft.i18n?.defaultLocale ?? file.defaultLocale
        draft.i18n = {
          defaultLocale,
          messages: { ...draft.i18n?.messages, [file.locale]: existing },
        }
        return undefined
      })

      if (outcome.ok) lastImport = report
      return outcome
    },

    lastImportReport: () => lastImport,

    addLocale(locale) {
      return attempt((draft) => {
        if (draft.i18n === undefined) {
          return refuse('/i18n', 'This form has no translations yet. Extract a label first.')
        }
        // Present with nothing in it, so a translator can open the language and work
        // through it rather than having to translate something before it exists.
        draft.i18n = {
          ...draft.i18n,
          messages: { ...draft.i18n.messages, [locale]: { ...draft.i18n.messages[locale] } },
        }
        return undefined
      })
    },

    removeLocale(locale) {
      return attempt((draft) => {
        if (draft.i18n === undefined) return refuse('/i18n', 'This form has no translations.')
        if (draft.i18n.defaultLocale === locale) {
          return refuse(
            '/i18n/defaultLocale',
            `"${locale}" is the default locale: every other locale falls back to it, so removing it would leave every untranslated message with nothing to resolve to.`,
          )
        }
        const messages = { ...draft.i18n.messages }
        delete messages[locale]
        draft.i18n = { ...draft.i18n, messages }
        return undefined
      })
    },

    orphanedMessages() {
      const referenced = new Set<string>()
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
          for (const item of value) walk(item)
          return
        }
        if (typeof value !== 'object' || value === null) return
        const record = value as Record<string, unknown>
        if (typeof record['$t'] === 'string') {
          referenced.add(record['$t'])
          return
        }
        for (const item of Object.values(record)) walk(item)
      }
      // The model and the layouts, and NOT `i18n` itself -- walking the catalogue
      // would find every id in it and report none of them.
      walk(present.model)
      walk(present.layouts)

      const known = new Set<string>()
      for (const catalogue of Object.values(present.i18n?.messages ?? {})) {
        for (const id of Object.keys(catalogue)) known.add(id)
      }
      return [...known].filter((id) => !referenced.has(id)).sort()
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

    wrapLayoutNodes(layout, addresses, container, positionOf) {
      if (addresses.length < 2) {
        return refuse(
          `/layouts/${layout}`,
          'Wrapping needs at least two nodes. Use insertLayoutNode for one.',
        )
      }

      if (!isLayoutContainer(container)) {
        return refuse(
          `/layouts/${layout}`,
          'The wrapper has to be a container. A field node cannot hold anything.',
        )
      }

      for (let outer = 0; outer < addresses.length; outer += 1) {
        for (let inner = 0; inner < addresses.length; inner += 1) {
          if (outer === inner) continue
          const a = addresses[outer]!
          const b = addresses[inner]!
          if (samePath(a, b)) {
            // Spliced out once and inserted twice would place one field in two
            // positions, which stays syntactically fine and fails at publish.
            return refuse(
              layoutPointer({ layout, path: a }),
              'That node is listed twice. Each one can only go in once.',
            )
          }
          if (encloses(a, b)) {
            return refuse(
              layoutPointer({ layout, path: a }),
              'Cannot wrap a container together with something inside it.',
            )
          }
        }
      }

      return attempt((draft) => {
        // Collected before anything is removed, because every removal renumbers
        // the addresses after it -- the whole difficulty of editing a document
        // whose nodes have no keys.
        const taken: LayoutNode[] = []
        for (const path of addresses) {
          const found = locateLayout(draft, { layout, path })
          if (found === undefined) return noSuchNode({ layout, path })
          taken.push(found.siblings[found.index]!)
        }

        // Where the wrapper goes, read now while the addresses still mean what
        // the caller meant. `at` when given -- a drop wants the target's place,
        // not the dragged node's -- and otherwise the earliest in document
        // order, which is the sensible default when nothing prefers one.
        const anchorPath =
          positionOf !== undefined && addresses.some((path) => samePath(path, positionOf))
            ? positionOf
            : [...addresses].sort(comparePaths)[0]!
        const home = locateLayout(draft, { layout, path: anchorPath })
        if (home === undefined) return noSuchNode({ layout, path: anchorPath })
        const parent = home.siblings
        const at = home.index

        // Removed deepest-last so that removing one cannot invalidate the
        // address of another still to be removed.
        for (const path of [...addresses].sort(comparePaths).reverse()) {
          const found = locateLayout(draft, { layout, path })
          if (found === undefined) return noSuchNode({ layout, path })
          found.siblings.splice(found.index, 1)
        }

        parent.splice(Math.min(at, parent.length), 0, { ...container, children: taken })
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

    setLayoutNodeProperty(address, property, value) {
      return attempt((draft) => {
        const found = locateLayout(draft, address)
        if (found === undefined) return noSuchNode(address)
        if (STRUCTURAL_LAYOUT_PROPERTIES.has(property)) {
          return refuse(
            `${layoutPointer(address)}/${property}`,
            `"${property}" is not a setting. It is what the node is, or where it sits, and the arrangement's own commands change it.`,
          )
        }
        if (property === '__proto__' || property === 'prototype' || property === 'constructor') {
          return refuse(
            `${layoutPointer(address)}/${property}`,
            `"${property}" is not allowed as a layout node setting name.`,
          )
        }
        const node = found.siblings[found.index]! as unknown as Record<string, unknown>
        if (value === undefined) Reflect.deleteProperty(node, property)
        else {
          Object.defineProperty(node, property, {
            value: copy(value) as unknown,
            writable: true,
            enumerable: true,
            configurable: true,
          })
        }
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
      const paged = present.model.fields.some((field) => field.type === 'page')
      for (const parent of containerPaths(present)) {
        // A container cannot be moved into itself or its own descendants.
        if (movingPath !== undefined && isPrefix(movingPath, parent)) continue

        // Once a form has pages, the top level is for pages. The validator
        // permits a field beside a page and the ENGINE does not honour it: a
        // top-level field that is not inside a page is given to page one
        // wherever it sits, measured as pages 0, 0, 0, 1 across
        // `bare1, page one, bare2, page two`. Offering the position would be
        // offering a placement that renders somewhere else — worse than
        // refusing it, because the tree would go on showing it where it is not.
        if (paged && parent.length === 0 && probe.type !== 'page') continue

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
/**
 * Layout node properties that are not settings.
 *
 * `kind` is what the node IS — writing a new one would turn a table into a section
 * without moving its children. `children` is structure, which the tree edits. `path`
 * is which answer a placement places, chosen when the placement is added and governed
 * by the one-place-per-field rule.
 */
const STRUCTURAL_LAYOUT_PROPERTIES = new Set(['kind', 'children', 'path'])

/**
 * The path a rule and a layout node address a field by, which is not its key path.
 *
 * Pages are transparent for data, so a field inside one is addressed without the
 * page: `about.needsVisa` in the tree is `needsVisa` in the model. Exported
 * because the logic panel composed a rule target by joining the key path, and a
 * rule on any field inside a page was therefore refused with "No field has the
 * data path" — in the builder, for as long as pages have existed.
 */
export function dataPathOf(document: FormSchema, keyPath: readonly string[]): string | undefined {
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
    layout.nodes = pruned(layout.nodes, (path) => underPath(path, dataPath))
  }
}

/**
 * Drop every layout node placing `dataPath` ITSELF, leaving what is inside it.
 *
 * What unwrapping a group needs, and the reason the two are separate: a group is
 * placeable in its own right, so the node placing it goes with it — while the
 * nodes placing its children stay, repointed at where those answers moved to.
 */
function unplaceOnly(draft: FormSchema, dataPath: string): void {
  for (const layout of draft.layouts ?? []) {
    layout.nodes = pruned(layout.nodes, (path) => path === dataPath)
  }
}

function pruned(nodes: readonly LayoutNode[], goes: (path: string) => boolean): LayoutNode[] {
  const kept: LayoutNode[] = []
  for (const node of nodes) {
    if (node.kind === 'field' || node.kind === 'qrcode') {
      // A code goes when the answer it encodes goes, exactly as its placement does:
      // what would remain is a node drawing a picture of nothing, and the validator
      // would then refuse the document the builder had just produced.
      if (!goes(node.path)) kept.push(node)
      continue
    }
    // The container stays even when it empties. Removing one field should not
    // silently take a row with it and rearrange everything beside it.
    kept.push({ ...node, children: pruned(layoutChildren(node) as LayoutNode[], goes) })
  }
  return kept
}

/**
 * The page a page's questions should join, or nothing if there is no other.
 *
 * The page before, and the page after when there is none before — which is the
 * choice that keeps the document in its order either way, rather than the choice
 * between two directions it might look like. Nothing when this is the only page,
 * and the form then stops being a wizard.
 */
function neighbouringPage(fields: readonly FieldDef[], at: number): number | undefined {
  for (let before = at - 1; before >= 0; before -= 1) {
    if (fields[before]!.type === 'page') return before
  }
  for (let after = at + 1; after < fields.length; after += 1) {
    if (fields[after]!.type === 'page') return after
  }
  return undefined
}

/**
 * Drop every rule that could only ever have been about this page.
 *
 * `skip` names a page KEY rather than a data path, because a page carries no
 * answer of its own. So a page that goes leaves a rule aimed at nothing, the
 * validator refuses the whole edit, and the page becomes undeletable — which is
 * what it was between 0.3.0 and this.
 */
function unskipEverywhere(draft: FormSchema, pageKey: string): void {
  const rules = draft.logic?.rules
  if (rules === undefined) return
  draft.logic = {
    ...draft.logic,
    rules: rules.filter(
      (rule) => !(PAGE_TARGETED_RULE_KINDS.includes(rule.kind as never) && rule.target === pageKey),
    ),
  }
}

/**
 * Which rules address or read a data path at or under `prefix`, described.
 *
 * Two questions, and only the first can be answered structurally. `target` is a
 * data path, so that is a comparison. A condition is CEL SOURCE, so this is a
 * search — and a search of source is the shape of guard that has been wrong six
 * times in this repository, so the boundary is the whole point: `address`
 * matches in `address.city` and in `has(address)`, and does not match in
 * `addressbook` or in `mailing.address`. A false positive costs a refusal on a
 * document that was safe; a false negative breaks a rule in silence. It is drawn
 * to fail toward the refusal, and that is why this reports rather than rewrites.
 */
function rulesTouching(document: FormSchema, prefix: string): string[] {
  const mentioned = new RegExp(`(?<![\\w.])${prefix.replaceAll('.', '\\.')}(?![\\w])`)
  const touching: string[] = []
  for (const [index, rule] of (document.logic?.rules ?? []).entries()) {
    const reads = rule.cel !== undefined && mentioned.test(rule.cel)
    if (!underPath(rule.target, prefix) && !reads) continue
    touching.push(`rule ${String(index + 1)} (${rule.kind} on "${rule.target}")`)
  }
  return touching
}

/** Point every layout node at the new path, including fields inside a group. */
function repathEverywhere(draft: FormSchema, before: string, after: string): void {
  const walk = (nodes: LayoutNode[]): void => {
    for (const [index, node] of nodes.entries()) {
      if (node.kind === 'field' || node.kind === 'qrcode') {
        // A code follows a rename. A declared rename keeps the answer, so a code of it
        // must keep encoding the same answer -- leaving the old path behind would turn
        // a rename into a silently broken code.
        if (underPath(node.path, before)) {
          nodes[index] = { ...node, path: after + node.path.slice(before.length) }
        }
        continue
      }
      walk(layoutChildren(node) as LayoutNode[])
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

/**
 * `page1`, `page2`, ... counted from the pages there are rather than from 1.
 *
 * A key is an identity a rule may name and an author never types; the label is
 * what the stepper shows. Deriving one from the other would make renaming a step
 * a key change, and a key change is a data migration.
 */
function nextPageKey(document: FormSchema): string {
  const taken = new Set<string>()
  const walk = (fields: readonly FieldDef[]): void => {
    for (const field of fields) {
      taken.add(field.key)
      walk(field.fields ?? [])
    }
  }
  walk(document.model.fields)

  let counter = document.model.fields.filter((field) => field.type === 'page').length + 1
  while (taken.has(`page${String(counter)}`)) counter += 1
  return `page${String(counter)}`
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

/** Every message id the document refers to. Shared by the export and the import,
 *  so the two can never disagree about which messages are live. */
function referencedIds(document: FormSchema): Set<string> {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    if (typeof record['$t'] === 'string') {
      found.add(record['$t'])
      return
    }
    for (const item of Object.values(record)) walk(item)
  }
  walk(document.model)
  walk(document.layouts)
  return found
}
