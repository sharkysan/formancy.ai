import { parse, referencedPaths } from '@formancy/expressions'
import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { PAGE_TARGETED_RULE_KINDS } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import { referencedMessages } from './logic.js'
import type { BuilderText } from './messages.js'
import { containerAt, dataPathOf, locate, rulePathOf } from './navigate.js'
import { repathRules, underPath } from './repath.js'
import { createBuilderSession } from './session.js'
import type { BuilderSession, CommandOutcome, Location } from './session.js'
import { describeTarget } from './tree.js'
import type { MoveTarget } from './view.js'

/**
 * A piece of a form saved to use again: a field — usually a group or a repeater — with
 * the rules that live entirely inside it and the words it names
 * ([0135](../../../docs/decisions/0135-a-block-is-a-field-with-its-rules.md)).
 *
 * **The host keeps them.** A block is data a builder hands out and is handed back, as a
 * form's scenarios are: where blocks are stored, who may use them and how they are shared
 * is the deployment's, so this package names none of it.
 *
 * **Its rules are written where it was saved**, against the document it came from, and
 * `root` says where that was. Inserting it re-roots them under wherever it lands and
 * renames them with any key that had to change — a form's keys are unique across the form,
 * so a block's may not survive the trip. Its words are renamed the same way, where the form
 * already uses one of their ids for something else.
 */
export interface BuilderBlock {
  /** Stable across saves, so a host can replace a block rather than add a second. */
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly field: FieldDef
  /** The field's data path when it was saved: what its rules' paths are written against. */
  readonly root: string
  /** The rules about it that read nothing outside it. */
  readonly rules: readonly LogicRule[]
  /** The words its `$t` references name, per locale. */
  readonly messages?: Readonly<Record<string, Readonly<Record<string, string>>>>
}

export type BlockSaved =
  | { readonly ok: true; readonly block: BuilderBlock; readonly leftOut: number }
  | { readonly ok: false; readonly message: string }

/**
 * The field at `keyPath`, as a block.
 *
 * A rule comes along when it is about the field or something inside it **and** reads only
 * inside it: a rule reading a field outside would arrive reading nothing — or, worse,
 * whatever the new form happens to call by that name. Those are counted in `leftOut`, so a
 * builder can say what stayed behind instead of dropping it silently.
 */
export function blockFrom(
  document: FormSchema,
  keyPath: readonly string[],
  meta: { id: string; name: string; description?: string },
  text: BuilderText,
): BlockSaved {
  const found = locate(document, keyPath)
  const field = found?.siblings[found.index]
  const root = dataPathOf(document, keyPath)
  if (field === undefined || root === undefined) {
    return { ok: false, message: text('refuse.noField', { path: keyPath.join('.') }) }
  }
  if (field.type === 'page') return { ok: false, message: text('refuse.blockIsPage') }
  if (rulePathOf(document, root).includes('[]')) {
    return { ok: false, message: text('refuse.blockInRow') }
  }

  const about = (rule: LogicRule): boolean =>
    !PAGE_TARGETED_RULE_KINDS.includes(rule.kind as never) && underPath(rule.target, root)
  const readsInside = (rule: LogicRule): boolean => {
    if (rule.cel === undefined) return true
    const parsed = parse(rule.cel)
    if (!parsed.ok) return false
    // A row's rule reads its row through `item` and its position through `index`; the
    // row is inside the block whenever the rule's target is.
    const inRow = rule.target.includes('[]')
    return referencedPaths(parsed.ast).every(
      (path) =>
        underPath(path, root) ||
        (inRow && (path === 'index' || path === 'item' || path.startsWith('item.'))),
    )
  }
  const ours = (document.logic?.rules ?? []).filter(about)
  const rules = ours.filter(readsInside)

  const ids = new Set(referencedMessages({ model: { fields: [field] } } as unknown as FormSchema))
  const messages = Object.fromEntries(
    Object.entries(document.i18n?.messages ?? {})
      .map(([locale, words]) => [
        locale,
        Object.fromEntries(Object.entries(words).filter(([id]) => ids.has(id))),
      ])
      .filter(([, words]) => Object.keys(words as object).length > 0),
  ) as Record<string, Record<string, string>>

  return {
    ok: true,
    block: {
      id: meta.id,
      name: meta.name,
      ...(meta.description === undefined ? {} : { description: meta.description }),
      field: copy(field),
      root,
      rules: copy(rules),
      ...(Object.keys(messages).length === 0 ? {} : { messages }),
    },
    leftOut: ours.length - rules.length,
  }
}

