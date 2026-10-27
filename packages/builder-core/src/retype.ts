import type { FieldDef, FieldType } from '@formancy/spec'
import { ANSWER_KINDS, WIDGETS_BY_FIELD_TYPE } from '@formancy/spec'
import { acceptsDefault } from '@formancy/core'
import { locate } from './navigate.js'
import { newFieldOfType, paletteEntries } from './palette.js'
import type { PaletteEntry } from './palette.js'
import { editablePropertiesFor } from './properties.js'
import type { BuilderSession, CommandOutcome } from './session.js'
import { flatten, nameOf } from './tree.js'

/**
 * Change what kind of question the field at `keyPath` asks, keeping what still applies (0192).
 *
 * **What it keeps is what the property panel would offer for the new type** — the panel is
 * generated from the format's own JSON Schema, so the two cannot disagree about which
 * properties a type has. A select becoming radio buttons keeps its label, its `required`
 * and its options; a text field becoming a number loses its pattern. A widget the new type
 * does not take is dropped, since keeping it would make the change itself refused.
 *
 * **What the new type needs and the field lacks comes from the palette**: a choice gets the
 * first option a new radio group gets, a matrix its first row. One answer to "what does a new
 * field of this type look like", rather than a second.
 *
 * **Only between types that hold one answer.** A group, a page or a repeater holds other
 * fields: turning one into a question would throw them away, and the reverse would invent
 * them. Refused both ways, in words that say so.
 *
 * The answers already collected keep the old shape. The schema diff calls the change `lossy`
 * at publish, which is where an author is told what it costs: a draft resumed afterwards keeps
 * its answer, and the engine refuses one of the old shape as `type` (0189), so the person
 * answers that question again.
 */
export function changeFieldType(session: BuilderSession, keyPath: readonly string[], type: FieldType): CommandOutcome {
  const { text } = session
  const document = session.document()
  const found = locate(document, keyPath)
  const field = found?.siblings[found.index]
  const path = keyPath.join('.')
  if (found === undefined || field === undefined) {
    return { ok: false, path, message: text('refuse.noField', { path }) }
  }
  if (!holdsOneAnswer(field.type)) {
    return { ok: false, path, message: text('refuse.retypeContainer', { name: nameOf(document, field) }) }
  }
  if (!holdsOneAnswer(type)) {
    return { ok: false, path, message: text('refuse.retypeToContainer', { type: titleOf(type, session) }) }
  }

  // A JSON round trip, as the session and blocks copy a document: it is JSON by definition,
  // and this package runs without structuredClone in its lib on purpose.
  const next = JSON.parse(JSON.stringify(document)) as typeof document
  const siblings = locate(next, keyPath)!.siblings
  siblings[found.index] = retyped(field, type, session)
  return session.replaceDocument(next)
}

/** The types the field at `keyPath` may become: every single-answer type its version allows. */
export function retypeTargets(session: BuilderSession, keyPath: readonly string[]): PaletteEntry[] {
  const document = session.document()
  const found = locate(document, keyPath)
  const field = found?.siblings[found.index]
  if (field === undefined || !holdsOneAnswer(field.type)) return []
  return paletteEntries(document.specVersion, session.text).filter(
    (entry) => entry.type !== field.type && holdsOneAnswer(entry.type as FieldType),
  )
}

/** Change a field's type and say so, in the builder's language — the same words in both builders. */
export function retypeAndSay(session: BuilderSession, keyPath: readonly string[], type: FieldType): string {
  const document = session.document()
  const def = flatten(document).find((node) => node.keyPath.join('\u0000') === keyPath.join('\u0000'))?.def
  const name = def === undefined ? keyPath.join('.') : nameOf(document, def)
  const outcome = changeFieldType(session, keyPath, type)
  return outcome.ok
    ? session.text('said.retyped', { name, type: titleOf(type, session) })
    : session.text('said.cannotRetype', { name, reason: outcome.message })
}

/** A type whose field is one question, not a container of others. */
function holdsOneAnswer(type: FieldType): boolean {
  const { shape } = ANSWER_KINDS[type] ?? { shape: 'group' }
  return shape !== 'group' && shape !== 'page' && shape !== 'rows'
}

function retyped(field: FieldDef, type: FieldType, session: BuilderSession): FieldDef {
  const widgets: readonly string[] = (WIDGETS_BY_FIELD_TYPE as Partial<Record<FieldType, readonly string[]>>)[type] ?? []
  const widget = field.widget !== undefined && widgets.includes(field.widget) ? field.widget : undefined
  const offered = new Set(editablePropertiesFor(type, widget, session.text).map((property) => property.name))
  const kept = Object.fromEntries(
    Object.entries(field).filter(([name]) => name === 'key' || name === 'renamedFrom' || offered.has(name)),
  )
  // What a new field of this type starts with, under what the field already had.
  const { key: _key, label: _label, ...starting } = newFieldOfType(type, new Set(), session.text)
  const next = { ...starting, ...kept, type } as FieldDef
  if (widget === undefined) delete next.widget
  // A default is an answer, so it stays only if the new field would take it as one (0197):
  // a number's 2 on a text field is a document the format refuses, and a text's "Zürich" on
  // a select is not one of the options it now has.
  if (!acceptsDefault(next)) delete next.default
  return next
}

function titleOf(type: string, session: BuilderSession): string {
  return paletteEntries(undefined, session.text).find((entry) => entry.type === type)?.title ?? type
}
