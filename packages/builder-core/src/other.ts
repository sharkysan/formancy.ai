import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { conditionFields } from './condition-draft.js'
import type { ConditionDraft } from './condition-draft.js'
import { composeRule, ruleTargetFor } from './logic.js'
import { locate } from './navigate.js'
import { uniqueKey } from './palette.js'
import type { BuilderSession, CommandOutcome } from './session.js'
import { flatten, nameOf } from './tree.js'

/** The choices a person picks "Other" from: one answer, or a list of ticks. */
const CHOICES = new Set<FieldDef['type']>(['radio', 'select', 'selectboxes'])

/** Whether the panel offers "Other, please specify" here: a choice that does not offer it yet. */
export function offersOther(def: FieldDef): boolean {
  return CHOICES.has(def.type) && !(def.options ?? []).some((option) => option.value === 'other')
}

/**
 * "Other, please specify" on the choice at `keyPath`, in one step (0202).
 *
 * **Three constructs the format already has, composed as an author would** (0199): an `other`
 * option, kept in its place when the options are shuffled; a text field straight after the
 * choice; and two rules on it, showing it and requiring it while "Other" is chosen. The rules
 * are composed as the condition editor composes a comparison, so they read the choice at the
 * path the engine does, in a repeater's row too, and the panel reopens them as conditions.
 * The engine already clears the text when "Other" is unchosen, since a field hidden by a rule
 * loses its answer.
 *
 * One edit, through `replaceDocument`, so the session validates it and one undo takes all of
 * it back.
 */
export function addOtherOption(session: BuilderSession, keyPath: readonly string[]): CommandOutcome {
  const { text } = session
  const document = session.document()
  const path = keyPath.join('.')
  const found = locate(document, keyPath)
  const field = found?.siblings[found.index]
  if (found === undefined || field === undefined) return { ok: false, path, message: text('refuse.noField', { path }) }
  const name = nameOf(document, field)
  if (!CHOICES.has(field.type)) return { ok: false, path, message: text('refuse.otherNotAChoice', { name }) }
  if (!offersOther(field)) return { ok: false, path, message: text('refuse.otherTaken', { name }) }

  const key = uniqueKey(`${field.key}Other`, new Set(flatten(document).map((node) => node.def.key)))
  // A JSON round trip, as the session and blocks copy a document: it is JSON by definition.
  const next = JSON.parse(JSON.stringify(document)) as FormSchema
  const siblings = locate(next, keyPath)!.siblings
  const choice = siblings[found.index]!
  // `keepPlace` arrived with version 5 (0200); an older document would be refused for it.
  const keepsPlace = Number(next.specVersion) >= 5 ? { keepPlace: true } : {}
  choice.options = [...(choice.options ?? []), { value: 'other', label: text('other.option'), ...keepsPlace }]
  siblings.splice(found.index + 1, 0, { key, type: 'text', label: text('other.specify') })

  const { target } = ruleTargetFor(next, [...keyPath.slice(0, -1), key])
  const draft: ConditionDraft = {
    join: 'all',
    items: [{ field: ruleTargetFor(next, keyPath).target, operator: field.type === 'selectboxes' ? 'includes' : 'is', text: 'other' }],
  }
  const fields = conditionFields(next, { target, text })
  const rule = (kind: 'visible' | 'required'): LogicRule => composeRule({ kind, target, draft, fields, check: '' })
  next.logic = { rules: [...(next.logic?.rules ?? []), rule('visible'), rule('required')] }
  return session.replaceDocument(next)
}
