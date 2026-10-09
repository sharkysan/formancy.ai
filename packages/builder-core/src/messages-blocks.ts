import type { Message } from './messages.js'

/**
 * The words for blocks: a piece of a form saved to use again (0135).
 *
 * Part of the one catalogue — `BUILDER_MESSAGES` composes this with the rest — and in a
 * file of its own because blocks change for their own reasons, and `messages.ts` was near
 * its size budget when they arrived.
 */
export const BLOCK_MESSAGES = {
  'keys.block.what': 'save the focused field as a block',
  'blocks.heading': 'Your blocks',
  'blocks.none': 'No blocks yet. Save a field or a group as a block to use it again.',
  'blocks.save': 'Save as a block',
  'blocks.name': 'Block name',
  'blocks.saveConfirm': 'Save block',
  'blocks.addWhere': 'Add the block “{name}” where?',
  'said.blockSaved': {
    one: 'Saved “{name}” as a block, without the {count} rule that reads fields outside it.',
    other: 'Saved “{name}” as a block, without the {count} rules that read fields outside it.',
  },
  'said.blockSavedWhole': 'Saved “{name}” as a block.',
  'said.blockAdded': 'Added the block “{name}” to {where}.',
  'refuse.blockIsPage': 'A page is not a block: save a field, or a group or repeater of fields.',
  'refuse.blockInRow':
    'A field inside a repeater row cannot be saved as a block: its rules are about every row.',
  'refuse.blockRulesInRow':
    'A block with rules cannot go inside a repeater row: its rules would be about every row.',
} as const satisfies Record<string, Message>
