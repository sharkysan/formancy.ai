import { builtinFixtures } from './builtin-fixtures.js'
import type { DriverFactory, RendererDriver } from './driver.js'
import type { Fixture } from './types.js'
import { assertFixtureResult, resolveDriver, runFixture } from './runner.js'

/**
 * The slice of a test framework this package needs: two functions.
 *
 * Injected rather than imported, and the reason is the whole point of the
 * package. The React renderer will run under Vitest, the Angular renderer may
 * well run under Jasmine, the engine's Node suite might use `node:test`, and a
 * third party certifying a Svelte renderer will use whatever they already have.
 * A conformance suite that could only be hosted by one runner would quietly
 * exclude half the implementations it exists to keep honest — and importing
 * Vitest here would put a test framework in the dependency tree of a published
 * package.
 */
export interface ConformanceTestApi {
  describe(name: string, body: () => void): void
  test(name: string, body: () => Promise<void> | void): void
}

export interface DescribeConformanceOptions {
  /**
   * Vitest, Jest, Jasmine, `node:test`. Optional only because a runner with
   * globals enabled already put `describe` and `test` on `globalThis`.
   */
  readonly test?: ConformanceTestApi
  /** Defaults to the whole built-in suite. */
  readonly fixtures?: readonly Fixture[]
  /** The suite name, e.g. the renderer package. Defaults to `conformance`. */
  readonly name?: string
  /**
   * Fixture name to the reason it is skipped.
   *
   * A reason is mandatory, and it is printed in the case name, because a
   * silently skipped case is how a renderer ends up advertising conformance it
   * does not have. A name no fixture has is an error rather than a no-op: a
   * skip left behind after a case was renamed would put the case back into the
   * run without anyone deciding that.
   */
  readonly skip?: Readonly<Record<string, string>>
}

/**
 * Bind the conformance suite to a test framework: one case per fixture.
 *
 * ```ts
 * import { describe, test } from 'vitest'
 * describeConformance(() => createReactDriver(), { test: { describe, test } })
 * ```
 *
 * A failure throws a `ConformanceAssertionError` carrying the fixture name, the
 * step index and expected versus actual. A driver that throws rethrows the
 * driver's own error, stack intact, so the two are never confused: one means
 * the renderer behaves differently, the other means it broke.
 */
export function describeConformance(
  driver: RendererDriver | DriverFactory,
  options: DescribeConformanceOptions = {},
): void {
  const fixtures = options.fixtures ?? builtinFixtures
  const api = resolveTestApi(options.test)
  const skip = options.skip ?? {}

  if (fixtures.length === 0) {
    throw new Error('describeConformance was given no fixtures, so it would certify nothing.')
  }

  const names = new Set(fixtures.map((fixture) => fixture.name))
  for (const name of Object.keys(skip)) {
    if (!names.has(name)) {
      throw new Error(
        `describeConformance was told to skip "${name}", which is not in the suite. Was the fixture renamed?`,
      )
    }
  }

  api.describe(options.name ?? 'conformance', () => {
    for (const fixture of fixtures) {
      const reason = skip[fixture.name]
      if (reason !== undefined) {
        api.test(`${fixture.name} [skipped: ${reason}]`, () => undefined)
        continue
      }

      api.test(fixture.name, async () => {
        assertFixtureResult(await runFixture(fixture, await resolveDriver(driver)))
      })
    }
  })
}

interface RunnerGlobals {
  readonly describe?: unknown
  readonly test?: unknown
  readonly it?: unknown
}

function resolveTestApi(injected: ConformanceTestApi | undefined): ConformanceTestApi {
  if (injected !== undefined) return injected

  // `globalThis` is ECMAScript, not a Node or DOM global, so reading it here
  // keeps the package runnable in a browser.
  const globals = globalThis as RunnerGlobals
  const describe = globals.describe
  const test = globals.test ?? globals.it

  if (typeof describe === 'function' && typeof test === 'function') {
    return {
      describe: describe as ConformanceTestApi['describe'],
      test: test as ConformanceTestApi['test'],
    }
  }

  throw new Error(
    'describeConformance found no test framework. Pass one: describeConformance(driver, { test: { describe, test } }).',
  )
}
