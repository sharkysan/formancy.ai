import { describe, expect, test } from 'vitest'
import * as api from './index.js'

/**
 * The published surface is a contract with people building renderers this repo
 * will never see, so it changes deliberately and visibly, not by an `export *`
 * picking something up on the way past.
 */
describe('the public API', () => {
  test('exports exactly the conformance contract', () => {
    expect(Object.keys(api).sort()).toEqual([
      'BACK_COMMAND',
      'COMMAND_SEPARATOR',
      'ConformanceAssertionError',
      'FixtureError',
      'NEXT_COMMAND',
      'addItemCommand',
      'assertFixtureResult',
      'builtinFixtures',
      'describeConformance',
      'fieldAtPath',
      'loadFixtures',
      'pageKeys',
      'parseFixture',
      'removeItemCommand',
      'runFixture',
      'runSuite',
      'stepKind',
      'validateFixture',
    ])
  })

  test('does not export the fake driver, which exists only to test the harness', () => {
    expect(Object.keys(api)).not.toContain('createFakeDriver')
  })

  test('ships the starter suite ready to run', () => {
    expect(api.builtinFixtures.length).toBeGreaterThan(0)
  })
})
