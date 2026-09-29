import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { describeTarget, flatten, nameOf } from './tree.js'

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', label: 'Customer' },
      {
        key: 'billing',
        type: 'group',
        label: 'Billing address',
        fields: [
          { key: 'street', type: 'text', label: 'Street' },
          { key: 'city', type: 'text', label: 'City' },
        ],
      },
      {
        key: 'items',
        type: 'repeater',
        label: 'Items',
        fields: [{ key: 'name', type: 'text', label: 'Name' }],
      },
    ],
  },
}

describe('flatten', () => {
  test('is the order a person reading the form would meet, not the order of the JSON', () => {
    expect(flatten(schema).map((node) => node.keyPath.join('.'))).toEqual([
      'customer',
      'billing',
      'billing.street',
      'billing.city',
      'items',
      'items.name',
    ])
  })

  test('carries depth, so a tree can be drawn and aria-level set', () => {
    const byKey = new Map(flatten(schema).map((node) => [node.keyPath.join('.'), node]))

    expect(byKey.get('customer')?.depth).toBe(0)
    expect(byKey.get('billing.street')?.depth).toBe(1)
    expect(byKey.get('items.name')?.depth).toBe(1)
  })

  test('says which nodes can hold other nodes, so the palette knows where to offer', () => {
    const byKey = new Map(flatten(schema).map((node) => [node.keyPath.join('.'), node]))

    expect(byKey.get('billing')?.isContainer).toBe(true)
    expect(byKey.get('items')?.isContainer).toBe(true)
    expect(byKey.get('customer')?.isContainer).toBe(false)
  })

  test('an empty model flattens to nothing rather than throwing', () => {
    expect(flatten({ ...schema, model: { fields: [] } })).toEqual([])
  })
})

/**
 * A `Location` is `{ parent, index }`, which is exactly right for the engine
 * and useless to a person choosing from a list. WCAG 2.2 SC 2.5.7 requires a
 * keyboard path for every drag operation, and a keyboard path made of
 * "parent=billing index=1" is a keyboard path in the same sense that a wall of
 * hex is a phone number.
 */
describe('describeTarget', () => {
  test('names the container and what the field would land between', () => {
    expect(describeTarget(schema, { parent: [], index: 0 })).toBe('Order, before Customer')
    expect(describeTarget(schema, { parent: [], index: 1 })).toBe(
      'Order, between Customer and Billing address',
    )
    expect(describeTarget(schema, { parent: [], index: 3 })).toBe('Order, after Items')
  })

  test('uses the container label rather than its key', () => {
    expect(describeTarget(schema, { parent: ['billing'], index: 0 })).toBe(
      'Billing address, before Street',
    )
  })

  test('an empty container says so, instead of naming neighbours it does not have', () => {
    const empty: FormSchema = {
      ...schema,
      model: { fields: [{ key: 'blank', type: 'group', label: 'Blank', fields: [] }] },
    }

    expect(describeTarget(empty, { parent: ['blank'], index: 0 })).toBe('Blank, as its first field')
  })

  test('falls back to the key when a field has no label', () => {
    const unlabelled: FormSchema = {
      ...schema,
      model: { fields: [{ key: 'nameless', type: 'text' }] },
    }

    expect(describeTarget(unlabelled, { parent: [], index: 0 })).toBe('Order, before nameless')
  })
})

describe('describeTarget when a field is being moved', () => {
  test('describes the container as it will be, not as it is', () => {
    // The top level is Customer, Billing address, Items. Lift Customer out and
    // it is Billing address, Items — so index 1 is between them, and index 2 is
    // the end. Described against the document as it stands, index 2 would be
    // "after Items" only by accident and index 1 would name Customer itself,
    // the field doing the travelling.
    expect(describeTarget(schema, { parent: [], index: 1 }, ['customer'])).toBe(
      'Order, between Billing address and Items',
    )
    expect(describeTarget(schema, { parent: [], index: 2 }, ['customer'])).toBe(
      'Order, after Items',
    )
    // And without the hint, the same index names the traveller — which is the
    // bug this argument exists to prevent.
    expect(describeTarget(schema, { parent: [], index: 1 })).toBe(
      'Order, between Customer and Billing address',
    )
  })

  test('a field moving into a different container still sees every sibling', () => {
    expect(describeTarget(schema, { parent: ['billing'], index: 1 }, ['customer'])).toBe(
      'Billing address, between Street and City',
    )
  })

  test('the last field leaving its container leaves it empty', () => {
    const solo: FormSchema = {
      ...schema,
      model: {
        fields: [
          { key: 'only', type: 'text', label: 'Only' },
          { key: 'bag', type: 'group', label: 'Bag', fields: [{ key: 'x', type: 'text', label: 'X' }] },
        ],
      },
    }

    expect(describeTarget(solo, { parent: [], index: 0 }, ['only'])).toBe('Order, before Bag')
  })
})

/**
 * A translated form is the one whose structure is hardest to read, so it is the
 * one the builder must not fall back to keys on.
 */
describe('a form written in message references', () => {
  const translated: FormSchema = {
    specVersion: '1',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'customer', type: 'text', label: { $t: 'customer' } },
        { key: 'qty', type: 'number', label: { $t: 'qty' } },
        { key: 'nameless', type: 'text' },
      ],
    },
    i18n: {
      defaultLocale: 'en',
      messages: {
        en: { customer: 'Customer', qty: 'Quantity' },
        de: { customer: 'Kundin oder Kunde', qty: 'Menge' },
      },
    },
  }

  test('the tree shows the words, not the message ids or the keys', () => {
    expect(flatten(translated).map((node) => nameOf(translated, node.def))).toEqual([
      'Customer',
      'Quantity',
      // No label at all, so the key is the honest answer.
      'nameless',
    ])
  })

  test('destinations name the fields the same way', () => {
    expect(describeTarget(translated, { parent: [], index: 1 })).toBe(
      'Order, between Customer and Quantity',
    )
  })

  test('resolved in the default locale, which the spec guarantees is complete', () => {
    // Not the browser's locale and not a parameter: the builder edits one
    // document, and the default locale is the only one every reference is
    // required to resolve in.
    expect(nameOf(translated, translated.model.fields[0]!)).toBe('Customer')
  })
})
