import { describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import {
  blockFrom,
  blockTargets,
  insertBlock,
  insertBlockAndSay,
  saveBlockAndSay,
  withBlock,
} from './blocks.js'
import type { BuilderBlock } from './blocks.js'
import { compileGroup } from './conditions.js'
import type { ConditionGroup } from './conditions.js'
import { createBuilderText } from './messages.js'
import { createBuilderSession } from './session.js'

/**
 * A piece of a form saved to use again (0135): a field — often a group or a repeater —
 * with the rules that live entirely inside it and the words it names.
 *
 * What makes a block worth having is that it still works where it lands. A form's keys
 * are unique across the whole form, so a block's keys may have to change; its rules name
 * those keys, and name them by where the block was saved — so inserting one is a rename
 * and a move at once, for every rule it carries, or the rules quietly read nothing.
 */
const text = createBuilderText()
const CLOCK = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

const inCountry: ConditionGroup = {
  join: 'all',
  conditions: [{ field: 'address.country', operator: 'is', value: 'CH', answer: 'choice' }],
}

/** The form a block is saved from: an address group, with rules in and around it. */
const source = (): FormSchema =>
  ({
    specVersion: '4',
    id: 'source',
    title: 'Source',
    model: {
      fields: [
        { key: 'region', type: 'text', label: 'Region' },
        {
          key: 'address',
          type: 'group',
          label: { $t: 'address.title' },
          fields: [
            { key: 'street', type: 'text', label: 'Street' },
            {
              key: 'country',
              type: 'select',
              label: 'Country',
              options: [
                { value: 'CH', label: 'Switzerland' },
                { value: 'DE', label: 'Germany' },
              ],
            },
            { key: 'canton', type: 'text', label: 'Canton' },
          ],
        },
        { key: 'note', type: 'text', label: 'Note' },
      ],
    },
    logic: {
      rules: [
        // Inside: about the canton, reading the country beside it.
        {
          target: 'address.canton',
          kind: 'visible',
          cel: compileGroup(inCountry),
          editor: inCountry,
        },
        // About a field inside, reading one outside: it cannot travel.
        { target: 'address.street', kind: 'required', cel: 'region != null && region == "north"' },
        // About a field outside: not the block's at all.
        { target: 'note', kind: 'visible', cel: 'address.country == "DE"' },
      ] as LogicRule[],
    },
    i18n: {
      defaultLocale: 'en',
      messages: {
        en: { 'address.title': 'Postal address', other: 'Other' },
        de: { 'address.title': 'Postanschrift', other: 'Anderes' },
      },
    },
  }) as unknown as FormSchema

/** A form a block lands in, which already has an `address` and a `country`. */
const target = (fields: unknown[] = []): FormSchema =>
  ({
    specVersion: '4',
    id: 'target',
    title: 'Target',
    model: {
      fields: [
        { key: 'address', type: 'text', label: 'Email address' },
        { key: 'country', type: 'text', label: 'Country of birth' },
        ...fields,
      ],
    },
    i18n: { defaultLocale: 'en', messages: { en: { greeting: 'Hello' } } },
  }) as unknown as FormSchema

const saved = (): BuilderBlock => {
  const outcome = blockFrom(source(), ['address'], { id: 'postal', name: 'Postal address' }, text)
  if (!outcome.ok) throw new Error(outcome.message)
  return outcome.block
}

describe('saving a block', () => {
  test('keeps the field and the rules that live entirely inside it', () => {
    const outcome = blockFrom(source(), ['address'], { id: 'postal', name: 'Postal address' }, text)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.block.field).toMatchObject({ key: 'address', type: 'group' })
    expect(outcome.block.root).toBe('address')
    expect(outcome.block.rules.map((rule) => rule.target)).toEqual(['address.canton'])
    // Said, not dropped silently: the rule reading the region could not come along.
    expect(outcome.leftOut).toBe(1)
  })

  test('and the words its references name, in every language the form has', () => {
    expect(saved().messages).toEqual({
      en: { 'address.title': 'Postal address' },
      de: { 'address.title': 'Postanschrift' },
    })
  })

  test('but not a page, which is not a field', () => {
    const paged = {
      ...source(),
      model: {
        fields: [{ key: 'about', type: 'page', label: 'About', fields: source().model.fields }],
      },
    } as unknown as FormSchema

    expect(blockFrom(paged, ['about'], { id: 'p', name: 'P' }, text).ok).toBe(false)
  })

  test('nor a field inside a repeater row, whose rules would be about every row', () => {
    const rows = {
      ...source(),
      model: {
        fields: [
          {
            key: 'items',
            type: 'repeater',
            label: 'Items',
            fields: [{ key: 'what', type: 'text', label: 'What' }],
          },
        ],
      },
      logic: { rules: [] },
    } as unknown as FormSchema

    expect(blockFrom(rows, ['items', 'what'], { id: 'w', name: 'W' }, text).ok).toBe(false)
  })
})

