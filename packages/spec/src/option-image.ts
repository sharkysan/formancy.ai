import type { FieldDef } from './types.js'

/**
 * An option's picture: where it may come from, and where it can be shown.
 *
 * Two questions three readers ask — the validator, both renderers, and the builder
 * deciding whether to offer a picture at all — so each has one answer here
 * ([0126](../../../docs/decisions/0126-an-option-may-carry-a-picture.md)).
 */

/**
 * Why a field's options cannot show a picture, as the validator's code for it — or
 * `undefined` when they can.
 *
 * A dropdown's options are text, and a tag picker's are chips. A picture on either
 * would validate and show nothing, which is the documented-but-inert failure, so the
 * validator refuses it and the builder does not offer it.
 */
export function optionImageRefusal(
  field: Pick<FieldDef, 'type' | 'widget'>,
): 'option.imageInDropdown' | 'option.imageInChips' | 'option.imageNotDrawn' | undefined {
  if (field.type === 'select') return 'option.imageInDropdown'
  // A ranking draws its options as buttons and a matrix as columns of radios, and neither
  // has room for a picture. The ranking accepted one it never drew when it shipped (0139).
  if (field.type === 'ranking' || field.type === 'matrix') return 'option.imageNotDrawn'
  if (field.type === 'selectboxes' && field.widget === 'tagpicker') return 'option.imageInChips'
  return undefined
}

/** Whether a field's own options can carry a picture: radio buttons and checkboxes. */
export function showsOptionImages(field: Pick<FieldDef, 'type' | 'widget'>): boolean {
  return (
    (field.type === 'radio' || field.type === 'selectboxes') &&
    optionImageRefusal(field) === undefined
  )
}

/**
 * Whether an option's picture comes from somewhere a form may load it from.
 *
 * The same pattern the JSON Schema states for `imageSource` — `option-image-source.test.ts`
 * reads it from the schema and fails when the two differ — so a renderer asks the
 * question the validator already answered, rather than a second one of its own.
 *
 * Both renderers ask it before drawing a picture. The engine assumes a document that
 * passed the validator, and a host can hand a renderer one that never met it; left to
 * each framework, the two would each decide for themselves which addresses to load —
 * Angular's sanitizer, measured, refuses `javascript:` and nothing else. One answer,
 * the format's, means one set of pictures in both
 * ([0126](../../../docs/decisions/0126-an-option-may-carry-a-picture.md)).
 */
export const IMAGE_SOURCE =
  /^(https:\/\/[^\s]+|\/[^/\s][^\s]*|data:image\/(png|jpeg|gif|webp|avif|svg\+xml)[;,].+)$/u

export function isImageSource(source: string): boolean {
  return IMAGE_SOURCE.test(source)
}
