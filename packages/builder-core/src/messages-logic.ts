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
  /** A field in the same repeater row as the rule being written: whose answer it is. */
  'logic.field.inRow': '{field} in this row',
  // ------------------------------------------------- every rule in the form, and why
  'overview.heading': 'Every rule in this form',
  'overview.empty': 'This form has no rules: every field always behaves the same way.',
  'overview.written': 'Written as',
  'overview.comparison': '{field} {operator} {value}',
  'overview.comparison.noValue': '{field} {operator}',
  'overview.notAnswered': 'not answered',
  'overview.because.holds': '{comparison}: yes',
  'overview.because.fails': '{comparison}: no — it is {actual}',
  'overview.because.failsEmpty': '{comparison}: no — it is not answered',
  'overview.now.visible.holds': 'Shown now.',
  'overview.now.visible.fails': 'Hidden now.',
  'overview.now.visible.undecided':
    'Shown now, because the rule cannot be decided: a rule that fails shows the field it was meant to hide.',
  'overview.now.required.holds': 'Required now.',
  'overview.now.required.fails': 'Not required now.',
  'overview.now.required.undecided': 'Not required now, because the rule cannot be decided.',
  'overview.now.disabled.holds': 'Disabled now.',
  'overview.now.disabled.fails': 'Enabled now.',
  'overview.now.disabled.undecided': 'Enabled now, because the rule cannot be decided.',
  'overview.now.validate.holds': 'Accepted now.',
  'overview.now.validate.fails': 'Rejected now.',
  'overview.now.validate.undecided':
    'Rejected now, because the rule cannot be decided: a check that fails refuses the answer.',
  'overview.now.skip.holds': 'Skipped now.',
  'overview.now.skip.fails': 'Not skipped now.',
  'overview.now.skip.undecided': 'Not skipped now, because the rule cannot be decided.',
} as const satisfies Record<string, Message>
