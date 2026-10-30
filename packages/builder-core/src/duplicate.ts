import type { LogicRule } from '@formancy/spec'
import { PAGE_TARGETED_RULE_KINDS } from '@formancy/spec'
import { withBlock } from './blocks.js'
import type { BuilderBlock } from './blocks.js'
import { dataPathOf, locate } from './navigate.js'
import { underPath } from './repath.js'
import type { BuilderSession, CommandOutcome } from './session.js'
import { nameOf } from './tree.js'

/**
 * A copy of the field at `keyPath`, straight after it: a key of its own, a field inside it
 * re-keyed where the form already uses the key, and every rule about the original aimed at
 * the copy (0192).
 *
 * **Placed as a block is**, because the hard part is the same: keys made unique across the
 * form, and rules re-rooted and renamed with them
 * ([0135](../../../docs/decisions/0135-a-block-is-a-field-with-its-rules.md)). One way of
 * doing that is what keeps a duplicated group's rule from reading the original's fields.
 *
 * **Unlike a block, it keeps the rules that read outside the field.** A block goes to another
 * form, where a field outside it may not exist, so it leaves those behind; a duplicate stays
 * in the form it came from, and "show Canton when Country is CH" is as true of the copy.
 *
 * One edit, through `replaceDocument`, so the session validates it and one undo takes the
 * copy and its rules back together.
 */
export function duplicateField(session: BuilderSession, keyPath: readonly string[]): CommandOutcome {
  const { text } = session
  const document = session.document()
  const found = locate(document, keyPath)
  const field = found?.siblings[found.index]
  const root = dataPathOf(document, keyPath)
  if (found === undefined || field === undefined || root === undefined) {
    return { ok: false, path: keyPath.join('.'), message: text('refuse.noField', { path: keyPath.join('.') }) }
  }
  if (field.type === 'page') return { ok: false, path: keyPath.join('.'), message: text('refuse.blockIsPage') }

  const about = (rule: LogicRule): boolean => !PAGE_TARGETED_RULE_KINDS.includes(rule.kind as never) && underPath(rule.target, root)
  const copy: BuilderBlock = {
    id: '',
    name: nameOf(document, field),
    field,
    root,
    rules: (document.logic?.rules ?? []).filter(about),
  }

  const placed = withBlock(document, { parent: keyPath.slice(0, -1), index: found.index + 1 }, copy, text)
  if (!placed.ok) return { ok: false, path: keyPath.join('.'), message: placed.message }
  return session.replaceDocument(placed.document)
}

/** Duplicate a field and say so, in the builder's language — the same words in both builders. */
export function duplicateAndSay(session: BuilderSession, keyPath: readonly string[]): string {
  const { text } = session
  const document = session.document()
  const found = locate(document, keyPath)
  const field = found?.siblings[found.index]
  const name = field === undefined ? keyPath.join('.') : nameOf(document, field)
  const outcome = duplicateField(session, keyPath)
  return outcome.ok ? text('said.duplicated', { name }) : text('said.cannotDuplicate', { name, reason: outcome.message })
}
