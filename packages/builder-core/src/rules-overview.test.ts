import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import { fixedCapabilities } from '@formancy/expressions'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { compileGroup } from './conditions.js'
import type { ConditionGroup } from './conditions.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { createBuilderText } from './messages.js'
import { explainRows, explainRule, rulesOverview } from './rules-overview.js'

/**
 * Every rule in a form, in words, and why a field is hidden or required now (0128).
 *
 * The explanation is only worth having if it is what the engine did: an overview that
 * said "Shown now" beside a field the preview had hidden would be worse than none. So
 * the cases that matter most run the same rule through the engine and the explanation
 * and require them to agree.
 */
const english = createBuilderText()
const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
const CLOCK = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }
const capabilities = fixedCapabilities({ nowMs: 0, today: '2026-10-09', random: 0.5 })

const condition: ConditionGroup = {
  join: 'any',
  conditions: [
    { field: 'country', operator: 'is', value: 'CH', answer: 'choice' },
    {
      join: 'all',
      conditions: [
        { field: 'age', operator: 'isAtLeast', value: 18, answer: 'number' },
        { field: 'terms', operator: 'is', value: true, answer: 'boolean' },
      ],
    },
  ],
}

const form = (rules: LogicRule[]): FormSchema =>
  ({
    specVersion: '4',
    id: 'trip',
    title: 'Trip',
    model: {
      fields: [
        {
          key: 'country',
          type: 'radio',
          label: 'Country',
          options: [
            { value: 'CH', label: 'Switzerland' },
            { value: 'DE', label: 'Germany' },
          ],
        },
        { key: 'age', type: 'number', label: 'Age' },
        { key: 'terms', type: 'checkbox', label: 'Terms' },
        { key: 'address', type: 'group', fields: [{ key: 'city', type: 'text', label: 'City' }] },
        { key: 'canton', type: 'text', label: 'Canton' },
        { key: 'reason', type: 'text', label: 'Reason' },
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          fields: [
            { key: 'qty', type: 'number', label: 'Quantity' },
            { key: 'note', type: 'text', label: 'Note' },
          ],
        },
      ],
    },
    logic: { rules },
  }) as FormSchema

const visibleRule: LogicRule = {
  target: 'canton',
  kind: 'visible',
  cel: compileGroup(condition),
  editor: condition,
}

describe('every rule in the form', () => {
  test('grouped by what each is about, in the order the form asks, under its name', () => {
    const document = form([
      { target: 'reason', kind: 'required', cel: 'age != null && age < 18.0' },
      visibleRule,
    ])

    expect(rulesOverview(document, english).map((group) => group.targetLabel)).toEqual([
      'Canton',
      'Reason',
    ])
  })

  test('in words where the condition editor wrote it, and as CEL where somebody did', () => {
    const document = form([
      visibleRule,
      { target: 'reason', kind: 'required', cel: 'age != null && age < 18.0' },
    ])
    const [canton, reason] = rulesOverview(document, english)

    expect(canton?.rules[0]).toMatchObject({
      kindLabel: 'Show this field when',
      sentence: 'Country is Switzerland or (Age is at least 18 and Terms is Yes)',
    })
    // No words invented for an expression the editor did not write.
    expect(reason?.rules[0]?.sentence).toBeUndefined()
    expect(reason?.rules[0]?.written).toBe('age != null && age < 18.0')
  })

  test('a rule on a field in a repeater row is listed under that field', () => {
    // A row's rule names its target `items[].note`; a dotted guess at the path would
    // put it at the end under its raw target, as though no field had that name.
    const rule: LogicRule = { target: 'items[].note', kind: 'visible', cel: 'item.qty > 3.0' }

    expect(rulesOverview(form([rule]), english)).toEqual([
      expect.objectContaining({ target: 'items[].note', targetLabel: 'Note' }),
    ])
  })

  test('and in the author’s language, "and" and "or" included', () => {
    expect(rulesOverview(form([visibleRule]), german)[0]?.rules[0]?.sentence).toBe(
      'Country ist Switzerland oder (Age ist mindestens 18 und Terms ist Ja)',
    )
  })
})

