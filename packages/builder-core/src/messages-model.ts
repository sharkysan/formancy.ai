import type { Message } from './messages.js'

/**
 * The prompt pane's words: asking a model for a form, and saying what came of it.
 *
 * Part of the one catalogue — `BUILDER_MESSAGES` composes this with the rest — and in
 * a file of its own because what a run with a model can come to changes for its own
 * reasons: a stop and a model that could not be reached arrived together
 * ([0157](../../../docs/decisions/0157-a-models-turn-can-be-stopped.md)), when
 * `messages.ts` was near its size budget, and a model that declines came next
 * ([0158](../../../docs/decisions/0158-a-model-may-decline.md)), and then a model whose
 * turn a person carries, by copying the request out and the answer back
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)), and then a
 * model asked for the messages a language is missing
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)).
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
  // The form's examples, run against the proposal before it lands (0159). `{list}` is the
  // examples' own names, as the scenario pane shows them.
  'prompt.review.stops': {
    one: 'Review these changes — {count} scenario would stop holding: {list}',
    other: 'Review these changes — {count} scenarios would stop holding: {list}',
  },
  'prompt.review.costsStops': {
    one: 'Review these changes — some affect answers already collected, and {count} scenario would stop holding: {list}',
    other:
      'Review these changes — some affect answers already collected, and {count} scenarios would stop holding: {list}',
  },
  // In the review, under its heading: the words the run was asked with, which the box beside
  // it may no longer say once the person has typed something else (0163).
  'prompt.asked': 'In answer to “{instruction}”',
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
  // After the ready sentence, in the scenario pane's order: what stops before what holds.
  'prompt.status.wouldStop': 'Would stop holding if applied: {list}.',
  'prompt.status.wouldHold': 'Would hold again if applied: {list}.',
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
  // Nothing was asked: the host's model is answering another request — through the
  // playground's one relay, a draft of examples waiting (0162). The translations pane's
  // sentence too, since nothing was applied there either.
  'prompt.status.busy':
    'Nothing was applied. Another request is still waiting for the model’s answer: finish or stop that one first.',
  // The model said the format cannot express the request. Its reason is shown beneath,
  // as it wrote it, rather than set into this sentence.
  'prompt.status.declined': 'Nothing was applied. The model declined this request.',

  // The relay pane: a turn a person carries to a model of their own and back (0160). What
  // it says about what leaves is about the pane alone — the one thing this package can
  // stand behind on a page it never sees — and names no service, because the host names
  // the chat. Both builders' relay-pane tests hold that its Copy only writes the clipboard.
  'relay.title': 'Take this request to a model',
  'relay.turn': 'Turn {attempt} of at most {limit}',
  'relay.first': 'Copy the request into a chat with a model, then paste its whole answer below.',
  'relay.retry':
    'That answer did not work. Copy what was wrong into the same chat, then paste the new answer below.',
  // What THIS request carries, one sentence for each kind, chosen by `relayLeaves` (0167):
  // the requests carry different things, and one sentence for all three overstated two of
  // them. Each claim is checked in `relay.test.ts` against the request its run builds, so
  // a sentence changed here has to stay true of that request — in either direction.
  'relay.leaves.authoring':
    'This pane sends the request nowhere. Besides what the model is told about the format, the request carries your description and, when it changes a form, that whole form, its rules included. What you copy goes on your clipboard, and pasting it into a chat gives it to that service under your own account.',
  'relay.leaves.translation':
    'This pane sends the request nowhere. Besides what the model is told about the format, the request carries the messages this language is missing, where the form uses each, and the form’s translations into this language so far, but none of its rules. What you copy goes on your clipboard, and pasting it into a chat gives it to that service under your own account.',
  'relay.leaves.scenarios':
    'This pane sends the request nowhere. Besides what the model is told about the format, the request carries the form’s title, its fields with their labels and options, the error codes it can report, the answers examples start from, the names of its examples and what you said it should do, but none of its rules. What you copy goes on your clipboard, and pasting it into a chat gives it to that service under your own account.',
  'relay.system': 'What the model is told about the format',
  'relay.request': 'The request',
  'relay.copy': 'Copy the request',
  'relay.copyFollowUp': 'Copy what was wrong',
  'relay.copyAll': 'New chat? Copy the whole request',
  'relay.open': 'Open {name} in a new tab',
  'relay.answer': 'The model’s answer',
  'relay.check': 'Check this answer',
  'relay.anyway': 'Use it anyway',
  'relay.copied': 'Copied. Paste it into the chat.',
  'relay.copyRefused':
    'This browser did not let the page copy. The text is selected in the request box: copy it from there.',
  'relay.noObject':
    'There is no JSON object in that answer. Copy the whole answer, code block included, or use it anyway and the model is told.',

  // A model asked for the messages a language is missing, and its answer reviewed message by
  // message (0161). The source column is headed by the language's tag, as the translations
  // table is, so it has no word here.
  'translate.ask': {
    one: 'Ask a model for the {count} missing message',
    other: 'Ask a model for the {count} missing messages',
  },
  'translate.asking': 'Asking…',
  'translate.review': 'Review these translations into {locale}',
  'translate.review.marked': 'Review these translations into {locale} — some are marked to look at',
  'translate.was': 'Before',
  'translate.now': 'Proposed',
  'translate.flags': 'To look at',
  'translate.flag.stale': 'Translated from wording that has since changed',
  'translate.flag.unchanged': 'The same as the source',
  'translate.apply': 'Apply these translations',
  'translate.rest': 'Translate the rest',
  'translate.preview': 'Preview in {locale}, as proposed',
  'translate.dropped':
    'Not written, because nobody asked for them or a person has translated them since: {list}',
  'translate.status.asking': 'Asking for the missing translations, and checking the answer.',
  // Said by a part drawn on another language than a held run's, and nothing else of it is
  // drawn there (0164).
  'translate.status.elsewhereAsking': 'A model is translating into {locale}. Choose {locale} to follow it, or to stop it.',
  'translate.status.elsewhereHeld':
    'A model’s translation into {locale} is waiting for review. Choose {locale} to review it. Nothing has been applied.',
  // Said, with Stop or Discard beside it, by a part on any language once the run's own has
  // left the form — undone, or removed — and cannot be chosen (0164).
  'translate.status.goneAsking':
    'A model is translating into {locale}, which is no longer one of the form’s languages. Stop it here, or add {locale} again to follow it.',
  'translate.status.goneHeld':
    'A model’s translation into {locale} is waiting for review, but {locale} is no longer one of the form’s languages. Discard it here, or add {locale} again to review it. Nothing has been applied.',
  'translate.status.ready': {
    one: 'Ready to review: {count} translation. Nothing has been applied.',
    other: 'Ready to review: {count} translations. Nothing has been applied.',
  },
  'translate.status.readyAfter': {
    one: 'Ready to review after {attempts} attempts: {count} translation. Nothing has been applied.',
    other: 'Ready to review after {attempts} attempts: {count} translations. Nothing has been applied.',
  },
  'translate.status.none': 'The model left every message untranslated. Nothing has been applied.',
  'translate.status.noneWritten': {
    one: 'The model translated {count} message, and it was not written: nobody asked for it, or a person has translated it since. Nothing has been applied.',
    other:
      'The model translated {count} messages, and none was written: nobody asked for them, or a person has translated them since. Nothing has been applied.',
  },
  'translate.status.stillMissing': {
    one: '{count} message is still missing.',
    other: '{count} messages are still missing.',
  },
  'translate.status.failed': {
    one: 'Nothing was applied. {count} attempt, and the answer was still not a catalogue for this language.',
    other:
      'Nothing was applied. {count} attempts, and the answer was still not a catalogue for this language.',
  },
} as const satisfies Record<string, Message>