export type BlockPlaced =
  | { readonly ok: true; readonly document: FormSchema }
  | { readonly ok: false; readonly message: string }

/**
 * The document with the block inserted at `location` — keys made unique, its rules
 * re-rooted and renamed with them, its words merged and renamed where they clash — or why
 * it cannot be.
 *
 * Pure, so a builder can show what it would do before doing it, and so a session applies
 * it as one edit that undo takes back.
 */
export function withBlock(
  document: FormSchema,
  location: Location,
  block: BuilderBlock,
  text: BuilderText,
): BlockPlaced {
  const draft = copy(document)
  const container = containerAt(draft, location.parent)
  if (container === undefined) {
    return { ok: false, message: text('refuse.noContainer', { path: location.parent.join('.') }) }
  }

  const { field: placed, renames } = landing(draft, block)
  container.splice(Math.max(0, Math.min(location.index, container.length)), 0, placed)

  const at = dataPathOf(draft, [...location.parent, placed.key])
  if (at === undefined) {
    return { ok: false, message: text('refuse.noContainer', { path: location.parent.join('.') }) }
  }
  if (block.rules.length > 0 && rulePathOf(draft, at).includes('[]')) {
    return { ok: false, message: text('refuse.blockRulesInRow') }
  }

  // The rules on their own, so re-rooting them touches none of the form's.
  const carried = { ...draft, logic: { rules: copy([...block.rules]) } } as FormSchema
  const moves: Array<{ from: string; to: string }> = [{ from: block.root, to: at }]
  for (const rename of renames.slice(1)) {
    if (rename.before === rename.after) continue
    // Under the root's new path, with every ancestor already renamed.
    const parentPath = dataPathOf(draft, [...location.parent, ...rename.parent])
    if (parentPath === undefined) continue
    moves.push({ from: `${parentPath}.${rename.before}`, to: `${parentPath}.${rename.after}` })
  }
  for (const { from, to } of moves) {
    if (from === to) continue
    const refused = repathRules(carried, from, to, text)
    if (refused !== undefined) return { ok: false, message: refused }
  }
  draft.logic = {
    ...draft.logic,
    rules: [...(draft.logic?.rules ?? []), ...(carried.logic?.rules ?? [])],
  }

  return { ok: true, document: draft }
}

/**
 * Where a block may go in this form: every place the form would take its field, kept where
 * the whole block — its words and its rules as well — lands in a valid form.
 *
 * Asked of a session over the form **with the block's words already in it**. Asked with the
 * bare field, every place was refused: its `$t` references name words the form does not
 * have until the block brings them, so a block with a translated label was offered in the
 * palette and could then be put nowhere. Then each container is tried with the real insert,
 * because the rules can rule out a container the field alone would not — a repeater row,
 * where they would be about every row.
 */
export function blockTargets(
  document: FormSchema,
  block: BuilderBlock,
  text: BuilderText,
): MoveTarget[] {
  const worded = copy(document)
  const { field } = landing(worded, block)
  const lands = new Map<string, boolean>()
  return createBuilderSession(worded, { text })
    .validTargets(field)
    .filter((location) => {
      // Once per container, as the session decides it: nothing an insert checks depends on
      // where among its siblings the block sits.
      const container = location.parent.join('\u0000')
      if (!lands.has(container)) {
        const landed = withBlock(document, { parent: location.parent, index: 0 }, block, text)
        lands.set(container, landed.ok && validateSchema(landed.document).valid)
      }
      return lands.get(container) === true
    })
    .map((location) => ({ location, label: describeTarget(document, location, undefined, text) }))
}

/** One key a block had, and the key it has in the form it lands in. */
interface Rename {
  before: string
  after: string
  /** The new keys of the block's fields above this one, the block's own root first. */
  parent: string[]
}

/**
 * The block's field with every key the form already uses changed — `city` becomes
 * `city2` — and the renames, in the order a walk meets them: ancestors before what they
 * hold, which is the order their rules have to follow them in.
 */
