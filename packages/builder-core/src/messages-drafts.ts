import type { Message } from './messages.js'

/**
 * The drafting part's words: asking a model for a form's examples, and what came of it.
 *
 * Part of the one catalogue — `BUILDER_MESSAGES` composes it — and a file of its own,
 * with its German and French beside it in `messages-drafts-de.ts` and
 * `messages-drafts-fr.ts`, because drafting examples changes for its own reasons and the
 * three catalogues it would otherwise join are near their size budget
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 *
 * `{item}` in a reason is the item's name, or `drafts.item` when it has none.
 */
export const DRAFT_MESSAGES = {
  'drafts.title': 'Draft examples with a model',
  'drafts.label': 'What should this form do? In your own words',
  'drafts.example': 'Switzerland asks for a canton, and nowhere else does',
  // What the request does not carry, said where the person types: the reason the drafts
  // are worth checking against the form at all. A property of the request, because that is
  // all this package can stand behind: a model that saw the form earlier in the same chat
  // has seen its rules, and only the person can prevent that (SAFETY-ANALYSIS D10a).
  'drafts.withheld':
    'The request carries this form’s fields and your words, never its rules: an example written from a rule agrees with it whether the rule is right or not. If you carry it to a chat, start a new one: a model that has already seen the form there has seen its rules.',
  'drafts.write': 'Draft examples',
  'drafts.writing': 'Drafting…',
  'drafts.stop': 'Stop drafting',
  'drafts.list': 'Drafted examples',
  'drafts.holds': 'Holds against the form as it is.',
  'drafts.fails':
    'Does not hold against the form as it is. Keep it if the example is right and the form is wrong; discard it if the example is wrong.',
  'drafts.keep': 'Keep {name}',
  'drafts.discard': 'Discard {name}',
  'drafts.lastAnswer': 'What the model last answered',

  'drafts.status.writing': 'Drafting examples, and reading them.',
  'drafts.status.ready': {
    one: '{count} example drafted. None is kept until you keep it.',
    other: '{count} examples drafted. None is kept until you keep it.',
  },
  'drafts.status.unusable': {
    one: '{count} item in the answer could not be used.',
    other: '{count} items in the answer could not be used.',
  },
  'drafts.status.kept': 'Kept {name}. It is in the list of scenarios now.',
  'drafts.status.discarded': 'Discarded {name}.',
  'drafts.status.taken': 'Not kept: there is already a scenario called {name}.',
  'drafts.status.unknownPath':
    'Not kept: {name} names a field this form does not have, so it would check nothing.',
  'drafts.status.stopped': 'Stopped. Nothing was drafted.',
  'drafts.status.unreachable': 'Nothing was drafted. The model could not be reached: {reason}',
  'drafts.status.unreachableNoReason': 'Nothing was drafted. The model could not be reached.',
  'drafts.status.busy':
    'Nothing was drafted. Another request is still waiting for the model’s answer: finish or stop that one first.',
  'drafts.status.declined': 'Nothing was drafted. The model declined this request.',
  'drafts.status.failed': {
    one: 'Nothing was drafted. {count} attempt, and the answer held no example that could be used.',
    other: 'Nothing was drafted. {count} attempts, and no answer held an example that could be used.',
  },

  'drafts.problem.notJson': 'The last answer held no JSON object.',
  'drafts.problem.unexplained': 'The last answer declined without saying why.',
  'drafts.problem.noList': 'The last answer held no list of examples.',
  'drafts.problem.empty': 'The last answer’s list of examples was empty.',
  'drafts.item': 'Item {position}',
  'drafts.reason.notAnObject': '{item} is not an example at all.',
  'drafts.reason.unknownKey':
    '{item} has “{part}”, which an example does not have, so it would check less than it says.',
  'drafts.reason.noName': '{item} has no name.',
  'drafts.reason.nameTaken': '{item}: a scenario with this name already exists.',
  'drafts.reason.nameRepeated': '{item}: an example before it in the answer has the same name.',
  'drafts.reason.noChanges': '{item} sets no answers.',
  'drafts.reason.noVerdict': '{item} does not say whether the form should be valid.',
  'drafts.reason.malformed': '{item}: its “{part}” is not what an example holds there.',
} as const satisfies Record<string, Message>

export type DraftMessageId = keyof typeof DRAFT_MESSAGES
