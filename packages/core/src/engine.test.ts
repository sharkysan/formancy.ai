import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

const schema: FormSchema = {
  specVersion: '0',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      {
        key: 'intro',
        type: 'page',
        fields: [
          { key: 'email', type: 'text', required: true },
          {
            key: 'address',
            type: 'group',
            fields: [
              { key: 'city', type: 'text', required: true },
              { key: 'zip', type: 'text' },
            ],
          },
        ],
      },
      {
        key: 'details',
        type: 'page',
        fields: [
          { key: 'newsletter', type: 'checkbox' },
          { key: 'message', type: 'textarea' },
        ],
      },
    ],
  },
}

describe('createFormEngine: the schema walk', () => {
  test('lists every input field with its data path', () => {
    const engine = createFormEngine({ schema })

    expect(engine.fieldPaths().sort()).toEqual(
      ['email', 'address.city', 'address.zip', 'newsletter', 'message'].sort(),
    )
  })

  test('a group scopes its children into a nested object path', () => {
    const engine = createFormEngine({ schema })
    expect(engine.fieldPaths()).toContain('address.city')
  })

  test('a page does NOT scope data: moving a field between pages must never be a data migration', () => {
    const engine = createFormEngine({ schema })

    expect(engine.fieldPaths()).toContain('email')
    expect(engine.fieldPaths().some((p) => p.startsWith('intro'))).toBe(false)
  })

  test('remembers which page a field lives on, for wizard-scoped validation', () => {
    const engine = createFormEngine({ schema })

    expect(engine.pageOf(['email'])).toBe(0)
    expect(engine.pageOf(['address', 'city'])).toBe(0)
    expect(engine.pageOf(['message'])).toBe(1)
  })
})

describe('createFormEngine: snapshots', () => {
  test('a field snapshot carries value, requiredness, touched state and its ids', () => {
    const engine = createFormEngine({ schema, initialValue: { email: 'a@b.ch' } })

    const snapshot = engine.getFieldSnapshot(['email'])

    expect(snapshot.value).toBe('a@b.ch')
    expect(snapshot.required).toBe(true)
    expect(snapshot.touched).toBe(false)
    expect(snapshot.ids.control).toContain('email')
  })

  test('setValue is visible in the next snapshot', () => {
    const engine = createFormEngine({ schema })

    engine.setValue(['email'], 'x@y.ch')

    expect(engine.getFieldSnapshot(['email']).value).toBe('x@y.ch')
  })

  test('snapshots are identity-stable: an untouched field keeps the same snapshot object', () => {
    const engine = createFormEngine({ schema })
    const emailBefore = engine.getFieldSnapshot(['email'])
    const cityBefore = engine.getFieldSnapshot(['address', 'city'])

    engine.setValue(['email'], 'x@y.ch')

    expect(engine.getFieldSnapshot(['address', 'city'])).toBe(cityBefore)
    expect(engine.getFieldSnapshot(['email'])).not.toBe(emailBefore)
  })

  test('touching a field changes only that field snapshot', () => {
    const engine = createFormEngine({ schema })
    const email = engine.getFieldSnapshot(['email'])
    const city = engine.getFieldSnapshot(['address', 'city'])

    engine.touch(['email'])

    expect(engine.getFieldSnapshot(['email'])).not.toBe(email)
    expect(engine.getFieldSnapshot(['email']).touched).toBe(true)
    expect(engine.getFieldSnapshot(['address', 'city'])).toBe(city)
  })

  test('subscribeField wakes exactly the fields whose snapshot changed', () => {
    const engine = createFormEngine({ schema })
    const woken: string[] = []
    engine.subscribeField(['email'], () => woken.push('email'))
    engine.subscribeField(['message'], () => woken.push('message'))

    engine.setValue(['email'], 'x@y.ch')

    expect(woken).toEqual(['email'])
  })
})

describe('createFormEngine: required validation', () => {
  test('an empty required field reports the "required" error code', () => {
    const engine = createFormEngine({ schema })

    const report = engine.validate()

    expect(report.valid).toBe(false)
    expect(report.errors['email']).toEqual(['required'])
    expect(report.errors['address.city']).toEqual(['required'])
  })

  test('a filled required field is clean, and optional fields never require', () => {
    const engine = createFormEngine({
      schema,
      initialValue: { email: 'a@b.ch', address: { city: 'Zurich' } },
    })

    const report = engine.validate()

    expect(report.valid).toBe(true)
    expect(report.errors).toEqual({})
  })

  test('whitespace does not satisfy a required text field', () => {
    const engine = createFormEngine({ schema, initialValue: { email: '   ', address: { city: 'x' } } })

    expect(engine.validate().errors['email']).toEqual(['required'])
  })

  test('a required checkbox is only satisfied by true', () => {
    const withRequiredBox: FormSchema = {
      ...schema,
      model: { fields: [{ key: 'accept', type: 'checkbox', required: true }] },
    }
    const engine = createFormEngine({ schema: withRequiredBox, initialValue: { accept: false } })

    expect(engine.validate().errors['accept']).toEqual(['required'])
  })

  test('field errors land in the snapshot after validate', () => {
    const engine = createFormEngine({ schema })

    engine.validate()

    expect(engine.getFieldSnapshot(['email']).errors).toEqual(['required'])
  })

  test('submit touches every field and reports the outcome', () => {
    const engine = createFormEngine({ schema })

    const outcome = engine.submit()

    expect(outcome.ok).toBe(false)
    expect(engine.getFieldSnapshot(['email']).touched).toBe(true)
    expect(engine.getFieldSnapshot(['message']).touched).toBe(true)
  })
})

describe('snapshot field type', () => {
  test('a snapshot names its field type, so registries can dispatch on it', () => {
    const engine = createFormEngine({ schema })
    expect(engine.getFieldSnapshot(['email']).type).toBe('text')
    expect(engine.getFieldSnapshot(['message']).type).toBe('textarea')
    expect(engine.getFieldSnapshot(['newsletter']).type).toBe('checkbox')
  })
})
