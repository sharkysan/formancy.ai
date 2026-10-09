import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { compileGroup } from './conditions.js'
import type { ConditionGroup } from './conditions.js'
import { conditionFields } from './condition-draft.js'
import { ruleTargetFor } from './logic.js'
import { createBuilderText } from './messages.js'
import { rulesOverview } from './rules-overview.js'
import { createBuilderSession } from './session.js'

/**
 * A rule on a field inside a repeater row, written from the builder (0129).
 *
 * The format and the engine have had row rules since repeaters existed: a target of
 * `items[].note` runs once per row, with `item` bound to that row. The builder could
 * not write one. It addressed the field by its dotted data path, `items.note`, which
 * no field has, and the validator refused the rule. Each case below is one of the
 * places the row's scope has to reach for a row rule to be right rather than merely
 * accepted.
 */
const text = createBuilderText()
const CLOCK = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

const form = (rules: LogicRule[] = []): FormSchema =>
  ({
    specVersion: '4',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'country', type: 'text', label: 'Country' },
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          fields: [
            { key: 'qty', type: 'number', label: 'Quantity' },
            {
              key: 'tags',
              type: 'selectboxes',
              label: 'Tags',
              options: [
                { value: 'gift', label: 'Gift' },
                { value: 'fragile', label: 'Fragile' },
              ],
            },
            {
              key: 'addr',
              type: 'group',
              label: 'Address',
              fields: [{ key: 'city', type: 'text', label: 'City' }],
            },
            { key: 'note', type: 'text', label: 'Note' },
          ],
        },
        {
          key: 'recipients',
          type: 'repeater',
          label: 'Recipients',
          fields: [
            { key: 'copies', type: 'number', label: 'Copies' },
            { key: 'message', type: 'text', label: 'Message' },
          ],
        },
      ],
    },
    logic: { rules },
  }) as unknown as FormSchema

/** A rule as the condition editor writes it: the CEL compiled from the metadata kept beside it. */
const written = (target: string, kind: LogicRule['kind'], editor: ConditionGroup): LogicRule =>
  ({ target, kind, cel: compileGroup(editor), editor }) as LogicRule

const atLeastThree: ConditionGroup = {
  join: 'all',
  conditions: [{ field: 'items[].qty', operator: 'isAtLeast', value: 3, answer: 'number' }],
}

const rulesOf = (document: FormSchema): LogicRule[] => document.logic?.rules ?? []

