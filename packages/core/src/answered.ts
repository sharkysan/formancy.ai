import type { FieldDef } from '@formancy/spec'

/**
 * Whether a field's value leaves its question unanswered — what `required` refuses.
 *
 * Per type, because "nothing" looks different for each, and that is the reason this changes:
 * a new type brings its own idea of an answer, as the matrix did. Apart from the engine,
 * whose graph never needs to know.
 */
export function unanswered(def: Pick<FieldDef, 'type' | 'rows'>, value: unknown): boolean {
  // A required checkbox is a consent gate: only an actual tick satisfies it.
  if (def.type === 'checkbox') return value !== true
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  // A required list answer needs something in it. An empty array is how a
  // selectboxes field with nothing ticked and a file field with nothing
  // attached both arrive, and `[]` is not an answer.
  if (Array.isArray(value)) return value.length === 0
  // A matrix asks one question per row, so a required one is answered when every row is
  // (0139): half a matrix is not an answer to it.
  if (def.type === 'matrix') {
    const answer = value as Record<string, unknown>
    return (def.rows ?? []).some((row) => typeof answer[row.value] !== 'string')
  }
  // A signature is an object either way, so the generic `return false` below
  // would accept `{ drawn: [] }` — an empty canvas presented as a signature.
  // "Sign here" is usually the one question on a form that is not optional,
  // and a form that accepts that is collecting consent nobody gave. A stroke
  // with no points in it is how an empty canvas arrives when a pointer went
  // down and came straight back up.
  if (def.type === 'signature') {
    const answer = value as { drawn?: unknown; typed?: unknown }
    if (typeof answer.typed === 'string') return answer.typed.trim() === ''
    if (Array.isArray(answer.drawn)) {
      return answer.drawn.every((stroke) => Array.isArray(stroke) && stroke.length === 0)
    }
    return true
  }
  return false
}
