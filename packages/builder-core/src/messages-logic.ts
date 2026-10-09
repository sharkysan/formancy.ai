import type { Message } from './messages.js'

/**
 * The logic editor's words: what it calls a rule, a comparison and a group, and the
 * sentence under each kind of rule.
 *
 * Part of the one catalogue — `BUILDER_MESSAGES` is this and the rest, composed — and
 * in a file of its own because the logic editor's vocabulary changes for its own
 * reasons, a comparison or a kind of rule at a time
 * ([0127](../../../docs/decisions/0127-a-condition-nests-one-level.md)). It left
 * `messages.ts` when that file's size budget refused the comparisons this added.
 */
export const LOGIC_MESSAGES = {
  // ------------------------------------------------------------------ the logic panel
  'logic.heading': 'Rules',
  'logic.empty': 'This field always behaves the same way.',
  'logic.remove': 'Remove the rule “{rule}” on {target}',
  'logic.add': 'Add a rule',
  'logic.what': 'What the rule does',
  'logic.check': 'Which check',
  // Examples in the box, not values: a check's name and a calculation in CEL.
  'logic.check.example': 'email-not-taken',
  'logic.calculation': 'The calculation',
  'logic.calculation.example': 'qty * unitPrice',
  'logic.match': 'Match',
  'logic.join.all': 'all of these',
  'logic.join.any': 'any of these',
  'logic.field': 'Field',
  'logic.field.numbered': 'Field {number}',
  'logic.comparison': 'Comparison',
  'logic.comparison.numbered': 'Comparison {number}',
  'logic.value': 'Value',
  'logic.value.numbered': 'Value {number}',
  'logic.removeComparison': 'Remove comparison {number}',
  'logic.addComparison': 'Add a comparison',
  'logic.addRule': 'Add rule',
  // ---------------------------------------------------------------- rule kinds
  'rule.visible.label': 'Show this field when',
  'rule.visible.hint': 'Hidden otherwise, and its answer is cleared unless the field says not to.',
  'rule.required.label': 'Require an answer when',
  'rule.required.hint': 'Only while the condition holds.',
  'rule.disabled.label': 'Disable this field when',
  'rule.disabled.hint': 'Visible but not editable.',
  'rule.validate.label': 'Reject the answer unless',
  'rule.validate.hint': 'The condition must hold for the form to be submitted.',
  'rule.check.label': 'Ask the deployment about the answer',
  'rule.check.hint':
    'Names a check this deployment answers — is this email already registered, does this reference exist. A check the deployment has not supplied refuses the answer rather than passing it.',
  'rule.computed.label': 'Calculate this field as',
  'rule.computed.hint':
    'A CEL expression producing the answer, recomputed whenever what it reads changes. The field is filled in rather than asked, so what somebody typed is replaced.',
  'rule.skip.label': 'Skip this page when',
  'rule.skip.hint':
    'The page is walked past, in both directions, and the questions on it are neither asked nor validated.',

  // ----------------------------------------------------------------- operators
  'operator.is': 'is',
  'operator.isNot': 'is not',
  'operator.isMoreThan': 'is more than',
  'operator.isLessThan': 'is less than',
  'operator.isAnswered': 'is answered',
  'operator.isNotAnswered': 'is not answered',
  'operator.isAtLeast': 'is at least',
  'operator.isAtMost': 'is at most',
  'operator.isBefore': 'is before',
  'operator.isAfter': 'is after',
  'operator.contains': 'contains',
  'operator.doesNotContain': 'does not contain',
  'operator.includes': 'includes',
  'operator.doesNotInclude': 'does not include',
  // ------------------------------------------------------- groups of comparisons
  'logic.addGroup': 'Add a group',
  'logic.group': 'Group {number}',
  'logic.group.match': 'In group {number}, match',
  'logic.group.add': 'Add a comparison to group {number}',
  'logic.group.remove': 'Remove group {number}',
  // ------------------------------------------------------- a value to compare with
  'logic.value.yes': 'Yes',
  'logic.value.no': 'No',
  'logic.value.choose': 'Choose a value',
} as const satisfies Record<string, Message>
