import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import {
  RULE_KIND_CHOICES,
  composeRule,
  conditionOf,
  draftIsComplete,
  ruleKindsFor,
  ruleTargetFor,
} from './logic.js'
import { RULE_KINDS } from '@formancy/spec'

/**
 * What a builder offers when somebody writes a rule.
 *
 * This was a table and four helpers inside React's logic panel, which made every
 * one of them testable only by rendering a React tree — and made a second
 * builder a choice between importing React or writing the table again. Two
 * copies drift the first time the format grows a kind: one builder would offer
 * it, the other would not, and nobody using one of them could see the
 * difference.
 */
const paged: FormSchema = {
  specVersion: '3',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'about',
        type: 'page',
        label: 'About you',
        fields: [{ key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' }],
      },
      {
        key: 'visa',
        type: 'page',
        label: 'Visa details',
        fields: [{ key: 'passport', type: 'text', label: 'Passport' }],
      },
    ],
  },
} as unknown as FormSchema

describe('which kinds a builder offers', () => {
  test('covers every kind the format defines, so none is unreachable', () => {
    // Derived from the spec's own list. A kind added to the format and not to
    // this table is a kind no builder can write — which is the wizard's shape
    // all over again, and how `check` and `skip` shipped reachable only by hand.
    expect([...RULE_KIND_CHOICES].map((choice) => choice.id).sort()).toEqual(
      [...RULE_KINDS].sort(),
    )
  })

  test('offers a page only what a page can carry', () => {
    // `visible` on a page is refused by the validator — a page has no data path —
    // so offering it would be offering a choice refused every time.
    expect(ruleKindsFor('page').map((choice) => choice.id)).toEqual(['skip'])
  })

  test('and never offers a field the one that is about a page', () => {
    expect(ruleKindsFor('field').map((choice) => choice.id)).not.toContain('skip')
  })

  test('and every kind says what it does, in words rather than in its name', () => {
    for (const choice of RULE_KIND_CHOICES) {
      expect(choice.label.length, choice.id).toBeGreaterThan(6)
      expect(choice.hint.length, choice.id).toBeGreaterThan(20)
    }
  })
})

describe('what a rule on this node is addressed by', () => {
  test('a field inside a page is its DATA path, not its key path', () => {
    // The bug this replaces: the panel joined the key path, so a rule on
    // `about.needsVisa` was refused with "No field has the data path" — in the
    // builder, for as long as pages have existed.
    expect(ruleTargetFor(paged, ['about', 'needsVisa'])).toEqual({
      target: 'needsVisa',
      on: 'field',
    })
  })

  test('and a page is addressed by its key, because it carries no answer', () => {
    expect(ruleTargetFor(paged, ['visa'])).toEqual({ target: 'visa', on: 'page' })
  })
})

describe('what the editor composes', () => {
  test('a condition rule carries CEL and the structured form beside it', () => {
    const rule = composeRule({
      kind: 'visible',
      target: 'passport',
      rows: [{ field: 'needsVisa', operator: 'is', text: 'true' }],
      join: 'all',
      check: '',
    })

    expect(rule.kind).toBe('visible')
    expect(typeof rule.cel).toBe('string')
    // The CEL is the single source of truth and the structured form is metadata.
    // If both were evaluable, client and server could disagree about which one
    // meant what, which is the drift this project exists to prevent.
    expect(rule.editor).toBeDefined()
    expect(rule.check).toBeUndefined()
  })

  test('and a check carries a name and no expression at all', () => {
    const rule = composeRule({
      kind: 'check',
      target: 'email',
      rows: [],
      join: 'all',
      check: 'email-not-taken',
    })

    // A rule carrying both would be two rules in one object with no answer to
    // which verdict wins. The schema refuses it, so this does not compose it.
    expect(rule.check).toBe('email-not-taken')
    expect(rule.cel).toBeUndefined()
    expect(rule.editor).toBeUndefined()
  })

  test('a number typed into a box is compared as a number', () => {
    // Comparing a number field to "5" is a type error CEL catches at save time,
    // so the narrowing happens where the author can still see what happened.
    expect(conditionOf({ field: 'qty', operator: 'is', text: '5' }).value).toBe(5)
    expect(conditionOf({ field: 'ok', operator: 'is', text: 'true' }).value).toBe(true)
    expect(conditionOf({ field: 'name', operator: 'is', text: 'Zug' }).value).toBe('Zug')
  })

  test('and a comparison that takes no value carries none', () => {
    const condition = conditionOf({ field: 'note', operator: 'isAnswered', text: 'ignored' })

    expect('value' in condition).toBe(false)
  })
})

describe('when a draft is enough to add', () => {
  test('a condition rule needs every comparison to name a field', () => {
    expect(
      draftIsComplete({ kind: 'visible', rows: [{ field: '', operator: 'is', text: '' }], check: '' }),
    ).toBe(false)
  })

  test('and a check needs a name, because a check with none asks nobody', () => {
    expect(draftIsComplete({ kind: 'check', rows: [], check: '   ' })).toBe(false)
    expect(draftIsComplete({ kind: 'check', rows: [], check: 'visa-eligible' })).toBe(true)
  })

  test('and a calculation needs an expression, because an empty one calculates nothing', () => {
    expect(draftIsComplete({ kind: 'computed', rows: [], check: '', expression: ' ' })).toBe(false)
    expect(
      draftIsComplete({ kind: 'computed', rows: [], check: '', expression: 'qty * price' }),
    ).toBe(true)
  })

  test('a calculation is written as CEL and carries no editor metadata', () => {
    // The comparison editor composes booleans and did not write this, so it
    // cannot regenerate it — metadata claiming otherwise would be a lie the next
    // opening of the panel tells.
    const rule = composeRule({
      kind: 'computed',
      target: 'total',
      rows: [],
      join: 'all',
      check: '',
      expression: 'qty * price',
    })

    expect(rule.cel).toBe('qty * price')
    expect(rule.editor).toBeUndefined()
  })
})
