import { describe, expect, test } from 'vitest'
import { builtinFixtures } from './builtin-fixtures.js'
import { parseFixture, stepKind } from './validate.js'

describe('builtinFixtures', () => {
  test('every case still validates against the fixture format', () => {
    for (const fixture of builtinFixtures) {
      expect(() => parseFixture(fixture), fixture.name).not.toThrow()
    }
  })

  test('no two cases share a name, because the name is the test id', () => {
    const names = builtinFixtures.map((fixture) => fixture.name)

    expect(new Set(names).size).toBe(names.length)
  })

  /**
   * Named one by one rather than counted: this file is generated from
   * fixtures/*.json, and a case that silently stopped being embedded would
   * leave every renderer passing a suite that no longer tests it.
   */
  test('embeds the whole starter suite', () => {
    expect(builtinFixtures.map((fixture) => fixture.name).sort()).toEqual([
      'a calculated field recomputes from its inputs and is never typed into',
      'a hidden value is dropped only when the field asks for it',
      'a repeating group validates each item and re-indexes when one is removed',
      'a required field blocks submit until it has a value',
      'a wizard validates the current page on next and the whole form on submit',
      'conditional visibility follows country',
    ])
  })

  test('every case asserts something, rather than only driving the form', () => {
    for (const fixture of builtinFixtures) {
      const kinds = fixture.steps.map(stepKind)
      expect(
        kinds.some((kind) => kind.startsWith('expect')),
        fixture.name,
      ).toBe(true)
    }
  })

  test('every case explains why its behaviour is the correct one', () => {
    for (const fixture of builtinFixtures) {
      expect(fixture.description ?? '', fixture.name).not.toBe('')
    }
  })
})