function rekeyed(
  document: FormSchema,
  block: BuilderBlock,
): { field: FieldDef; renames: Rename[] } {
  const taken = new Set<string>()
  const collect = (fields: readonly FieldDef[]): void => {
    for (const field of fields) {
      taken.add(field.key)
      collect(field.fields ?? [])
    }
  }
  collect(document.model.fields)

  const renames: Rename[] = []
  const rekey = (field: FieldDef, parent: string[]): FieldDef => {
    let key = field.key
    for (let suffix = 2; taken.has(key); suffix += 1) key = `${field.key}${String(suffix)}`
    taken.add(key)
    renames.push({ before: field.key, after: key, parent })
    const children = field.fields?.map((child) => rekey(child, [...parent, key]))
    return { ...field, key, ...(children === undefined ? {} : { fields: children }) }
  }
  return { field: rekey(copy(block.field), []), renames }
}

/**
 * The block's field as it lands in `draft`: keys made unique, and its words merged into the
 * draft with any id the form already says differently renamed — `title` becomes `title2`,
 * as a key does — and the field's references following them.
 */
function landing(draft: FormSchema, block: BuilderBlock): { field: FieldDef; renames: Rename[] } {
  const { field, renames } = rekeyed(draft, block)
  const words = wordsInto(draft, block)
  return { field: words.size === 0 ? field : retold(field, words), renames }
}

/** Merge the block's words into `draft`, and say which ids had to change. */
function wordsInto(draft: FormSchema, block: BuilderBlock): Map<string, string> {
  const theirs = block.messages ?? {}
  const ours = draft.i18n?.messages ?? {}
  const ids = new Set(Object.values(theirs).flatMap((words) => Object.keys(words)))
  // Said differently in any language the two share. The same words under the same id are
  // the same message, and are shared rather than copied.
  const clashes = (id: string): boolean =>
    Object.entries(theirs).some(([locale, words]) => {
      const existing = ours[locale]?.[id]
      return words[id] !== undefined && existing !== undefined && existing !== words[id]
    })
  const taken = (id: string): boolean =>
    ids.has(id) || Object.values(ours).some((words) => words[id] !== undefined)

  const renamed = new Map<string, string>()
  for (const id of ids) {
    if (!clashes(id)) continue
    let next = id
    for (let suffix = 2; taken(next); suffix += 1) next = `${id}${String(suffix)}`
    ids.add(next)
    renamed.set(id, next)
  }

  for (const [locale, words] of Object.entries(theirs)) {
    draft.i18n = draft.i18n ?? { defaultLocale: locale, messages: {} }
    const merged = (draft.i18n.messages[locale] = { ...draft.i18n.messages[locale] })
    for (const [id, said] of Object.entries(words)) merged[renamed.get(id) ?? id] = said
  }
  return renamed
}

/** `value` with every `$t` reference to a renamed word pointing at its new id. */
function retold<T>(value: T, renamed: ReadonlyMap<string, string>): T {
  if (Array.isArray(value)) return value.map((item: unknown) => retold(item, renamed)) as T
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  const id = record['$t']
  if (typeof id === 'string') return { ...record, $t: renamed.get(id) ?? id } as T
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, retold(item, renamed)]),
  ) as T
}

/** Insert a block through a session: one edit, validated as any other, which undo takes back. */
export function insertBlock(
  session: BuilderSession,
  location: Location,
  block: BuilderBlock,
): CommandOutcome {
  const placed = withBlock(session.document(), location, block, session.text)
  if (!placed.ok) return { ok: false, path: '', message: placed.message }
  return session.replaceDocument(placed.document)
}

/** Insert a block where the person chose, and say what happened — the same words in both builders. */
export function insertBlockAndSay(
  session: BuilderSession,
  block: BuilderBlock,
  target: MoveTarget,
): string {
  const outcome = insertBlock(session, target.location, block)
  return outcome.ok
    ? session.text('said.blockAdded', { name: block.name, where: target.label })
    : session.text('said.cannotAdd', { reason: outcome.message })
}

/**
 * The field at `keyPath` as a block, and what to say about it: the rules that stayed
 * behind are counted aloud, so nobody finds out by inserting it.
 */
export function saveBlockAndSay(
  session: BuilderSession,
  keyPath: readonly string[],
  meta: { id: string; name: string; description?: string },
): { block?: BuilderBlock; said: string } {
  const { text } = session
  const saved = blockFrom(session.document(), keyPath, meta, text)
  if (!saved.ok) return { said: saved.message }
  return {
    block: saved.block,
    said:
      saved.leftOut === 0
        ? text('said.blockSavedWhole', { name: meta.name })
        : text('said.blockSaved', { name: meta.name, count: saved.leftOut }),
  }
}

/** A deep copy of plain document data: what this package has, with no DOM and no Node. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
