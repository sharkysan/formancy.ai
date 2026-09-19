import { describe, expect, test } from 'vitest'
import { addItemCommand, fieldAtPath, pageKeys, removeItemCommand } from './paths.js'
import type { ConformanceSchema } from './types.js'

const nested: ConformanceSchema = {
  specVersion: '0',
  id: 'nested',
  title: 'Nested',
  model: {
    fields: [
      {
        key: 'details',
        type: 'page',
        label: 'Your details',
        children: [
          { key: 'firstName', type: 'text', label: 'First name' },
          {
            key: 'address',
            type: 'group',
            label: 'Address',
            children: [{ key: 'street', type: 'text', label: 'Street' }],
          },
          {
            key: 'contacts',
            type: 'repeater',
            label: 'Contacts',
            children: [{ key: 'email', type: 'text', label: 'Email' }],
          },
        ],
      },
    ],
  },
}

describe('fieldAtPath', () => {
  test('sees through a page, because a page is presentation and owns no data', () => {
    expect(fieldAtPath(nested, 'firstName')?.label).toBe('First name')
  })

  test('descends into a group, because a group owns its children’s data', () => {
    expect(fieldAtPath(nested, 'address.street')?.label).toBe('Street')
  })

  test('resolves a repeater item index to the item definition', () => {
    expect(fieldAtPath(nested, 'contacts[0].email')?.label).toBe('Email')
  })

  test('returns undefined for a path no field has', () => {
    expect(fieldAtPath(nested, 'address.nope')).toBeUndefined()
  })

  test('refuses a repeater child addressed without an index', () => {
    expect(fieldAtPath(nested, 'contacts.email')).toBeUndefined()
  })
})

describe('pageKeys', () => {
  test('lists the pages in document order', () => {
    expect(pageKeys(nested)).toEqual(['details'])
  })
})

describe('command paths', () => {
  test('address a repeater’s add control and one item’s remove control', () => {
    expect(addItemCommand('contacts')).toBe('contacts#add')
    expect(removeItemCommand('contacts', 2)).toBe('contacts[2]#remove')
  })
})
