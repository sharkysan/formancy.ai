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
  /** `{kind}` is the rule kind's own word, as in `refuse.ruleCannotFollow`. */
  'refuse.precisionRule':
    'Rule {number} (“{kind}” on “{target}”) compares “{field}” with “{other}”, which cannot be written at the new precision without changing its value. Change or delete the rule first.',
  'refuse.precisionForm':
    'Rule {number} (“{kind}” on “{target}”) compares “{field}” with a text written in a form the builder does not rewrite, such as one with an escape in it. Write the text plainly, then change the precision.',
  'refuse.precisionPair':
    'Rule {number} (“{kind}” on “{target}”) compares “{field}” with “{other}”, and a rule compares two answers as text, which is right only while both have one precision. Give both the same precision: remove the rule, change both fields, then write the rule again.',
} as const satisfies Record<string, Message>
