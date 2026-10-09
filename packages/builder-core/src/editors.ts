import type { FieldOption, LayoutNode } from '@formancy/spec'
import type { BuilderText } from './messages.js'

/**
 * What the property editors decide, decided once for both builders.
 *
 * Small, and here for the reason everything else in this package is: each was
 * written twice, once per builder, and two copies of a decision are two answers
 * waiting to differ ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 * Both were also English written into the code
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */

/**
 * The choice "Add a choice" adds.
 *
 * A value nothing else uses: two choices sharing one store the same answer, and
 * the validator refuses the form rather than the keystroke, so the author would
 * learn about it at publish. And a label, because the schema requires a
 * non-empty one — a choice added without would be refused, the document would
 * not change, and the button would look broken. The label is written into the
 * document, so it is in the author's language.
 */
export function nextChoice(options: readonly FieldOption[], text: BuilderText): FieldOption {
  const taken = new Set(options.map((option) => String(option.value)))
  let n = options.length + 1
  while (taken.has(`option-${String(n)}`)) n += 1
  return { value: `option-${String(n)}`, label: text('options.newChoice') }
}

/**
 * What the layout property panel calls the node it edits.
 *
 * Not the node's own `label`: that is one of the properties the panel edits, so
 * it would be empty exactly when somebody is about to set it and would change
 * under them as they typed.
 */
/**
 * A choice with its picture changed, as both options editors change it (0126).
 *
 * An empty address takes the picture away, rather than leaving an image with nowhere
 * to load from — which the validator would refuse, so the edit would be refused and
 * the box would snap back while the person was clearing it. An empty description
 * leaves the picture as decoration rather than describing it as nothing. And the
 * description goes with the picture: with no address there is nothing to describe.
 */
export function withPicture(
  option: FieldOption,
  change: { src?: string; alt?: string },
): FieldOption {
  const src = change.src ?? option.image?.src ?? ''
  const alt = change.alt ?? option.image?.alt
  const { image: _, ...rest } = option
  if (src === '') return rest
  return { ...rest, image: { src, ...(alt === undefined || alt === '' ? {} : { alt }) } }
}

export function layoutPropertyHeading(kind: LayoutNode['kind'], text: BuilderText): string {
  return text(`layoutProps.heading.${kind}`)
}
