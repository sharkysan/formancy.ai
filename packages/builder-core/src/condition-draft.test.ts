import { afterEach, describe, expect, test, vi } from 'vitest'
import { createFormEngine } from '@formancy/core'
import { crossWidthComparisons } from '@formancy/core/authoring'
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
  textOfLiteral,
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
}

const fields = conditionFields(form)
const field = (path: string): ConditionField => fields.find((candidate) => candidate.path === path)!

describe('the fields a condition may compare', () => {
  test('are named by the path the engine reads, so a field in a page is not "about.country"', () => {
    // Both panels joined the tree's key path: a condition on any field in a wizard
    // compared a path no field had, evaluated as null, and held its target hidden.
    expect(fields.map((candidate) => candidate.path)).toEqual(['country', 'age', 'address.city', 'terms', 'extras', 'leave', 'shown'])
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
    expect(conditionOf({ field: 'age', operator: 'is', text: '8001 Zurich' }, fields).value).toBe('8001 Zurich')
  })

  test('and carries no value for a comparison that takes none', () => {
    const condition = conditionOf({ field: 'shown', operator: 'isAnswered', text: 'ignored' }, fields)

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
      },
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

/**
 * A date and time is compared as the instant the author meant, wherever the author sits.
 *
 * The editor draws `datetime-local` for one, which hands back the author's own wall clock
 * with no zone and no seconds: `2026-10-08T10:30`. Written into the rule as typed, it was
 * compared as text with answers stored as UTC instants with seconds (`…T08:30:00Z`, 0067).
 * So the rule was off by the author's offset, and `is` matched nothing, because no
 * twenty-character answer equals a sixteen-character literal.
 *
 * Each case pins a zone. A runner on UTC would show only the width half of that.
 */
describe('a date and time compared', () => {
  const trip: FormSchema = {
    specVersion: '4',
    id: 'trip',
    title: 'Trip',
    model: {
      fields: [
        { key: 'departs', type: 'datetime', label: 'Departs' },
        { key: 'shown', type: 'text', label: 'Shown' },
      ],
    },
  }
  const tripFields = conditionFields(trip)
  const CLOCK = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

  // Put back by name. `vi.unstubAllEnvs()` deletes TZ, and Node keeps the zone it was last
  // given rather than returning to the one it started in (measured 2026-11-15, Node 24), so
  // a case pinned to New York would otherwise leave the rest of the file in New York.
  const started = Intl.DateTimeFormat().resolvedOptions().timeZone
  afterEach(() => {
    vi.stubEnv('TZ', started)
    vi.unstubAllEnvs()
  })

  const shownWhen = (draft: ConditionDraft, departs: string): boolean =>
    createFormEngine({
      schema: { ...trip, logic: { rules: [{ target: 'shown', kind: 'visible', cel: compileGroup(groupOf(draft, tripFields)) }] } },
      initialValue: { departs },
      capabilities: CLOCK,
    }).getFieldSnapshot(['shown']).visible

  const after = (text: string): ConditionDraft => ({ join: 'all', items: [{ field: 'departs', operator: 'isAfter', text }] })

  test('is written as the instant, at the width every answer has', () => {
    // Written as typed, Zurich's 10:30 was compared as 10:30 UTC, two hours late, and New
    // York's four hours early.
    vi.stubEnv('TZ', 'Europe/Zurich')
    expect(conditionOf({ field: 'departs', operator: 'isAfter', text: '2026-10-08T10:30' }, tripFields).value).toBe('2026-10-08T08:30:00Z')

    vi.stubEnv('TZ', 'America/New_York')
    expect(conditionOf({ field: 'departs', operator: 'isAfter', text: '2026-10-08T10:30' }, tripFields).value).toBe('2026-10-08T14:30:00Z')
  })

  test('so "is after" holds for an answer after it, and not for the moment itself', () => {
    // Against `"2026-10-08T10:30"`, the answer at 09:00 UTC (11:00 in Zurich, after the 10:30
    // the author typed) sorted before it and was not after, and the answer at the very moment
    // was after it, because a string sorts after its own prefix.
    vi.stubEnv('TZ', 'Europe/Zurich')

    expect(shownWhen(after('2026-10-08T10:30'), '2026-10-08T09:00:00Z')).toBe(true)
    expect(shownWhen(after('2026-10-08T10:30'), '2026-10-08T08:31:00Z')).toBe(true)
    expect(shownWhen(after('2026-10-08T10:30'), '2026-10-08T08:30:00Z')).toBe(false)
  })

  test('and "is" matches the answer the renderer stores for the same entry', () => {
    // The renderer stores 10:30 typed in Zurich as `2026-10-08T08:30:00Z`. A literal of
    // another width can equal no such answer, so the rule never held for anybody.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const draft: ConditionDraft = { join: 'all', items: [{ field: 'departs', operator: 'is', text: '2026-10-08T10:30' }] }

    expect(shownWhen(draft, '2026-10-08T08:30:00Z')).toBe(true)
    expect(shownWhen(draft, '2026-10-08T10:30:00Z')).toBe(false)
  })

  test('and an empty box stays empty rather than throwing', () => {
    // `new Date('')` is an invalid date, and its `toISOString()` throws: converting what the
    // control holds before anything is chosen would break the panel on its first draw.
    expect(conditionOf({ field: 'departs', operator: 'isAfter', text: '' }, tripFields).value).toBe('')
  })

  test('and text shaped like a wall clock that names no moment stays as typed', () => {
    // A thirteenth month has the shape and no instant. Without the check its invalid date
    // reached `toISOString()`, which throws, for a draft composed through the API rather
    // than through a browser's box.
    expect(conditionOf({ field: 'departs', operator: 'isAfter', text: '2026-13-01T10:30' }, tripFields).value).toBe('2026-13-01T10:30')
  })
})

/**
 * A field with a `precision` is typed into the mask the spec derives (0238), and its literal is
 * written at the field's width, so publish does not refuse the rule the editor wrote.
 */
describe('a time or a date and time with a precision compared', () => {
  const log: FormSchema = {
    specVersion: '6',
    id: 'log',
    title: 'Log',
    model: {
      fields: [
        { key: 'at', type: 'datetime', label: 'At', precision: 3 },
        { key: 'clock', type: 'time', label: 'Clock', precision: 0 },
        { key: 'shown', type: 'text', label: 'Shown' },
      ],
    },
  }
  const logFields = conditionFields(log)

  const started = Intl.DateTimeFormat().resolvedOptions().timeZone
  afterEach(() => {
    vi.stubEnv('TZ', started)
    vi.unstubAllEnvs()
  })

  const publishedAs = (draft: ConditionDraft): FormSchema => ({
    ...log,
    logic: { rules: [{ target: 'shown', kind: 'visible', cel: compileGroup(groupOf(draft, logFields)), editor: groupOf(draft, logFields) }] },
  })

  test('the field carries its precision to the editor', () => {
    // Without it the editor cannot tell which control to draw or which width to write.
    expect(logFields.find((field) => field.path === 'at')?.precision).toBe(3)
    expect(logFields.find((field) => field.path === 'shown')?.precision).toBeUndefined()
  })

  test('typed digits are written as the UTC instant at the field width', () => {
    // Written through the width-5 path, the typed digits were not a wall clock and stayed as
    // typed, so the literal had no instant in it.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const draft: ConditionDraft = { join: 'all', items: [{ field: 'at', operator: 'isAfter', text: '20261115140327415' }] }

    expect(compileGroup(groupOf(draft, logFields))).toBe('at != null && at > "2026-11-15T13:03:27.415Z"')
  })

  test('a time is written as typed, at its width', () => {
    // A time is not zoned: its digits are stored as they are typed.
    const draft: ConditionDraft = { join: 'all', items: [{ field: 'clock', operator: 'is', text: '140327' }] }

    expect(conditionOf(draft.items[0] as never, logFields).value).toBe('14:03:27')
  })

  test('the rule written is not a comparison across widths', () => {
    // The point of the change: at version 5's width publish refused this very rule.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const draft: ConditionDraft = {
      join: 'all',
      items: [
        { field: 'at', operator: 'isAfter', text: '20261115140327415' },
        { field: 'clock', operator: 'isBefore', text: '140327' },
      ],
    }

    expect(crossWidthComparisons(publishedAs(draft))).toEqual([])
  })

  test('the same rule at version 5 width is the one publish refuses', () => {
    // Shows the check above can fail: a literal to the second on a field of three digits.
    const wrong: FormSchema = { ...log, logic: { rules: [{ target: 'shown', kind: 'visible', cel: 'at > "2026-11-15T13:03:27Z"' }] } }

    expect(crossWidthComparisons(wrong)).not.toEqual([])
  })

  test('a change to a field of another width clears the typed digits', () => {
    // Digits typed for three places mean another instant, or none, at nine, and a browser's
    // box text typed as digits is no wall clock: the value is cleared as a change of kind clears it.
    const wide: FormSchema = { ...log, model: { fields: [...log.model.fields, { key: 'wide', type: 'datetime', label: 'Wide', precision: 9 }] } }
    const fields = conditionFields(wide)
    const draft: ConditionDraft = { join: 'all', items: [{ field: 'at', operator: 'isAfter', text: '20261115140327415' }] }

    const next = updateRow(draft, { at: 0 }, { field: 'wide' }, fields)

    expect((next.items[0] as { text: string }).text).toBe('')
  })

  test('a stored literal is shown as the digits that were typed', () => {
    // Read back as the stored text, the editor would show a UTC instant as if the author had
    // typed it, and the first edit would shift it by their offset.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const field = logFields.find((candidate) => candidate.path === 'at')!
    const literal = conditionOf({ field: 'at', operator: 'isAfter', text: '20261115140327415' }, logFields).value as string

    expect(textOfLiteral(field, literal)).toBe('20261115140327415')
  })

  test('a field without a precision reads a literal as it is', () => {
    // The version-5 text box shows the stored text; digits there would be wrong.
    const plain = conditionFields({ ...log, model: { fields: [{ key: 'departs', type: 'datetime', label: 'Departs' }] } })[0]!

    expect(textOfLiteral(plain, '2026-10-08T08:30:00Z')).toBe('2026-10-08T08:30:00Z')
  })
})