describe('a rule on a field in a repeater row', () => {
  test('is addressed the way the engine scopes it to each row', () => {
    // `items.note` was the dotted guess, and no field has that path.
    expect(ruleTargetFor(form(), ['items', 'note'])).toEqual({
      target: 'items[].note',
      on: 'field',
    })
  })

  test('and can be added, which the validator refused while it was addressed by a dotted path', () => {
    const session = createBuilderSession(form())
    const { target } = ruleTargetFor(session.document(), ['items', 'note'])

    const outcome = session.addRule(written(target, 'visible', atLeastThree))

    expect(outcome.ok).toBe(true)
    expect(rulesOf(session.document())[0]?.cel).toBe('item.qty != null && item.qty >= 3.0')
  })

  test('may compare the fields of its own row, named as being in this row', () => {
    const fields = conditionFields(form(), { target: 'items[].note', text })

    expect(fields.map((field) => [field.path, field.label])).toEqual([
      ['country', 'Country'],
      ['items[].qty', 'Quantity in this row'],
      ['items[].tags', 'Tags in this row'],
      ['items[].addr.city', 'City in this row'],
      ['items[].note', 'Note in this row'],
    ])
  })

  test('and a rule about the whole form may not, because it cannot say which row it means', () => {
    const paths = [
      ...conditionFields(form()),
      ...conditionFields(form(), { target: 'country', text }),
      // Another repeater's row is not this row: `item` there is a recipient.
      ...conditionFields(form(), { target: 'recipients[].message', text }),
    ].map((field) => field.path)

    expect(paths.filter((path) => path.startsWith('items'))).toEqual([])
  })

  test('decides each row by that row, agreeing with the engine', () => {
    const document = form([written('items[].note', 'visible', atLeastThree)])
    const engine = createFormEngine({ schema: document, capabilities: CLOCK })
    engine.addRow(['items'])
    engine.addRow(['items'])
    engine.setValue(['items', 0, 'qty'], 5)

    expect(engine.getFieldSnapshot(['items', 0, 'note']).visible).toBe(true)
    expect(engine.getFieldSnapshot(['items', 1, 'note']).visible).toBe(false)
  })

  test('and a list in a row nobody has touched is unanswered, not a reason to show the field', () => {
    // Measured: in a fresh row a list is null rather than [], so `"gift" in item.tags`
    // threw, and a `visible` rule that throws shows its field (0022). At the top level
    // the same comparison is safe because an untouched list there is [].
    const gift: ConditionGroup = {
      join: 'all',
      conditions: [{ field: 'items[].tags', operator: 'includes', value: 'gift', answer: 'list' }],
    }
    const document = form([written('items[].note', 'visible', gift)])
    const engine = createFormEngine({ schema: document, capabilities: CLOCK })
    engine.addRow(['items'])

    expect(engine.getFieldSnapshot(['items', 0, 'note']).visible).toBe(false)
    engine.setValue(['items', 0, 'tags'], ['gift'])
    expect(engine.getFieldSnapshot(['items', 0, 'note']).visible).toBe(true)
  })

  test('and "not answered" holds for that untouched list, rather than throwing', () => {
    const empty: ConditionGroup = {
      join: 'all',
      conditions: [{ field: 'items[].tags', operator: 'isNotAnswered', answer: 'list' }],
    }
    const document = form([written('items[].note', 'required', empty)])
    const engine = createFormEngine({ schema: document, capabilities: CLOCK })
    engine.addRow(['items'])

    // A `required` rule that throws leaves the field optional, so required here is
    // the rule holding, not the rule failing.
    expect(engine.getFieldSnapshot(['items', 0, 'note']).required).toBe(true)
  })

  test('is listed under its field, in words that say which row', () => {
    const [group] = rulesOverview(form([written('items[].note', 'visible', atLeastThree)]), text)

    expect(group).toMatchObject({ target: 'items[].note', targetLabel: 'Note' })
    expect(group?.rules[0]?.sentence).toBe('Quantity in this row is at least 3')
  })
})

describe('a row rule follows a rename', () => {
  const rowRule = (): LogicRule => written('items[].note', 'visible', atLeastThree)

  test('of the row field it reads: the condition, and the metadata the panel reopens from', () => {
    const session = createBuilderSession(form([rowRule()]))

    expect(session.renameField(['items', 'qty'], 'amount').ok).toBe(true)

    const [rule] = rulesOf(session.document())
    expect(rule?.cel).toBe('item.amount != null && item.amount >= 3.0')
    expect((rule?.editor as ConditionGroup).conditions[0]).toMatchObject({
      field: 'items[].amount',
    })
  })

  test('of the row field it is about', () => {
    const session = createBuilderSession(form([rowRule()]))

    expect(session.renameField(['items', 'note'], 'remark').ok).toBe(true)

    expect(rulesOf(session.document())[0]?.target).toBe('items[].remark')
  })

  test('of the repeater itself, where `item` stays `item`', () => {
    const session = createBuilderSession(form([rowRule()]))

    expect(session.renameField(['items'], 'lines').ok).toBe(true)

    const [rule] = rulesOf(session.document())
    expect(rule?.target).toBe('lines[].note')
    expect(rule?.cel).toBe('item.qty != null && item.qty >= 3.0')
    expect((rule?.editor as ConditionGroup).conditions[0]).toMatchObject({ field: 'lines[].qty' })
  })

  test('and of a group inside the row being unwrapped', () => {
    const inCity = written('items[].note', 'visible', {
      join: 'all',
      conditions: [{ field: 'items[].addr.city', operator: 'is', value: 'Bern', answer: 'text' }],
    })
    const session = createBuilderSession(form([inCity]))

    expect(session.unwrapField(['items', 'addr']).ok).toBe(true)

    const [rule] = rulesOf(session.document())
    expect(rule?.cel).toBe('has(item.city) && item.city != null && item.city == "Bern"')
    expect((rule?.editor as ConditionGroup).conditions[0]).toMatchObject({ field: 'items[].city' })
  })
})
