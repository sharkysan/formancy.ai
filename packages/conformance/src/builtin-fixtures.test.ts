import { describe, expect, test } from 'vitest'
import { modelDataPaths } from '@formancy/spec'
import type { FormModel } from '@formancy/spec'
import { builtinFixtures } from './builtin-fixtures.js'
import { fieldAtPath } from './paths.js'
import { parseFixture, stepKind } from './validate.js'

describe('builtinFixtures', () => {
  test('every case still validates against the fixture format', () => {
    for (const fixture of builtinFixtures) {
      expect(() => parseFixture(fixture), fixture.name).not.toThrow()
    }
  })

  /**
   * The regression an adversarial review proved: fixtures written with the
   * pre-spec `children` key walk to zero data paths under the spec, so an
   * engine-backed driver mounts every one of them as an EMPTY form and the
   * whole suite passes while testing nothing. @formancy/core is deliberately
   * not a dependency here, so the spec's own walk stands in for the engine:
   * `modelDataPaths` is the walk the engine mounts by.
   */
  test('every fixture schema walks to data paths under the spec, so an engine mounts fields', () => {
    for (const fixture of builtinFixtures) {
      // The fixture model is readonly and the spec's is not; the walk never
      // mutates, so the variance is the only difference the cast papers over.
      const paths = modelDataPaths(fixture.schema.model as FormModel)
      expect(paths.length, fixture.name).toBeGreaterThan(0)
    }
  })

  test('the fixture path grammar agrees with the spec walk on every shipped schema', () => {
    for (const fixture of builtinFixtures) {
      for (const path of modelDataPaths(fixture.schema.model as FormModel)) {
        // A row-scoped spec path (`contacts[].email`) is addressed by a
        // fixture step through a concrete index.
        const stepPath = path.replaceAll('[]', '[0]')
        expect(fieldAtPath(fixture.schema, stepPath), `${fixture.name}: ${path}`).toBeDefined()
      }
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
      'a form written in message references renders in the default locale',
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
