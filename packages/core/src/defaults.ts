import { modelDataFields } from '@formancy/spec'
import type { FieldDef, FormModel, FormSchema } from '@formancy/spec'
import { modelViolations } from './model-validators.js'
import type { Path } from './path.js'
import type { ValueStore } from './store.js'

/*
 * A field's `default`: the answer something fresh starts with (0197).
 *
 * **Fresh only** — a form opened with nothing handed in, a row added, a field shown again after
 * its hiding cleared it. A draft, a prefill and the server's replay of a submission are states
 * that already exist, and filling one would put back an answer somebody cleared or, on the
 * server, store an answer nobody sent. So the engine fills nothing it is handed, and a host that
 * wants a prefill to start as a new form would asks for that with `withDefaults`.
 *
 * Apart from the engine because it is a question of the model alone — which answers start
 * where — and the rows need it as much as the engine does. Block comments below rather than
 * JSDoc, except on what a host imports, which an editor shows from the declarations.
 */

/**
 * `value` with every absent answer that has a default filled in, as a new form would start —
 * for a prefill. Absent only: `null` is an answer somebody cleared, and stays cleared (0197).
 */
export function withDefaults(schema: FormSchema, value: unknown): Record<string, unknown> {
  return filled(schema.model.fields, isObject(value) ? value : {})
}

/*
 * One level of answers, filled: inside a group in its object, inside a page beside its
 * siblings, in every row a repeater already holds. What the engine starts a new form with,
 * from `{}`, and what `withDefaults` is, so the two cannot disagree about where a default goes.
 * Entries rather than assignment by key: a key is the document's.
 */
export function filled(fields: readonly FieldDef[], held: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const answers = new Map(Object.entries(held))
  for (const def of fields) {
    // A page scopes nothing: its fields' answers sit beside its siblings'.
    if (def.type === 'page') {
      for (const [key, answer] of Object.entries(filled(def.fields ?? [], Object.fromEntries(answers)))) {
        answers.set(key, answer)
      }
      continue
    }
    const answer = answers.get(def.key)
    if (def.type === 'group') {
      // A malformed group answer is the shape check's to refuse, not this to overwrite.
      if (answer !== undefined && !isObject(answer)) continue
      const inside = filled(def.fields ?? [], answer ?? {})
      if (answer !== undefined || Object.keys(inside).length > 0) answers.set(def.key, inside)
    } else if (def.type === 'repeater') {
      if (Array.isArray(answer)) {
        answers.set(def.key, answer.map((row: unknown) => (isObject(row) ? filled(def.fields ?? [], row) : row)))
      }
    } else if (answer === undefined && def.default !== undefined) {
      // A copy: a list ticked in one row must not tick the document's, or the next row
      // would start with what somebody chose in this one.
      answers.set(def.key, Array.isArray(def.default) ? [...def.default] : def.default)
    }
  }
  return Object.fromEntries(answers)
}

/*
 * A field shown again after its hiding cleared it opens as it opened the first time: with its
 * default, as a repeater opens again with its minimum (0023). One that kept its answer, or holds
 * one again, is left alone. True when it wrote one, so the rules run again over it.
 */
export function reopened(store: ValueStore, def: FieldDef | undefined, path: Path): boolean {
  if (def === undefined || def.clearOnHide === false || store.get(path) !== undefined) return false
  const fresh = filled([def], {})[def.key]
  if (fresh === undefined) return false
  store.set(path, fresh)
  return true
}

/** Whether the field would take its own default as an answer — by the check every answer gets (0197). */
export function acceptsDefault(def: FieldDef): boolean {
  return def.default === undefined || modelViolations(def, def.default).length === 0
}

/*
 * Why the engine will not open a document for one of its defaults, or undefined.
 *
 * Checked with `modelViolations`, the function every answer is checked with, browser and server
 * alike: a second set of rules for defaults would be a second opinion, and a default the field
 * then called wrong is an error on a question nobody has touched — or, unrequired and left
 * alone, an invalid answer submitted.
 */
export function refusedDefault(model: FormModel, computed: ReadonlySet<string>): string | undefined {
  for (const { path, def } of modelDataFields(model)) {
    if (def.default === undefined) continue
    // A computed field's value is the engine's (0181): the default would be overwritten
    // before anybody saw it.
    if (computed.has(path)) {
      return `"${path}" has a default and is computed, so the default would never be seen. Remove one of them.`
    }
    const codes = modelViolations(def, def.default)
    if (codes.length > 0) {
      return (
        `The default of "${path}", ${JSON.stringify(def.default)}, is not an answer the field accepts (${codes.join(', ')}). ` +
        'A default is submitted unless somebody changes it, so it must pass every check the field makes of an answer.'
      )
    }
  }
  return undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
