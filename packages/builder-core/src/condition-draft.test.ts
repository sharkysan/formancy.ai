import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import {
  addGroup,
  addRow,
  conditionFields,
  conditionOf,
  emptyDraft,
  emptyRow,
  groupOf,
  removeFromDraft,
  setJoin,
  updateRow,
} from './condition-draft.js'
import type { ConditionDraft, ConditionField } from './condition-draft.js'
import { compileGroup, operatorTakesValue } from './conditions.js'

/**
 * The condition being written, decided once for both logic panels (0127).
 *
 * Each case is an edit a person makes, and what it must not do to the condition:
 * offer a comparison the field cannot take, keep a value that no longer fits, leave
 * an empty group behind, or narrow a value by what it looks like rather than by the
 * field it is compared with.
 */
const form: FormSchema = {
  specVersion: '4',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'about',
        type: 'page',
        fields: [
          {
            key: 'country',
            type: 'select',
            label: 'Country',
            options: [
              { value: 'CH', label: 'Switzerland' },
              { value: '10', label: 'Ten' },
            ],
          },
          { key: 'age', type: 'number', label: 'Age' },
          { key: 'note', type: 'static', label: 'Read this' },
        ],
      },
      {
        key: 'address',
        type: 'group',
        fields: [{ key: 'city', type: 'text', label: 'City' }],
      },
      { key: 'terms', type: 'checkbox', label: 'Terms' },
      {
        key: 'extras',
        type: 'selectboxes',
        label: 'Extras',
        options: [{ value: 'wrap', label: 'Gift wrap' }],
      },
      { key: 'leave', type: 'date', label: 'Leaving' },
      {
        key: 'travellers',
        type: 'repeater',
        fields: [{ key: 'name', type: 'text', label: 'Name' }],
      },
      { key: 'shown', type: 'text', label: 'Shown' },
    ],
  },
} as FormSchema

const fields = conditionFields(form)
const field = (path: string): ConditionField => fields.find((candidate) => candidate.path === path)!

describe('the fields a condition may compare', () => {
  test('are named by the path the engine reads, so a field in a page is not "about.country"', () => {
    // Both panels joined the tree's key path: a condition on any field in a wizard
    // compared a path no field had, evaluated as null, and held its target hidden.
    expect(fields.map((candidate) => candidate.path)).toEqual([
      'country',
      'age',
      'address.city',
      'terms',
      'extras',
      'leave',
      'shown',
    ])
  })

  test('and leave out what has no answer, and the fields of a repeater row', () => {
    // A rule about the whole form cannot say which row it means.
    expect(fields.map((candidate) => candidate.path)).not.toContain('note')
    expect(fields.map((candidate) => candidate.path)).not.toContain('travellers[].name')
  })

  test('and carry what the field is, and the options a choice offers, by their labels', () => {
    expect(field('country')).toEqual({
      path: 'country',
      label: 'Country',
      kind: 'choice',
      options: [
        { value: 'CH', label: 'Switzerland' },
        { value: '10', label: 'Ten' },
      ],
    })
    expect(field('terms').kind).toBe('boolean')
    expect(field('extras').kind).toBe('list')
    expect(field('leave').kind).toBe('date')
  })
})

describe('a fresh comparison', () => {
  test('is aimed at the first field, with the first comparison that field takes', () => {
    // A row with no field is a row whose comparison and value mean nothing; and a
    // list's first comparison is "includes", because "is" means nothing to ticks.
    expect(emptyRow(fields)).toEqual({ field: 'country', operator: 'is', text: '' })
    expect(emptyRow([field('extras')]).operator).toBe('includes')
  })

  test('takes a value unless it asks about emptiness', () => {
    // The UI hides the value box when this is false; answering yes for "is
    // answered" would have an author type into a box whose contents are dropped.
    expect(operatorTakesValue('is')).toBe(true)
    expect(operatorTakesValue('isAnswered')).toBe(false)
    expect(operatorTakesValue('isNotAnswered')).toBe(false)
    // And yes for one it does not know: a box that may be unnecessary costs a
    // glance, and hiding one that is necessary costs the answer.
    expect(operatorTakesValue('invented' as never)).toBe(true)
  })
})

