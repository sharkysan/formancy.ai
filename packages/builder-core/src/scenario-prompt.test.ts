import { runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'
import { canonicalize } from '@formancy/spec'
import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import {
  ANSWER_EXAMPLES,
  BUILT_IN_ERROR_CODES,
  EXAMPLE_FORM,
  EXAMPLE_INTENT,
  EXAMPLE_SCENARIO,
  EXAMPLE_TODAY,
  scenarioPrompt,
} from './scenario-prompt.js'

/**
 * What a model is told when it drafts a form's examples.
 *
 * The one property everything else rests on: **it is never shown a rule**. An example
 * exists to tell the rule somebody wrote from the rule they meant, and a model shown
 * `country != "CH"` writes the example `country != "CH"` passes — one that agrees with
 * the rule whether it is right or wrong
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 */

/**
 * A form with every rule kind and every property that bounds an answer, each set to a value
 * that appears nowhere else, so finding it in a prompt can only mean the prompt carries it.
 */
const RULED: FormSchema = {
  specVersion: '4',
  id: 'ruled',
  title: 'Ruled',
  model: {
    fields: [
      {
        key: 'about',
        type: 'page',
        label: 'About you',
        fields: [
          { key: 'age', type: 'number', label: 'Age', required: true, min: 1913, max: 2087, step: 0.37 },
          {
            key: 'code',
            type: 'text',
            label: 'Code',
            minLength: 3271,
            maxLength: 3389,
            pattern: '[A-Z]{2}-\\d{5}',
            format: 'email',
            mask: '(999) 999-9999',
          },
          { key: 'day', type: 'date', label: 'Day', earliest: '1999-02-17', latest: '2077-11-29' },
          {
            key: 'tags',
            type: 'selectboxes',
            label: 'Tags',
            minItems: 1709,
            maxItems: 1801,
            options: [
              { value: 'red', label: 'Red' },
              { value: 'blue', label: 'Blue' },
            ],
          },
          { key: 'scan', type: 'file', label: 'Scan', accept: ['.xyzzy'], maxFileSize: 5242883 },
          { key: 'mark', type: 'signature', label: 'Mark', box: [6113, 2711], maxPoints: 9973 },
        ],
      },
      { key: 'later', type: 'page', label: 'Later', fields: [{ key: 'note', type: 'text', label: 'Note' }] },
    ],
  },
  logic: {
    rules: [
      { target: 'code', kind: 'visible', cel: 'age >= 4093.0' },
      { target: 'code', kind: 'required', cel: 'age < 6007.0' },
      { target: 'day', kind: 'disabled', cel: 'size(tags) > 3313' },
      { target: 'note', kind: 'computed', cel: '"computed-" + code' },
      { target: 'age', kind: 'validate', cel: 'age != 7919.0', code: 'notThatAge' },
      { target: 'code', kind: 'check', check: 'codeIsRegisteredSomewhere' },
      { target: 'later', kind: 'skip', cel: 'age > 8111.0' },
    ],
  },
}

/** The properties of a field that say what an answer may be, rather than what the field is. */
const BOUNDS = [
  'min',
  'max',
  'step',
  'minLength',
  'maxLength',
  'pattern',
  'mask',
  'earliest',
  'latest',
  'minItems',
  'maxItems',
  'accept',
  'maxFileSize',
  'box',
  'maxPoints',
] as const satisfies readonly (keyof FieldDef)[]

/** Every field, pages and groups opened. */
const fieldsOf = (fields: readonly FieldDef[]): FieldDef[] =>
  fields.flatMap((field) => [field, ...fieldsOf(field.fields ?? [])])

/**
 * What a rule says and what a bound allows, as text a prompt could carry: a rule's `cel` and
 * `check`, and every bound's value. Each in both spellings it could travel in — written out,
 * and escaped inside a JSON string — since a prompt that carried the document as JSON would
 * carry `country == \"CH\"`.
 */
function withheld(document: FormSchema): string[][] {
  const texts: string[] = []
  for (const rule of document.logic?.rules ?? ([] as LogicRule[])) {
    if (rule.cel !== undefined) texts.push(rule.cel)
    if (rule.check !== undefined) texts.push(rule.check)
  }
  for (const field of fieldsOf(document.model.fields)) {
    for (const bound of BOUNDS) {
      const value = field[bound]
      if (value === undefined) continue
      for (const one of Array.isArray(value) ? value : [value]) texts.push(String(one))
    }
  }
  return texts.map((text) => [...new Set([text, JSON.stringify(text).slice(1, -1)])])
}

const carries = (prompt: string, spellings: readonly string[]): boolean =>
  spellings.some((spelling) => prompt.includes(spelling))

describe('what a model drafting examples is told', () => {
  test('never carries a rule: no condition, no check, no bound', () => {
    // The failure this prevents: an example drafted from the rule it was meant to check.
    // It holds whether the rule is right or wrong, so the one check that tells the two
    // apart would say nothing — and say it in green.
    const needles = withheld(RULED)
    const { system, user } = scenarioPrompt(RULED, 'Adults only, and a code for each of them.')

    // A guard on the guard: the form sets every bound there is and the walk found more than
    // one text per rule, and each is findable in the document's own JSON — the form a
    // prompt carrying the document would take.
    const fields = fieldsOf(RULED.model.fields)
    expect(BOUNDS.filter((bound) => !fields.some((field) => field[bound] !== undefined))).toEqual([])
    expect(needles.length).toBeGreaterThan(RULED.logic!.rules.length + BOUNDS.length)
    expect(needles.filter((spellings) => !carries(canonicalize(RULED), spellings))).toEqual([])

    expect(needles.filter((spellings) => carries(`${system}\n${user}`, spellings))).toEqual([])
  })

  test('and reads nothing about a field but what an example has to name', () => {
    /*
     * The same property from the other side, and wider: everything a field says beyond its
     * key, type, label and options is taken away — `required` with the bounds, a widget, a
     * property added to the format tomorrow — and every rule is reduced to its kind and its
     * code. If the prompt reads any of it, the two prompts differ.
     */
    const SHAPE = new Set(['key', 'type', 'label', 'options', 'rows', 'optionsSource', 'fields'])
    const shapeOf = (field: FieldDef): FieldDef =>
      Object.fromEntries(
        Object.entries(field)
          .filter(([key]) => SHAPE.has(key))
          .map(([key, value]) => [key, key === 'fields' ? (value as FieldDef[]).map(shapeOf) : value]),
      ) as unknown as FieldDef
    const stripped: FormSchema = {
      ...RULED,
      model: { fields: RULED.model.fields.map(shapeOf) },
      logic: {
        rules: RULED.logic!.rules.map((rule) => ({
          target: 'nowhere',
          kind: rule.kind,
          ...(rule.code === undefined ? {} : { code: rule.code }),
        })),
      },
    }
    const intent = 'Adults only.'

    expect(scenarioPrompt(stripped, intent)).toEqual(scenarioPrompt(RULED, intent))
  })

  test('names every field by the path an example uses, with its type, label and options', () => {
    // An example naming `about.age` — the tree's path rather than the data's — would fail
    // as a field this form does not have, and could not be kept.
    const form: FormSchema = {
      specVersion: '4',
      id: 'shape',
      title: 'Shape',
      model: {
        fields: [
          {
            key: 'home',
            type: 'group',
            label: 'Home',
            fields: [{ key: 'street', type: 'text', label: { $t: 'street' } }],
          },
          {
            key: 'items',
            type: 'repeater',
            label: 'Items',
            fields: [{ key: 'qty', type: 'number', label: 'Quantity' }],
          },
          {
            key: 'pick',
            type: 'radio',
            label: 'Pick',
            options: [
              { value: 'a', label: 'Apple' },
              { value: 'b', label: 'b' },
            ],
          },
          { key: 'many', type: 'selectboxes', label: 'Many', options: [{ value: 'x', label: 'X' }] },
          { key: 'found', type: 'select', label: 'Found', optionsSource: 'places' },
          {
            key: 'rate',
            type: 'matrix',
            label: 'Rate',
            rows: [{ value: 'speed', label: 'Speed' }],
            options: [{ value: 'good', label: 'Good' }],
          },
        ],
      },
      i18n: { defaultLocale: 'en', messages: { en: { street: 'Street' }, de: { street: 'Straße' } } },
    }

    const { user } = scenarioPrompt(form, 'anything')

    expect(user).toContain('- home.street: text, "Street"')
    expect(user).toContain('- items[0].qty: number, "Quantity"')
    expect(user).toContain('- pick: radio, "Pick", one of "a" (Apple), "b"')
    expect(user).toContain('- many: selectboxes, "Many", a list of "x" (X)')
    expect(user).toMatch(/- found: select, "Found", its options come from a list/)
    expect(user).toContain('- rate: matrix, "Rate", an object from each row ("speed" (Speed)) to one of "good" (Good)')
    // A container is not a path an example can name; the engine does not know one.
    expect(user).not.toMatch(/^- (home|items):/m)
    // And the syntax by example, from core's own formatter.
    expect(user).toContain('as address.street')
    expect(user).toContain('as items[0].note')
  })

  test('names every code the engine reports by itself, and this form’s own by name alone', () => {
    // An example expecting `required` where the engine says `required` holds; one expecting
    // "mandatory" fails for a reason that is not about the rule.
    const { user } = scenarioPrompt(RULED, 'anything')

    expect(Object.keys(BUILT_IN_ERROR_CODES).filter((code) => !user.includes(code))).toEqual([])
    expect(user).toContain('This form’s rules may also report: notThatAge.')
    expect(scenarioPrompt(EXAMPLE_FORM, 'anything').user).toContain('name no codes of their own')
  })

  test('carries where examples start, the names taken but not what they expect, and the author’s words', () => {
    // An example named like one the form has could not be kept; one told what the
    // existing examples expect would copy the rule they were written against.
    const existing: Scenario[] = [
      { name: 'Taken already', changes: { country: 'CH' }, valid: true, visible: { canton: true } },
    ]

    const { user } = scenarioPrompt(EXAMPLE_FORM, 'Cantons are Swiss.', {
      initialValue: { country: 'DE' },
      existing,
    })

    expect(user).toContain('{"country":"DE"}')
    expect(user).toContain('"Taken already"')
    // In any spelling: what an existing example expects is not the model's to read.
    expect(user).not.toMatch(/visible/)
    expect(user.endsWith('Cantons are Swiss.')).toBe(true)
  })
})

describe('the example the briefing shows', () => {
  test('holds against its own form', () => {
    // A briefing whose one example fails teaches a model the wrong shape, and every draft
    // after it inherits the mistake.
    const [result] = runScenarios(EXAMPLE_FORM, [EXAMPLE_SCENARIO])

    expect(result?.failures).toEqual([])
  })

  test('is the one the briefing carries, in core’s own Scenario shape', () => {
    const { system } = scenarioPrompt(EXAMPLE_FORM, 'anything')

    expect(system).toContain(JSON.stringify({ scenarios: [EXAMPLE_SCENARIO] }))
    expect(system).toContain(EXAMPLE_INTENT)
  })

  test('and its answers by type are answers the engine accepts, on the day it runs them', () => {
    // A briefing that said a time is "9:30" would have every example with a time fail on
    // `shape`; one that named the wrong day would have every date-relative example fail.
    const form: FormSchema = {
      specVersion: '4',
      id: 'kinds',
      title: 'Kinds',
      model: {
        fields: [
          { key: 'date', type: 'date' },
          { key: 'time', type: 'time' },
          { key: 'datetime', type: 'datetime' },
          { key: 'number', type: 'number' },
          { key: 'checkbox', type: 'checkbox' },
        ],
      },
      logic: {
        rules: [
          { target: 'date', kind: 'validate', cel: `string(today()).startsWith("${EXAMPLE_TODAY}")`, code: 'notToday' },
        ],
      },
    }
    const changes = Object.fromEntries(
      ['date', 'time', 'datetime', 'number', 'checkbox'].map((type) => [type, ANSWER_EXAMPLES[type as 'date']]),
    )

    const [result] = runScenarios(form, [{ name: 'accepted', changes, valid: true }])

    expect(result?.failures).toEqual([])
  })
})