describe('why a field is shown or hidden now', () => {
  const engineSays = (document: FormSchema, value: Record<string, unknown>, path: string) =>
    createFormEngine({
      schema: document,
      initialValue: value,
      capabilities: CLOCK,
    }).getFieldSnapshot([path])

  test('says what each comparison found, so a hidden field says why', () => {
    const verdict = explainRule(
      visibleRule,
      form([visibleRule]),
      { country: 'DE', age: 12 },
      english,
      capabilities,
    )

    expect(verdict).toEqual({
      outcome: 'fails',
      effect: 'Hidden now.',
      because: [
        'Country is Switzerland: no — it is Germany',
        'Age is at least 18: no — it is 12',
        'Terms is Yes: no — it is not answered',
      ],
    })
  })

  test('and agrees with the engine about the same answers', () => {
    // The point of the explanation. Shown, hidden, shown: each verdict is checked
    // against what the engine did with the same rule and the same answers.
    const document = form([visibleRule])
    for (const answers of [
      { country: 'CH' },
      { country: 'DE', age: 12 },
      { age: 30, terms: true },
      {},
    ]) {
      const verdict = explainRule(visibleRule, document, answers, english, capabilities)
      expect(verdict?.outcome === 'fails', JSON.stringify(answers)).toBe(
        !engineSays(document, answers, 'canton').visible,
      )
    }
  })

  test('and when a rule cannot be decided, says that the field is shown because of it', () => {
    // A hand-written rule reading into a group nobody filled throws, and a `visible`
    // rule that throws shows its field — the case an author most needs explained,
    // because the field is there and the condition says it should not be.
    const throwing: LogicRule = { target: 'canton', kind: 'visible', cel: 'address.city == "Bern"' }
    const document = form([throwing])

    const verdict = explainRule(throwing, document, {}, english, capabilities)

    expect(verdict?.outcome).toBe('undecided')
    expect(verdict?.effect).toMatch(/^Shown now, because the rule cannot be decided/)
    expect(engineSays(document, {}, 'canton').visible).toBe(true)
  })

  test('and for a required rule, what that does to the field', () => {
    const rule: LogicRule = { target: 'reason', kind: 'required', cel: 'age != null && age < 18.0' }
    const document = form([rule])

    expect(explainRule(rule, document, { age: 12 }, english, capabilities)?.effect).toBe(
      'Required now.',
    )
    expect(engineSays(document, { age: 12 }, 'reason').required).toBe(true)
  })

  test('and no verdict for a rule in a repeater row, which has one per row', () => {
    // Evaluated against the form as a whole, `item` is not a variable and the rule
    // throws — so the overview would say "Shown now, because the rule cannot be
    // decided" about a note the engine hides in every row with three or fewer.
    const rule: LogicRule = { target: 'items[].note', kind: 'visible', cel: 'item.qty > 3.0' }
    const answers = { items: [{ qty: 1 }] }

    expect(explainRule(rule, form([rule]), answers, english, capabilities)).toBeUndefined()
  })

  test('and nothing for a calculation or a check, which a condition does not decide', () => {
    const rule: LogicRule = { target: 'reason', kind: 'computed', cel: '"x"' }

    expect(explainRule(rule, form([rule]), {}, english, capabilities)).toBeUndefined()
  })
})