describe('an edit to a comparison', () => {
  const one = (row: Partial<ConditionDraft['items'][number]> = {}): ConditionDraft => ({
    join: 'all',
    items: [{ field: 'age', operator: 'isMoreThan', text: '18', ...row }],
  })

  test('to another field keeps the comparison where the new field takes it', () => {
    const next = updateRow(one({ operator: 'is' }), { at: 0 }, { field: 'shown' }, fields)

    expect(next.items[0]).toMatchObject({ field: 'shown', operator: 'is' })
  })

  test('and falls back to the new field’s first where it does not', () => {
    // "is more than" means nothing to text.
    expect(updateRow(one(), { at: 0 }, { field: 'shown' }, fields).items[0]).toMatchObject({
      operator: 'is',
    })
  })

  test('and clears the value when the new field takes a different kind of value', () => {
    // 18 typed against a number would be refused at save against a choice.
    expect(updateRow(one(), { at: 0 }, { field: 'country' }, fields).items[0]).toMatchObject({
      text: '',
    })
    // But not when it takes the same kind.
    const text = {
      join: 'all' as const,
      items: [{ field: 'shown', operator: 'is' as const, text: 'Bern' }],
    }
    expect(updateRow(text, { at: 0 }, { field: 'address.city' }, fields).items[0]).toMatchObject({
      text: 'Bern',
    })
  })
})

describe('a yes-or-no value', () => {
  test('starts as yes, which is what its control shows', () => {
    // The control can only show yes or no. Holding nothing while it showed "Yes"
    // compiled to `terms == false` — what was on screen and what was written disagreed.
    expect(emptyRow([field('terms')]).text).toBe('true')
    const switched = updateRow(emptyDraft(fields), { at: 0 }, { field: 'terms' }, fields)
    expect(switched.items[0]).toMatchObject({ field: 'terms', text: 'true' })
  })
})

describe('groups of comparisons', () => {
  test('a group starts with one comparison, and grows inside itself', () => {
    const draft = addRow(addGroup(emptyDraft(fields), fields), fields, 1)

    expect(draft.items[1]).toMatchObject({ join: 'all', rows: [{}, {}] })
  })

  test('joins its own way, apart from the condition around it', () => {
    const draft = setJoin(setJoin(addGroup(emptyDraft(fields), fields), 'any'), 'all', 1)

    expect(draft.join).toBe('any')
    expect(draft.items[1]).toMatchObject({ join: 'all' })
  })

  test('taking out its last comparison takes the group with it', () => {
    // An empty group is refused by the compiler rather than compiled to something
    // that always passes; leaving one would make the rule impossible to add.
    const draft = removeFromDraft(addGroup(emptyDraft(fields), fields), { at: 0, group: 1 })

    expect(draft.items).toHaveLength(1)
  })

  test('and the condition keeps its last comparison', () => {
    const draft = emptyDraft(fields)

    expect(removeFromDraft(draft, { at: 0 })).toBe(draft)
  })
})

describe('a comparison as a condition', () => {
  test('narrows the value by the field compared, not by what the text looks like', () => {
    // Narrowed by shape, the choice "10" became the number 10 and was compared to a
    // string field — a type error at save for a condition built correctly.
    expect(conditionOf({ field: 'country', operator: 'is', text: '10' }, fields).value).toBe('10')
    expect(conditionOf({ field: 'age', operator: 'is', text: '10' }, fields).value).toBe(10)
    expect(conditionOf({ field: 'terms', operator: 'is', text: 'true' }, fields).value).toBe(true)
    expect(conditionOf({ field: 'shown', operator: 'is', text: '5' }, fields).value).toBe('5')
  })

  test('a yes-or-no is a boolean, and only on a checkbox', () => {
    // Comparing a checkbox to "true" is a CEL type error caught at save time.
    expect(conditionOf({ field: 'terms', operator: 'is', text: 'true' }, fields).value).toBe(true)
    expect(conditionOf({ field: 'terms', operator: 'is', text: 'false' }, fields).value).toBe(false)
  })

  test('and an empty number box stays text rather than becoming zero', () => {
    // `Number('')` is 0, which would quietly match any answer of 0.
    expect(conditionOf({ field: 'age', operator: 'is', text: '' }, fields).value).toBe('')
  })

  test('and text that merely starts with digits stays text, even against a number', () => {
    // `Number('5 apples')` is NaN, which is false against everything, itself included.
    expect(conditionOf({ field: 'age', operator: 'is', text: '8001 Zurich' }, fields).value).toBe(
      '8001 Zurich',
    )
  })

  test('and carries no value for a comparison that takes none', () => {
    const condition = conditionOf(
      { field: 'shown', operator: 'isAnswered', text: 'ignored' },
      fields,
    )

    expect('value' in condition).toBe(false)
  })
})

