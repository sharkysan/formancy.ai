import type { FieldDef, FormSchema } from '@formancy/spec'
import { nextSpecVersion, paletteEntries } from './palette.js'
import type { BuilderSession, Location } from './session.js'
import { flatten, nameOf } from './tree.js'
import type { TreeNode } from './tree.js'
import type { MoveTarget } from './view.js'

/**
 * A command on the structure tree, and the sentence a builder says after it.
 *
 * Both builders announce every command through one polite live region, and both
 * worked out what to say by hand — the same count taken before adding a page,
 * the same search for the page that took a container's questions, the same
 * check for whether the form is still a wizard, character for character. Two
 * copies of how "the form is not a wizard any more" is decided is the drift
 * [0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md) says
 * belongs in one place, and the copies had already drifted together: both named
 * the row a field was DROPPED ON as the field that moved.
 *
 * Each function runs the command and returns what to announce, in the session's
 * language ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 * Running the command here rather than taking its outcome is the point: the
 * sentence needs what was true BEFORE the command — a container's name and
 * contents are gone afterwards — and a caller handed that job would do it twice.
 */

export function undoAndSay(session: BuilderSession): string {
  return session.text(session.undo() ? 'said.undone' : 'said.nothingToUndo')
}

export function redoAndSay(session: BuilderSession): string {
  return session.text(session.redo() ? 'said.redone' : 'said.nothingToRedo')
}

/**
 * Add a page. The first one takes every field at the top level, because the
 * engine gives a field outside a page to page one wherever it sits
 * ([0081](../../../docs/decisions/0081-a-page-absorbs-the-form-it-joins.md)) —
 * and moving every field in the form is not something to do quietly.
 */
export function addPageAndSay(session: BuilderSession): string {
  const { text } = session
  // Counted BEFORE the command: the first page absorbs what is at the top level,
  // and the count afterwards cannot tell which case it was.
  const fields = session.document().model.fields
  const loose = fields.filter((field) => field.type !== 'page').length
  const page = text('palette.newPage', { number: fields.length - loose + 1 })

  const outcome = session.addPage(page)
  if (!outcome.ok) return text('said.cannotAddPage', { reason: outcome.message })
  if (loose === 0) return text('said.pageAdded', { page })
  return text('said.firstPageAdded', { page, count: loose })
}

/**
 * Take a container away and keep what was inside it.
 *
 * Read BEFORE the command, for the reason `addPageAndSay` counts first: the
 * container is gone afterwards, so neither its name nor its contents can be
 * recovered to say what happened. Where a page's questions went is read off the
 * document afterwards rather than worked out twice — they do not stay at the top
 * level while other pages remain, so an author has to be told which step they
 * are on now.
 */
export function unwrapAndSay(session: BuilderSession, keyPath: readonly string[]): string {
  const { text } = session
  const before = session.document()
  // A path that names nothing reaches the command anyway, which refuses it in
  // its own words; there is no second way of saying so here.
  const def = nodeAt(before, keyPath)?.def
  const name = def === undefined ? keyPath.join('.') : nameOf(before, def)
  const inside = def?.fields ?? []
  const wasPage = def?.type === 'page'

  const outcome = session.unwrapField(keyPath)
  if (!outcome.ok) return text('said.cannotUnwrap', { name, reason: outcome.message })

  const after = session.document()
  const first = inside[0]
  // Only for a PAGE. A group inside a page leaves its questions on that page too,
  // and both builders found that page and announced "Removed the page address"
  // for a group called address — in every form that has pages.
  const host =
    !wasPage || first === undefined
      ? undefined
      : after.model.fields.find(
          (field) =>
            field.type === 'page' && (field.fields ?? []).some((child) => child.key === first.key),
        )
  const what =
    inside.length === 0
      ? text('said.unwrappedEmpty', { name })
      : host !== undefined
        ? text('said.unwrappedPage', { name, count: inside.length, host: nameOf(after, host) })
        : text('said.unwrapped', { name, count: inside.length })

  // COUNTED, not inferred from the host. Inferred, an empty page read as no pages
  // left — an empty page has no first question to find — and the live region said
  // the form had stopped being a wizard while page one was still there.
  const stillPaged = after.model.fields.some((field) => field.type === 'page')
  // A form ceasing to have steps is the largest thing this command does and the
  // least visible: the tree looks like a flat list of questions either way.
  return wasPage && !stillPaged ? text('said.notAWizard', { said: what }) : what
}

