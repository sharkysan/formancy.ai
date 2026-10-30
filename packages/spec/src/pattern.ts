/**
 * How a field's `pattern` runs: against the whole answer, with Unicode semantics.
 *
 * Here, in the data contract, because three things read a pattern and must read one
 * expression: the validator compiles it when a form is saved, the engine matches every
 * answer with it, and the server analyses it at publish for the backtracking that would
 * let one answer hold the CPU ([0045](../../../docs/decisions/0045-reject-backtracking-patterns.md)).
 * The analysis once read it without `u`, where `\p{L}` is the letter p and a brace, and
 * passed `(\p{L}+)+`, which the engine runs exponentially
 * ([0226](../../../docs/decisions/0226-a-pattern-is-analysed-as-it-runs.md)).
 */

/** `u`: `\p{L}` is any letter, and a character outside the Basic Multilingual Plane is one character. */
export const PATTERN_FLAGS = 'u'

/**
 * The expression a pattern runs as, anchored: a pattern describes the whole answer, and
 * `[A-Z]{3}` accepting "xxABCxx" is never what an author meant.
 *
 * Only for a pattern that compiles on its own, which the validator checks unwrapped:
 * wrapped, `a)|(b` compiles too, and means "starts with a, or ends with b".
 */
export function anchoredPattern(pattern: string): string {
  return `^(?:${pattern})$`
}