/**
 * What the draft compiles to, run through the engine — the only opinion that counts.
 * Each case is a condition the editor builds and a form state it must answer.
 */
describe('what a draft compiles to, as the engine answers it', () => {
  const CLOCK = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

  const shownWhen = (draft: ConditionDraft, value: Record<string, unknown>): boolean =>
    createFormEngine({
      schema: {
        ...form,
        logic: {
          rules: [{ target: 'shown', kind: 'visible', cel: compileGroup(groupOf(draft, fields)) }],
        },
      } as FormSchema,
      initialValue: value,
      capabilities: CLOCK,
    }).getFieldSnapshot(['shown']).visible

  test('"(A and B) or C" asks what it says', () => {
    const draft: ConditionDraft = {
      join: 'any',
      items: [
        {
          join: 'all',
          rows: [
            { field: 'country', operator: 'is', text: 'CH' },
            { field: 'age', operator: 'isAtLeast', text: '18' },
          ],
        },
        { field: 'terms', operator: 'is', text: 'true' },
      ],
    }

    expect(shownWhen(draft, { country: 'CH', age: 20 })).toBe(true)
    expect(shownWhen(draft, { country: 'CH', age: 12 })).toBe(false)
    expect(shownWhen(draft, { country: 'DE', age: 12, terms: true })).toBe(true)
  })

  test('a comparison into a group hides its field on a form nobody has touched', () => {
    // Unguarded, `address.city == "Bern"` threw on an empty form, the rule failed
    // open, and the field it was meant to hide was shown.
    const draft: ConditionDraft = {
      join: 'all',
      items: [{ field: 'address.city', operator: 'is', text: 'Bern' }],
    }

    expect(shownWhen(draft, {})).toBe(false)
    expect(shownWhen(draft, { address: { city: 'Bern' } })).toBe(true)
  })

  test('and a bound on an empty number hides rather than fails open', () => {
    // `age > 18.0` has no overload for null, so it threw on an empty number too.
    const draft: ConditionDraft = {
      join: 'all',
      items: [{ field: 'age', operator: 'isMoreThan', text: '18' }],
    }

    expect(shownWhen(draft, {})).toBe(false)
    expect(shownWhen(draft, { age: 30 })).toBe(true)
  })

  test('a list with every tick taken off is not answered', () => {
    // Both renderers store it as [], and [] is not null.
    const draft: ConditionDraft = {
      join: 'all',
      items: [{ field: 'extras', operator: 'isAnswered', text: '' }],
    }

    expect(shownWhen(draft, { extras: [] })).toBe(false)
    expect(shownWhen(draft, { extras: ['wrap'] })).toBe(true)
  })

  test('and a tick is looked for among the ticks', () => {
    const draft: ConditionDraft = {
      join: 'all',
      items: [{ field: 'extras', operator: 'includes', text: 'wrap' }],
    }

    expect(shownWhen(draft, { extras: ['wrap'] })).toBe(true)
    expect(shownWhen(draft, {})).toBe(false)
  })

  test('a date is before or after, compared as the format writes it', () => {
    const draft: ConditionDraft = {
      join: 'all',
      items: [{ field: 'leave', operator: 'isBefore', text: '2026-12-01' }],
    }

    expect(shownWhen(draft, { leave: '2026-11-30' })).toBe(true)
    expect(shownWhen(draft, { leave: '2026-12-02' })).toBe(false)
    expect(shownWhen(draft, {})).toBe(false)
  })

  test('and text contains, or does not', () => {
    const contains: ConditionDraft = {
      join: 'all',
      items: [{ field: 'address.city', operator: 'contains', text: 'ern' }],
    }
    const without: ConditionDraft = {
      join: 'all',
      items: [{ field: 'address.city', operator: 'doesNotContain', text: 'ern' }],
    }

    expect(shownWhen(contains, { address: { city: 'Bern' } })).toBe(true)
    expect(shownWhen(without, { address: { city: 'Bern' } })).toBe(false)
    expect(shownWhen(without, {})).toBe(true)
  })
})
