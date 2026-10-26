import type { Message } from './messages.js'

/**
 * The words for duplicating a field and changing its type (0192).
 *
 * Part of the one catalogue — `BUILDER_MESSAGES` composes this with the rest — and in a
 * file of its own because these commands change for their own reasons, and `messages.ts`
 * was near its size budget when they arrived.
 */
export const FIELD_EDIT_MESSAGES = {
  'keys.duplicate.what': 'duplicate the focused field',
  'retype.label': 'Kind of question',
  'said.duplicated': 'Duplicated {name}.',
  'said.cannotDuplicate': 'Cannot duplicate {name}: {reason}',
  /** `{type}` is the palette's word for the type, "Multi-line text". */
  'said.retyped': 'Changed {name} to {type}.',
  'said.cannotRetype': 'Cannot change {name}: {reason}',
  'refuse.retypeContainer': '{name} holds other fields, so it cannot become another kind of question.',
  'refuse.retypeToContainer': 'A question cannot become a {type}: that would mean inventing the fields inside it.',
} as const satisfies Record<string, Message>
