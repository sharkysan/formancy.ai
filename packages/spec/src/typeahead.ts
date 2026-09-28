/**
 * Narrowing a long option list by what somebody typed — the one piece of the
 * `typeahead` widget that is not markup.
 *
 * Shared by both renderers rather than written twice, so a filter cannot fold text one
 * way in React and another in Angular
 * ([0072](../../../docs/decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)).
 * No collator: the isomorphic packages have no DOM and no Node library
 * ([0008](../../../docs/decisions/0008-layered-packages.md)).
 */

/**
 * Text as it is compared: lower case, with the diacritics dropped.
 *
 * NFD splits a letter into its base and its combining marks and `\p{M}` removes the
 * marks, so `Zürich` and `zurich` are the same text to a filter and a pasted `ü` folds
 * the same whether it arrived as one code point or two.
 *
 * **This is folding, not collation.** A character that decomposes to nothing is left as
 * it is, so `ß` is not `ss` and the Turkish dotless `ı` folds the Latin way. Both limits
 * have failing cases attached in `typeahead.test.ts`.
 */
export function foldForMatch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * The options whose LABEL contains the query, in the order they were declared.
 *
 * **The label and nothing else**: the value is not on the screen, so matching it would
 * make the filter behave on data the person cannot see.
 *
 * **The declared order and never a ranking.** A score would move the row somebody is
 * already reaching for while they type.
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
