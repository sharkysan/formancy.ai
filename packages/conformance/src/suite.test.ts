import { describe, expect, test } from 'vitest'
import { builtinFixtures } from './builtin-fixtures.js'
import { ConformanceAssertionError } from './runner.js'
import type { ConformanceTestApi } from './suite.js'
import { describeConformance } from './suite.js'
import type { ConformanceSchema, Fixture } from './types.js'
import { createFakeDriver } from './testing/fake-driver.js'

const contact: ConformanceSchema = {
  specVersion: '0',
  id: 'contact',
  title: 'Contact us',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email', required: true }] },
}

const passing: Fixture = {
  name: 'email is required',
  schema: contact,
  steps: [{ set: { email: 'ada@example.com' } }, { submit: true }, { expectSubmit: { status: 'accepted' } }],
}

const failing: Fixture = {
  name: 'a deliberately wrong case',
  schema: contact,
  steps: [{ expectValue: { email: 'nobody@example.com' } }],
}

interface Recorder {
  readonly api: ConformanceTestApi
  readonly suites: string[]
  readonly cases: { name: string; body: () => Promise<void> | void }[]
}

function recorder(): Recorder {
  const suites: string[] = []
  const cases: { name: string; body: () => Promise<void> | void }[] = []
  return {
    suites,
    cases,
    api: {
      describe(name, body) {
        suites.push(name)
        body()
      },
      test(name, body) {
        cases.push({ name, body })
      },
    },
  }
}

describe('describeConformance', () => {
  test('registers one case per fixture, named after the fixture', () => {
    const spy = recorder()

    describeConformance(createFakeDriver(), { test: spy.api, fixtures: [passing, failing] })

    expect(spy.suites).toEqual(['conformance'])
    expect(spy.cases.map((entry) => entry.name)).toEqual([passing.name, failing.name])
  })

  test('a registered case resolves when the fixture passes', async () => {
    const spy = recorder()

    describeConformance(createFakeDriver(), { test: spy.api, fixtures: [passing] })

    await expect(spy.cases[0]?.body()).resolves.toBeUndefined()
  })

  test('a registered case throws a formatted assertion when the fixture fails', async () => {
    const spy = recorder()

    describeConformance(createFakeDriver(), { test: spy.api, fixtures: [failing] })

    await expect(spy.cases[0]?.body()).rejects.toThrow(ConformanceAssertionError)
    await expect(spy.cases[0]?.body()).rejects.toThrow(/step 0/)
  })

  test('a registered case rethrows the driver’s own error when it crashes', async () => {
    const spy = recorder()

    describeConformance(createFakeDriver({ crashOn: ['submit'] }), {
      test: spy.api,
      fixtures: [passing],
    })

    await expect(spy.cases[0]?.body()).rejects.toThrow(/fake driver exploded in submit/)
  })

  test('defaults to the built-in suite, so a renderer opts in to all of it', () => {
    const spy = recorder()

    describeConformance(createFakeDriver(), { test: spy.api })

    expect(spy.cases).toHaveLength(builtinFixtures.length)
  })

  test('takes a factory, so a browser renderer gets a fresh driver per case', async () => {
    const spy = recorder()
    let built = 0

    describeConformance(
      () => {
        built += 1
        return createFakeDriver()
      },
      { test: spy.api, fixtures: [passing, passing] },
    )
    await spy.cases[0]?.body()
    await spy.cases[1]?.body()

    expect(built).toBe(2)
  })

  test('shows a skip and its reason in the case name, so nobody skips quietly', () => {
    const spy = recorder()

    describeConformance(createFakeDriver(), {
      test: spy.api,
      fixtures: [failing],
      skip: { [failing.name]: 'no wizard support yet' },
    })

    expect(spy.cases[0]?.name).toContain('no wizard support yet')
    // The body does nothing at all: a skipped case must not touch the driver.
    expect(spy.cases[0]?.body()).toBeUndefined()
  })

  test('refuses a skip naming a fixture that is not in the suite', () => {
    const spy = recorder()

    expect(() =>
      describeConformance(createFakeDriver(), {
        test: spy.api,
        fixtures: [passing],
        skip: { 'a case that was renamed': 'stale' },
      }),
    ).toThrow(/a case that was renamed/)
  })

  test('refuses an empty suite, which would report a renderer as conformant for free', () => {
    const spy = recorder()

    expect(() => describeConformance(createFakeDriver(), { test: spy.api, fixtures: [] })).toThrow(
      /no fixtures/,
    )
  })

  /**
   * The headline call in the README is `describeConformance(driver)` with no
   * second argument, which only works if the globals fallback does. Vitest runs
   * this package with `globals: false`, so these cases install the globals a
   * renderer package would have and take them away again.
   */
  describe('without an injected test api', () => {
    const scope = globalThis as unknown as Record<string, unknown>

    function withGlobals(values: Record<string, unknown>, body: () => void): void {
      const saved = Object.fromEntries(Object.keys(values).map((key) => [key, scope[key]]))
      Object.assign(scope, values)
      try {
        body()
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete scope[key]
          else scope[key] = value
        }
      }
    }

    test('falls back to describe and test on globalThis', () => {
      const spy = recorder()

      withGlobals({ describe: spy.api.describe, test: spy.api.test }, () => {
        describeConformance(createFakeDriver(), { fixtures: [passing] })
      })

      expect(spy.cases.map((entry) => entry.name)).toEqual([passing.name])
    })

    test('accepts a framework that calls it `it`', () => {
      const spy = recorder()

      withGlobals({ describe: spy.api.describe, test: undefined, it: spy.api.test }, () => {
        describeConformance(createFakeDriver(), { fixtures: [passing] })
      })

      expect(spy.cases).toHaveLength(1)
    })

    test('says how to inject one when there is no framework at all', () => {
      expect(() => describeConformance(createFakeDriver(), { fixtures: [passing] })).toThrow(
        /describeConformance\(driver, \{ test/,
      )
    })
  })

  test('names the suite after the renderer when asked', () => {
    const spy = recorder()

    describeConformance(createFakeDriver(), { test: spy.api, fixtures: [passing], name: '@formancy/react' })

    expect(spy.suites).toEqual(['@formancy/react'])
  })
})
