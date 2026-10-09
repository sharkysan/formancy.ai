import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { placedGroup, placedPage } from './placed-group.js'

/**
 * A group an arrangement places whole (0151).
 *
 * The validator accepts a layout node naming a group, and the engine has no field there, so
 * both renderers asked it for one and threw `Unknown field`. What such a group draws, and
 * on which page, is decided here once and read by both.
 */
const schema: FormSchema = {
  specVersion: '4',
  id: 'claim',
  title: 'Claim',
  model: {
    fields: [
      {
        key: 'you',
        type: 'page',
        label: 'You',
        fields: [{ key: 'name', type: 'text', label: 'Name' }],
      },
      {
        key: 'trip',
        type: 'page',
        label: 'Trip',
        fields: [
          {
            key: 'address',
            type: 'group',
            label: 'Address',
            fields: [
              { key: 'street', type: 'text', label: 'Street' },
              {
                key: 'stops',
                type: 'repeater',
                label: 'Stops',
                fields: [{ key: 'town', type: 'text', label: 'Town' }],
              },
              {
                key: 'geo',
                type: 'group',
                fields: [{ key: 'lat', type: 'number', label: 'Latitude' }],
              },
              { key: 'city', type: 'text', label: 'City' },
            ],
          },
        ],
      },
    ],
  },
} as FormSchema

const engine = () =>
  createFormEngine({ schema, initialValue: { address: { stops: [{ town: 'Bern' }] } } })

describe('a group an arrangement places whole', () => {
  test('draws its fields in the order a form with no arrangement does, then its repeaters', () => {
    // A nested group is a dot, as everywhere else; a repeater's rows are its own, so they
    // are not listed beside the fields.
    expect(placedGroup(engine(), 'address')).toMatchObject({
      def: { key: 'address', label: 'Address' },
      fields: ['address.street', 'address.geo.lat', 'address.city'],
      repeaters: ['address.stops'],
    })
  })

  test('is nothing for a path that is not a group', () => {
    expect(placedGroup(engine(), 'name')).toBeUndefined()
    expect(placedGroup(engine(), 'address.street')).toBeUndefined()
    expect(placedGroup(engine(), 'address.stops')).toBeUndefined()
  })

  test('is on the page of what it draws, where asking the engine threw', () => {
    // `engine.pageOf` knows fields and repeaters; a paged form asked it about a placed
    // group to decide whether to draw it on this step, and threw.
    expect(() => engine().pageOf(['address'])).toThrow(/Unknown field/)
    expect(placedPage(engine(), 'address')).toBe(1)
    expect(placedPage(engine(), 'name')).toBe(0)
    expect(placedPage(engine(), 'address.stops')).toBe(1)
  })
})