describe('why a field in a repeater row is shown or hidden now, row by row', () => {
  /**
   * A row's rule has one verdict per row, so the overview gave it none rather than a
   * wrong one: evaluated against the form as a whole, `item` is not a variable and the
   * rule throws. Each row is evaluated the way the engine evaluates it — the form's
   * answers, `item` bound to the row with every field of the row present, and `index`.
   */
  const engineSays = (document: FormSchema, value: Record<string, unknown>, path: (string | number)[]) =>
    createFormEngine({ schema: document, initialValue: value, capabilities: CLOCK }).getFieldSnapshot(path)

  const inRow: ConditionGroup = {
    join: 'all',
    conditions: [
      { field: 'items[].qty', operator: 'isAtLeast', value: 4, answer: 'number' },
      { field: 'country', operator: 'is', value: 'CH', answer: 'choice' },
    ],
  }
  const rowRule: LogicRule = {
    target: 'items[].note',
    kind: 'visible',
    cel: compileGroup(inRow),
    editor: inRow,
  }

  test('says, for each row, what the rule does there and why', () => {
    const rows = explainRows(
      rowRule,
      form([rowRule]),
      { country: 'CH', items: [{ qty: 1 }, { qty: 5 }] },
      english,
      capabilities,
    )

    expect(rows).toEqual([
      {
        row: 1,
        label: 'Row 1',
        outcome: 'fails',
        effect: 'Hidden now.',
        because: ['Quantity in this row is at least 4: no — it is 1', 'Country is Switzerland: yes'],
      },
      {
        row: 2,
        label: 'Row 2',
        outcome: 'holds',
        effect: 'Shown now.',
        because: ['Quantity in this row is at least 4: yes', 'Country is Switzerland: yes'],
      },
    ])
  })

  test('and agrees with the engine about every row', () => {
    // The third row has no quantity: the engine fills the row's fields with null before
    // evaluating, so the comparison is decided rather than thrown on a missing key.
    const document = form([rowRule])
    for (const answers of [
      { country: 'CH', items: [{ qty: 1 }, { qty: 5 }, {}] },
      { country: 'DE', items: [{ qty: 9 }] },
      { items: [{ qty: 4 }, { note: 'x' }] },
    ]) {
      const rows = explainRows(rowRule, document, answers, english, capabilities) ?? []
      expect(rows).toHaveLength(answers.items.length)
      rows.forEach((verdict, at) => {
        expect(verdict.outcome === 'fails', `${JSON.stringify(answers)} row ${String(at)}`).toBe(
          !engineSays(document, answers, ['items', at, 'note']).visible,
        )
      })
    }
  })

  test('and binds `index` and a field nobody typed into, as the engine does', () => {
    // Written by hand: the second row onward, and a row whose note was never touched.
    // Without `index` the first throws; without the row's fields present the second
    // does, and both would be explained as "cannot be decided".
    const byIndex: LogicRule = { target: 'items[].note', kind: 'visible', cel: 'index > 0' }
    const untouched: LogicRule = { target: 'items[].note', kind: 'visible', cel: 'item.note == null' }
    const answers = { items: [{ qty: 1 }, { qty: 2 }] }

    expect(
      explainRows(byIndex, form([byIndex]), answers, english, capabilities)?.map((row) => row.outcome),
    ).toEqual(['fails', 'holds'])
    expect(
      explainRows(untouched, form([untouched]), answers, english, capabilities)?.map(
        (row) => row.outcome,
      ),
    ).toEqual(['holds', 'holds'])
    for (const at of [0, 1]) {
      expect(engineSays(form([byIndex]), answers, ['items', at, 'note']).visible).toBe(at > 0)
      expect(engineSays(form([untouched]), answers, ['items', at, 'note']).visible).toBe(true)
    }
  })

  test('and with no rows, has nothing to say about any', () => {
    expect(explainRows(rowRule, form([rowRule]), {}, english, capabilities)).toEqual([])
    expect(explainRows(rowRule, form([rowRule]), { items: [] }, english, capabilities)).toEqual([])
  })

  test('in the author’s language', () => {
    const [first] = explainRows(rowRule, form([rowRule]), { items: [{ qty: 1 }] }, german, capabilities) ?? []

    expect(first?.label).toBe('Zeile 1')
    expect(first?.effect).toBe('Jetzt verborgen.')
  })

  test('and nothing for a rule about the whole form, which `explainRule` explains', () => {
    expect(explainRows(visibleRule, form([visibleRule]), { country: 'CH' }, english, capabilities)).toBeUndefined()
  })
})
