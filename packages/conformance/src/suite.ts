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
  /**
   * Register a case the framework reports as SKIPPED. Optional because not
   * every framework has one — and when it is absent, a skipped case is
   * registered as a test that THROWS rather than one that passes: a skip that
   * counted as a pass would let a renderer advertise conformance it does not
   * have. The vitest/jest wiring is one line:
   * `skip: (name) => test.skip(name, () => {})`.
   */
  skip?(name: string, reason: string): void
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
      // hasOwn: a fixture named like an Object.prototype member ("toString")
      // must not read an inherited function as its skip reason.
      const reason = Object.hasOwn(skip, fixture.name) ? skip[fixture.name] : undefined
      if (reason !== undefined) {
        // The reason travels in the case name either way, so nobody skips
        // quietly. Without a real skip() the case must FAIL rather than pass:
        // a body that resolved would count the skip as conformance.
        const name = `${fixture.name} [skipped: ${reason}]`
        if (api.skip !== undefined) {
          api.skip(name, reason)
        } else {
          api.test(name, () => {
            throw new Error(
              `Skipped, not passing: ${reason}. This test api has no skip(), so the case fails rather than ` +
                `silently counting as conformant. Wire one up: describeConformance(driver, ` +
                `{ test: { describe, test, skip: (name) => test.skip(name, () => {}) } }).`,
            )
          })
        }
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
    // vitest, jest and mocha hang a real skip off the test function itself;
    // wiring it here means a global-mode renderer suite reports skips as
    // skips instead of failing them for want of an injected api.
    const frameworkSkip = (test as { skip?: unknown }).skip
    const skip =
      typeof frameworkSkip === 'function'
        ? (name: string): void => {
            ;(frameworkSkip as (name: string, body: () => void) => void)(name, () => undefined)
          }
        : undefined
    return {
      describe: describe as ConformanceTestApi['describe'],
      test: test as ConformanceTestApi['test'],
      ...(skip === undefined ? {} : { skip }),
    }
  }

  throw new Error(
    'describeConformance found no test framework. Pass one: describeConformance(driver, { test: { describe, test } }).',
  )
}
