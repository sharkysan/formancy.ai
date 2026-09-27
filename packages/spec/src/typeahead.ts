/**
 * Narrowing a long option list by what somebody typed — the one piece of the
 * `typeahead` widget that is not markup.
 *
 * It sits in the spec package rather than in each renderer for the reason
 * `applyRichCommand` does: a **Bold** button may not mean one thing in React and
 * another in Angular, and neither may a filter. Two renderers each folding text
 * their own way would agree on `ber` and disagree on `uber`, and nothing would
 * fail — each renderer's tests would be green against its own folding.
 *
 * No dependency, and none available: the isomorphic packages have no DOM and no
 * Node library ([0008](../../../docs/decisions/0008-layered-packages.md)), and a
 * collator is not worth a runtime row in every consumer's SOUP declaration for a
 * filter over a list somebody is looking at.
 */

/**
 * Text as it is compared: lower case, with the diacritics dropped.
 *
 * NFD splits a letter into its base and its combining marks, `\p{M}` removes the
 * marks, and what is left is the base letter — so `Zürich` and `zurich` are the
 * same text to a filter, which is what somebody typing on a keyboard with no
 * umlaut needs. It also settles the composed/decomposed question: a pasted `ü`
 * may arrive as one code point or as two, and both fold to `u`.
 *
 * **This is folding, not collation.** A character that decomposes to nothing is
 * left exactly as it is, so `ß` is not `ss` and the Turkish dotless `ı` folds the
 * Latin way. Both are real limits and both are recorded in the tests rather than
 * only here, because a limit with no failing case attached is a limit somebody
 * removes by accident.
 */
export function foldForMatch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * The options whose LABEL contains the query, in the order they were declared.
 *
 * The label and nothing else: the value is not on the screen, so matching it
 * would make the filter behave on data the person cannot see — a row kept for a
 * reason nothing explains, and rows dropped for the same invisible reason.
 *
 * The declared order and never a ranking. A score would move the row somebody is
 * already reaching for while they type, and a list that reorders under the
 * pointer is a list that collects the wrong answer.
 *
 * A query that is empty or nothing but whitespace narrows nothing: a fumbled
 * space is not a filter, and an empty list is a control hiding its own options.
 */
export function narrowOptionsByLabel<T extends { label: string }>(
  options: readonly T[],
  query: string,
): readonly T[] {
  const needle = foldForMatch(query.trim())
  if (needle === '') return options
  return options.filter((option) => foldForMatch(option.label).includes(needle))
}
