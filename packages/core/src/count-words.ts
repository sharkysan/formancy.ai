import type { FieldDef } from '@formancy/spec'
import { showsCount } from './counted.js'
import type { FormText } from './words.js'

/*
 * What a field with a `maxLength` says under its box (0203): the limit while it is empty, then
 * what is left, then how many too many — so the limit is met while typing rather than in the
 * error after it. One function both renderers call, as `errorSentence` is.
 *
 * Counted as the engine's `maxLength` check counts — the string's `length` — so the count never
 * says something is left of an answer the engine refuses. `undefined` where no count is shown.
 */
export function countSentence(text: FormText, def: FieldDef, value: unknown): string | undefined {
  if (!showsCount(def)) return undefined
  const limit = def.maxLength!
  const typed = typeof value === 'string' ? value.length : 0
  if (typed === 0) return text('count.limit', { count: limit })
  return typed <= limit ? text('count.left', { count: limit - typed }) : text('count.over', { count: typed - limit })
}