export function removeAndSay(session: BuilderSession, keyPath: readonly string[]): string {
  const { text } = session
  const name = nameAt(session, keyPath)
  const outcome = session.removeField(keyPath)
  return outcome.ok
    ? text('said.removed', { name })
    : text('said.cannotRemove', { name, reason: outcome.message })
}

/** Insert a field at a destination the person chose from the list. */
export function insertAndSay(session: BuilderSession, def: FieldDef, target: MoveTarget): string {
  const { text } = session
  const outcome = session.insertField(target.location, def)
  return outcome.ok
    ? text('said.added', { what: titleOf(def.type), where: target.label })
    : text('said.cannotAdd', { reason: outcome.message })
}

/** Move a field to a destination the person chose from the list. */
export function moveAndSay(
  session: BuilderSession,
  keyPath: readonly string[],
  target: MoveTarget,
): string {
  const { text } = session
  const name = nameAt(session, keyPath)
  const outcome = session.moveField(keyPath, target.location)
  return outcome.ok
    ? text('said.moved', { name, where: target.label })
    : text('said.cannotMove', { reason: outcome.message })
}

/**
 * Move a field where it was dropped.
 *
 * Names the field that MOVED. Both builders named the row it was dropped on —
 * the drop handler's own argument — so dragging Email onto Summary announced
 * "Moved Summary."
 */
export function dropAndSay(
  session: BuilderSession,
  keyPath: readonly string[],
  location: Location,
): string {
  const { text } = session
  const name = nameAt(session, keyPath)
  const outcome = session.moveField(keyPath, location)
  return outcome.ok
    ? text('said.dropped', { name })
    : text('said.cannotMove', { reason: outcome.message })
}

/**
 * Move the document forward one spec version.
 *
 * One step. Moving a version 1 document straight to the newest would cost it
 * every reader pinned to 2, for a type that only needs 2.
 */
export function upgradeAndSay(session: BuilderSession): string {
  const { text } = session
  const to = nextSpecVersion(session.document().specVersion)
  if (to === undefined) return text('said.cannotUpgrade', { reason: text('said.alreadyNewest') })
  const outcome = session.upgradeSpec(to)
  return outcome.ok
    ? text('said.upgraded', { version: to })
    : text('said.cannotUpgrade', { reason: outcome.message })
}

/**
 * What the two keyboard legends list, in the session's language.
 *
 * The letters are the bindings and are not translated; the names of the other
 * keys are, because a German keyboard says `Entf` and `Strg`.
 */
export function treeKeyHelp(session: BuilderSession): ReadonlyArray<readonly [string, string]> {
  const { text } = session
  return [
    ['↑ ↓', text('keys.arrows.what')],
    ['a', text('keys.add.what')],
    ['p', text('keys.addPage.what')],
    ['u', text('keys.unwrap.what')],
    ['m', text('keys.move.what')],
    [text('keys.delete.key'), text('keys.delete.what')],
    [text('keys.undo.key'), text('keys.undo.what')],
  ]
}

function nodeAt(document: FormSchema, keyPath: readonly string[]): TreeNode | undefined {
  return flatten(document).find((candidate) => samePath(candidate.keyPath, keyPath))
}

function nameAt(session: BuilderSession, keyPath: readonly string[]): string {
  const document = session.document()
  const def = nodeAt(document, keyPath)?.def
  return def === undefined ? keyPath.join('.') : nameOf(document, def)
}

/** The palette's title for a type: the spec's own word for it, as the palette shows it. */
function titleOf(type: string): string {
  return paletteEntries().find((entry) => entry.type === type)?.title ?? type
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, at) => b[at] === key)
}
