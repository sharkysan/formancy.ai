import type { Message } from './messages.js'

/**
 * The prompt pane's words: asking a model for a form, and saying what came of it.
 *
 * Part of the one catalogue — `BUILDER_MESSAGES` composes this with the rest — and in
 * a file of its own because what a run with a model can come to changes for its own
 * reasons: a stop and a model that could not be reached arrived together
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)), when
 * `messages.ts` was near its size budget.
 */
export const MODEL_MESSAGES = {
  'prompt.label': 'Describe the form, or the change you want',
  'prompt.example':
    'A contact form with an email address and a message, and a phone number only if they ask to be called back',
  'prompt.write': 'Write it',
  'prompt.writing': 'Writing…',
  'prompt.stop': 'Stop',
  'prompt.review': 'Review these changes',
  'prompt.review.costs': 'Review these changes — some affect answers already collected',
  'prompt.apply': 'Apply these changes',
  'prompt.discard': 'Discard',
  'prompt.lastAnswer': 'What the model last answered',
  'prompt.status.writing': 'Writing the form, and checking it.',
  'prompt.status.refused': 'Not applied. {reason}',
  'prompt.status.ready': {
    one: 'Ready to review: {count} change, which does not affect answers already collected. Nothing has been applied.',
    other:
      'Ready to review: {count} changes, none of which affect answers already collected. Nothing has been applied.',
  },
  'prompt.status.readyCosts': {
    one: 'Ready to review: {count} change, and it affects answers already collected. Nothing has been applied.',
    other:
      'Ready to review: {count} changes, and some of them affect answers already collected. Nothing has been applied.',
  },
  // Said when the model needed correcting: one to read more carefully.
  'prompt.status.readyAfter': {
    one: 'Ready to review after {attempts} attempts: {count} change, which does not affect answers already collected. Nothing has been applied.',
    other:
      'Ready to review after {attempts} attempts: {count} changes, none of which affect answers already collected. Nothing has been applied.',
  },
  'prompt.status.readyAfterCosts': {
    one: 'Ready to review after {attempts} attempts: {count} change, and it affects answers already collected. Nothing has been applied.',
    other:
      'Ready to review after {attempts} attempts: {count} changes, and some of them affect answers already collected. Nothing has been applied.',
  },
  'prompt.status.failed': {
    one: 'Nothing was applied. {count} attempt, and the document still did not work.',
    other: 'Nothing was applied. {count} attempts, and the document still did not work.',
  },
  // Not a document that failed: the person ended the run, or the host's model could
  // not be asked at all. `{reason}` is what the host's model threw, as it said it;
  // when what it threw said nothing, the sentence without one.
  'prompt.status.stopped': 'Stopped. Nothing was applied.',
  'prompt.status.unreachable': 'Nothing was applied. The model could not be reached: {reason}',
  'prompt.status.unreachableNoReason': 'Nothing was applied. The model could not be reached.',
} as const satisfies Record<string, Message>
