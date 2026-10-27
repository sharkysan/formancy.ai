import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { ticked } from './ticked.js'

/**
 * An exclusive option — "None of these" — chosen alone or not at all (0199): refused by the
 * engine with anything else, browser and server alike, and never produced by a control.
 */
const allergies: FieldDef = {
  key: 'allergies',
  type: 'selectboxes',
  label: 'Allergies',
  options: [
    { value: 'nuts', label: 'Nuts' },
    { value: 'milk', label: 'Milk' },
    { value: 'none', label: 'None of these', exclusive: true },
    { value: 'unsaid', label: 'Prefer not to say', exclusive: true },
  ],
}

const form: FormSchema = { specVersion: '5', id: 'health', title: 'Health', model: { fields: [allergies] } }

const errorsFor = (value: unknown): readonly string[] => {
  const engine = createFormEngine({ schema: form, initialValue: { allergies: value } })
  engine.submit()
  return engine.getFieldSnapshot(['allergies']).errors
}

describe('an exclusive option', () => {
  // A payload posted at the server never went through a control, so the engine refuses what
  // the control would never have produced: "None of these" and "Nuts" at once.
  test('held with anything else is refused', () => {
    expect(errorsFor(['nuts', 'none'])).toEqual(['exclusive'])
    expect(errorsFor(['none', 'unsaid'])).toEqual(['exclusive'])
  })

  test('held alone, or not at all, is an answer', () => {
    expect(errorsFor(['none'])).toEqual([])
    expect(errorsFor(['nuts', 'milk'])).toEqual([])
  })
})

describe('a tick', () => {
  // In the options' own order, as before: two people choosing the same answers store the
  // same array.
  test('adds the option in the options’ order, and unticking takes it out', () => {
    expect(ticked(allergies, ['milk'], 'nuts', true)).toEqual(['nuts', 'milk'])
    expect(ticked(allergies, ['nuts', 'milk'], 'nuts', false)).toEqual(['milk'])
  })

  // What the person meant by ticking "None" is that nothing else applies.
  test('on an exclusive option clears every other, an exclusive one included', () => {
    expect(ticked(allergies, ['nuts', 'milk'], 'none', true)).toEqual(['none'])
    expect(ticked(allergies, ['none'], 'unsaid', true)).toEqual(['unsaid'])
  })

  // And ticking something after "None" means "None" no longer holds.
  test('on any other clears the exclusive ones', () => {
    expect(ticked(allergies, ['none'], 'milk', true)).toEqual(['milk'])
  })
})