describe('inserting a block', () => {
  test('gives it keys the form does not have, and its rules the keys it was given', () => {
    // `address` and `country` are taken in the target: the group and the select become
    // address2 and country2, and the canton's rule reads the select by its new name.
    const outcome = withBlock(target(), { parent: [], index: 2 }, saved(), text)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const group = outcome.document.model.fields[2]
    expect(group).toMatchObject({ key: 'address2', type: 'group' })
    expect(group?.fields?.map((field) => field.key)).toEqual(['street', 'country2', 'canton'])
    const [rule] = outcome.document.logic?.rules ?? []
    expect(rule?.target).toBe('address2.canton')
    expect(rule?.cel).toBe(
      compileGroup({
        join: 'all',
        conditions: [{ field: 'address2.country2', operator: 'is', value: 'CH', answer: 'choice' }],
      }),
    )
    // The metadata the logic panel reopens from, too — or reopening it would put the old
    // name back.
    expect((rule?.editor as ConditionGroup).conditions[0]).toMatchObject({
      field: 'address2.country2',
    })
  })

  test('and the rules still work where it landed', () => {
    const outcome = withBlock(target(), { parent: [], index: 2 }, saved(), text)
    if (!outcome.ok) throw new Error(outcome.message)
    const engine = createFormEngine({ schema: outcome.document, capabilities: CLOCK })

    expect(engine.getFieldSnapshot(['address2', 'canton']).visible).toBe(false)
    engine.setValue(['address2', 'country2'], 'CH')
    expect(engine.getFieldSnapshot(['address2', 'canton']).visible).toBe(true)
  })

  test('inside a group, where its paths gain the group', () => {
    const outcome = withBlock(
      target([
        {
          key: 'contact',
          type: 'group',
          label: 'Contact',
          fields: [{ key: 'phone', type: 'text', label: 'Phone' }],
        },
      ]),
      { parent: ['contact'], index: 1 },
      saved(),
      text,
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.document.logic?.rules?.[0]?.target).toBe('contact.address2.canton')
  })

  test('and brings its words, keeping the form’s own', () => {
    const outcome = withBlock(target(), { parent: [], index: 2 }, saved(), text)
    if (!outcome.ok) throw new Error(outcome.message)

    expect(outcome.document.i18n?.messages).toEqual({
      en: { greeting: 'Hello', 'address.title': 'Postal address' },
      de: { 'address.title': 'Postanschrift' },
    })
  })

  test('and a word the form already says differently is renamed, as a key is', () => {
    // Refused, as it was first, a block saved from one form could not go into the next
    // one that happened to call its heading `title` — and the refusal held for every
    // place in the form, so the palette offered the block and then nowhere to put it.
    const clashing = {
      ...target(),
      i18n: { defaultLocale: 'en', messages: { en: { 'address.title': 'Home address' } } },
    } as unknown as FormSchema

    const outcome = withBlock(clashing, { parent: [], index: 2 }, saved(), text)
    if (!outcome.ok) throw new Error(outcome.message)

    expect(outcome.document.i18n?.messages).toEqual({
      en: { 'address.title': 'Home address', 'address.title2': 'Postal address' },
      de: { 'address.title2': 'Postanschrift' },
    })
    expect(outcome.document.model.fields[2]?.label).toEqual({ $t: 'address.title2' })
    expect(validateSchema(outcome.document)).toMatchObject({ valid: true })
  })

  test('while a word the form says the same way is shared rather than copied', () => {
    const agreeing = {
      ...target(),
      i18n: { defaultLocale: 'en', messages: { en: { 'address.title': 'Postal address' } } },
    } as unknown as FormSchema

    const outcome = withBlock(agreeing, { parent: [], index: 2 }, saved(), text)
    if (!outcome.ok) throw new Error(outcome.message)

    expect(outcome.document.model.fields[2]?.label).toEqual({ $t: 'address.title' })
    expect(Object.keys(outcome.document.i18n?.messages.en ?? {})).toEqual(['address.title'])
  })

  test('a repeater keeps its row rules reading the row, whatever the repeater is called now', () => {
    const rows = {
      specVersion: '4',
      id: 'rows',
      title: 'Rows',
      model: {
        fields: [
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
      logic: {
        rules: [
          { target: 'items[].note', kind: 'visible', cel: 'item.qty != null && item.qty > 3.0' },
        ],
      },
    } as unknown as FormSchema
    const block = blockFrom(rows, ['items'], { id: 'lines', name: 'Lines' }, text)
    if (!block.ok) throw new Error(block.message)

    const outcome = withBlock(
      target([
        { key: 'items', type: 'text', label: 'Items text' },
        { key: 'qty', type: 'number', label: 'Q' },
      ]),
      { parent: [], index: 0 },
      block.block,
      text,
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.document.logic?.rules?.[0]).toMatchObject({
      target: 'items2[].note',
      cel: 'item.qty2 != null && item.qty2 > 3.0',
    })
  })

  test('a block with rules is refused inside a repeater row, where they would be about every row', () => {
    const outcome = withBlock(
      target([
        {
          key: 'rows',
          type: 'repeater',
          label: 'Rows',
          fields: [{ key: 'x', type: 'text', label: 'X' }],
        },
      ]),
      { parent: ['rows'], index: 1 },
      saved(),
      text,
    )

    expect(outcome.ok).toBe(false)
  })

  test('through a session, as one edit that undo takes back', () => {
    const session = createBuilderSession(target())

    const outcome = insertBlock(session, { parent: [], index: 2 }, saved())

    expect(outcome.ok).toBe(true)
    expect(session.document().model.fields.map((field) => field.key)).toEqual([
      'address',
      'country',
      'address2',
    ])
    session.undo()
    expect(session.document().model.fields.map((field) => field.key)).toEqual([
      'address',
      'country',
    ])
  })
})

describe('where a block may go', () => {
  test('anywhere its field may, though the form does not have its words yet', () => {
    // The places were first asked with the block's bare field, whose `$t` references the
    // form has no words for until the block brings them — so every place was refused, and
    // a block with a translated label could be chosen and put nowhere.
    const targets = blockTargets(target(), saved(), text)

    expect(targets.map((place) => place.location)).toContainEqual({ parent: [], index: 2 })
    for (const place of targets) {
      const landed = withBlock(target(), place.location, saved(), text)
      // Offered means it lands: a place the insert then refuses is a dead end.
      expect(landed.ok && validateSchema(landed.document).valid).toBe(true)
    }
  })

  test('but not inside a repeater row when it brings rules, which would be about every row', () => {
    const rows = target([
      {
        key: 'rows',
        type: 'repeater',
        label: 'Rows',
        fields: [{ key: 'x', type: 'text', label: 'X' }],
      },
    ])

    const parents = blockTargets(rows, saved(), text).map((place) => place.location.parent)

    expect(parents).toContainEqual([])
    expect(parents).not.toContainEqual(['rows'])
  })

  test('and each place is named as the field palette names it', () => {
    const [first] = blockTargets(target(), saved(), text)

    expect(first?.label).toBe('Target, before Email address')
  })
})

describe('what a builder says', () => {
  test('saving counts the rules that stayed behind, so nobody finds out by inserting it', () => {
    const session = createBuilderSession(source())

    const { block, said } = saveBlockAndSay(session, ['address'], {
      id: 'p',
      name: 'Postal address',
    })

    expect(block?.name).toBe('Postal address')
    expect(said).toBe(
      'Saved “Postal address” as a block, without the 1 rule that reads fields outside it.',
    )
  })

  test('and a refusal is said as the refusal', () => {
    const session = createBuilderSession(source())

    expect(saveBlockAndSay(session, ['nowhere'], { id: 'p', name: 'P' }).block).toBeUndefined()
  })

  test('inserting names the block and where it went', () => {
    const session = createBuilderSession(target())

    const said = insertBlockAndSay(session, saved(), {
      location: { parent: [], index: 2 },
      label: 'the end of the form',
    })

    expect(said).toBe('Added the block “Postal address” to the end of the form.')
  })
})
