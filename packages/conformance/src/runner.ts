import type {
  ConformanceMessage,
  DriverFactory,
  MountOptions,
  RendererDriver,
  SubmitResult,
} from './driver.js'
import { BACK_COMMAND, NEXT_COMMAND, addItemCommand, removeItemCommand } from './paths.js'
import type { Fixture, FixtureStep, StepKind } from './types.js'
import { parseFixture, stepKind } from './validate.js'

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'crashed'
export type FixtureStatus = 'passed' | 'failed' | 'crashed'

/**
 * One assertion that did not hold.
 *
 * Carries the fixture name and the step index because the person reading it is
 * usually implementing a renderer and has never seen this fixture: "expected
 * ['canton'], got []" on its own tells them nothing about which case broke.
 */
export interface StepFailure {
  readonly fixture: string
  /** Zero-based index into `fixture.steps`. */
  readonly index: number
  readonly kind: StepKind
  /** The whole story, formatted for a test runner's output. */
  readonly message: string
  readonly expected: unknown
  readonly actual: unknown
  /** The accessible tree at the moment of failure, when the driver could give one. */
  readonly ariaSnapshot?: string
}

/**
 * The driver threw. This is a different kind of event from a failed assertion:
 * the implementation broke, so nothing after it means anything.
 */
export interface DriverCrash {
  /**
   * `fixture` is the one phase where the driver is innocent: the case itself
   * could not run at all — a malformed fixture, or a driver factory that threw
   * — and `runSuite` reports it this way rather than letting one broken case
   * abort the whole run.
   */
  readonly phase: 'mount' | 'step' | 'unmount' | 'fixture'
  /** Absent when the driver never reached a step. */
  readonly stepIndex?: number
  readonly message: string
  /** The value the driver threw, rethrown verbatim by `assertFixtureResult`. */
  readonly error: unknown
}

export interface StepOutcome {
  readonly index: number
  readonly kind: StepKind
  readonly step: FixtureStep
  readonly status: StepStatus
  readonly failure?: StepFailure
}

export interface FixtureResult {
  readonly fixture: string
  readonly status: FixtureStatus
  readonly steps: readonly StepOutcome[]
  /** At most one: the run stops at the first failure. */
  readonly failure?: StepFailure
  readonly crash?: DriverCrash
  /**
   * An unmount that threw AFTER a step had already failed or crashed. Kept
   * apart from `crash` so teardown noise never rewrites the verdict: the step
   * outcome is the story, this is the footnote.
   */
  readonly teardownError?: DriverCrash
}

export interface SuiteResult {
  readonly results: readonly FixtureResult[]
  readonly passed: number
  readonly failed: number
  readonly crashed: number
  readonly status: FixtureStatus
  /** A summary plus every failure, for a CI log. */
  readonly report: string
}

/**
 * Run one fixture against one driver and report what happened.
 *
 * Reports, never throws: a failed assertion is data here, so a suite can run
 * every case and a self-certifying third party can count how far off they are.
 * The two exceptions are deliberate — a malformed fixture throws, because a
 * case that cannot be read is a bug in the suite rather than a verdict on the
 * renderer, and a driver that throws is reported as a crash distinct from a
 * failure. `assertFixtureResult` turns a reported result back into a throw for
 * a test framework.
 */
export async function runFixture(fixture: Fixture, driver: RendererDriver): Promise<FixtureResult> {
  // Loudly: a fixture with a typo would otherwise assert nothing and pass.
  parseFixture(fixture)

  try {
    await driver.mount(fixture.schema, mountOptionsFor(fixture))
  } catch (error) {
    return {
      fixture: fixture.name,
      status: 'crashed',
      steps: [],
      crash: { phase: 'mount', message: messageOf(error), error },
    }
  }

  const outcomes: StepOutcome[] = []
  const context: RunContext = { driver }
  let failure: StepFailure | undefined
  let crash: DriverCrash | undefined

  for (const [index, step] of fixture.steps.entries()) {
    const kind = stepKind(step)

    // Everything after the first failure is a consequence of it, and reporting
    // consequences buries the cause.
    if (failure !== undefined || crash !== undefined) {
      outcomes.push({ index, kind, step, status: 'skipped' })
      continue
    }

    try {
      const mismatch = await performStep(step, context)
      if (mismatch === undefined) {
        outcomes.push({ index, kind, step, status: 'passed' })
      } else {
        failure = await describeFailure(fixture, index, kind, mismatch, driver)
        outcomes.push({ index, kind, step, status: 'failed', failure })
      }
    } catch (error) {
      crash = { phase: 'step', stepIndex: index, message: messageOf(error), error }
      outcomes.push({ index, kind, step, status: 'crashed' })
    }
  }

  let teardownError: DriverCrash | undefined
  if (driver.unmount !== undefined) {
    try {
      await driver.unmount()
    } catch (error) {
      const thrown: DriverCrash = { phase: 'unmount', message: messageOf(error), error }
      // After a clean run a throwing teardown is the only thing wrong, so it
      // is the crash: a passing case may not leak into the next one. After a
      // failure or a step crash it must NOT take over — masking an assertion
      // failure with teardown noise would hide the reason the case failed.
      if (failure === undefined && crash === undefined) crash = thrown
      else teardownError = thrown
    }
  }

  return {
    fixture: fixture.name,
    status: crash !== undefined ? 'crashed' : failure !== undefined ? 'failed' : 'passed',
    steps: outcomes,
    ...(failure === undefined ? {} : { failure }),
    ...(crash === undefined ? {} : { crash }),
    ...(teardownError === undefined ? {} : { teardownError }),
  }
}

/** Run every fixture. One broken case never stops the rest: the value of a
 *  conformance run is the whole picture, not the first thing that went wrong. */
export async function runSuite(
  fixtures: readonly Fixture[],
  driver: RendererDriver | DriverFactory,
): Promise<SuiteResult> {
  const results: FixtureResult[] = []

  for (const [index, fixture] of fixtures.entries()) {
    try {
      results.push(await runFixture(fixture, await resolveDriver(driver)))
    } catch (error) {
      // A fixture that cannot even run — malformed, or a throwing driver
      // factory — is one crashed result, not the end of the run: the value of
      // a conformance run is the whole picture.
      results.push({
        fixture: fixtureName(fixture, index),
        status: 'crashed',
        steps: [],
        crash: { phase: 'fixture', message: messageOf(error), error },
      })
    }
  }

  const passed = results.filter((result) => result.status === 'passed').length
  const failed = results.filter((result) => result.status === 'failed').length
  const crashed = results.filter((result) => result.status === 'crashed').length

  return {
    results,
    passed,
    failed,
    crashed,
    status: crashed > 0 ? 'crashed' : failed > 0 ? 'failed' : 'passed',
    report: formatSuite(results, passed, failed, crashed),
  }
}

/**
 * A factory is called once per fixture, never once per suite: a browser
 * renderer needs a container of its own for each case, and a case that
 * inherited the previous one's DOM would pass or fail for the wrong reason.
 */
export async function resolveDriver(
  driver: RendererDriver | DriverFactory,
): Promise<RendererDriver> {
  return typeof driver === 'function' ? await driver() : driver
}

/**
 * Throw what a test framework expects: the driver's own error for a crash, so
 * its stack survives, and a formatted assertion error for a failure.
 */
export function assertFixtureResult(result: FixtureResult): void {
  if (result.crash !== undefined) throw result.crash.error
  if (result.failure !== undefined) throw new ConformanceAssertionError(result.failure)
}

export class ConformanceAssertionError extends Error {
  readonly failure: StepFailure

  constructor(failure: StepFailure) {
    super(failure.message)
    this.name = 'ConformanceAssertionError'
    this.failure = failure
  }
}

interface RunContext {
  readonly driver: RendererDriver
  /** The most recent `submit`, which `expectSubmit` asserts against. */
  lastSubmit?: SubmitResult
}

interface Mismatch {
  readonly detail: string
  readonly expected: unknown
  readonly actual: unknown
}

async function performStep(step: FixtureStep, context: RunContext): Promise<Mismatch | undefined> {
  const { driver } = context

  if ('set' in step) {
    for (const [path, value] of Object.entries(step.set)) await driver.fill(path, value)
    return undefined
  }

  if ('activate' in step) {
    await driver.activate(step.activate)
    return undefined
  }

  if ('addItem' in step) {
    await driver.activate(addItemCommand(step.addItem))
    return undefined
  }

  if ('removeItem' in step) {
    await driver.activate(removeItemCommand(step.removeItem.path, step.removeItem.index))
    return undefined
  }

  if ('next' in step) {
    await driver.activate(NEXT_COMMAND)
    return undefined
  }

  if ('back' in step) {
    await driver.activate(BACK_COMMAND)
    return undefined
  }

  if ('submit' in step) {
    context.lastSubmit = await driver.submit()
    return undefined
  }

  if ('expectVisible' in step) {
    const visible = await driver.visibleFields()
    const missing = step.expectVisible.filter((path) => !visible.includes(path))
    if (missing.length === 0) return undefined
    return {
      detail: `${list(missing)} should be visible`,
      expected: [...step.expectVisible],
      actual: [...visible],
    }
  }

  if ('expectHidden' in step) {
    const visible = await driver.visibleFields()
    const shown = step.expectHidden.filter((path) => visible.includes(path))
    if (shown.length === 0) return undefined
    return {
      detail: `${list(shown)} should be hidden`,
      expected: [],
      actual: shown,
    }
  }

  if ('expectValue' in step) {
    const expected = step.expectValue
    const actual: Record<string, unknown> = {}
    for (const path of Object.keys(expected)) actual[path] = await driver.valueOf(path)
    if (structuralEqual(expected, actual)) return undefined
    return { detail: 'values differ', expected, actual }
  }

  if ('expectErrors' in step) {
    const messages = await driver.errorsFor()
    const expected: Record<string, readonly string[]> = {}
    const actual: Record<string, readonly string[]> = {}
    for (const [path, codes] of Object.entries(step.expectErrors)) {
      expected[path] = [...codes].sort()
      actual[path] = codesAt(messages, path)
    }
    if (structuralEqual(expected, actual)) return undefined
    return { detail: 'message codes differ', expected, actual }
  }

  if ('expectNoErrors' in step) {
    const scope = step.expectNoErrors
    const messages = await driver.errorsFor()
    const offending =
      scope === true ? messages : messages.filter((message) => scope.includes(message.path))
    if (offending.length === 0) return undefined
    return { detail: 'there should be no messages', expected: [], actual: offending.map(summarize) }
  }

  if ('expectSubmit' in step) {
    const result = context.lastSubmit
    if (result === undefined) {
      return { detail: 'no submit step has run yet', expected: step.expectSubmit, actual: undefined }
    }
    if (result.status !== step.expectSubmit.status) {
      return {
        detail: `submit was ${result.status}`,
        expected: step.expectSubmit.status,
        actual: { status: result.status, messages: result.messages.map(summarize) },
      }
    }
    const data = step.expectSubmit.data
    if (data !== undefined && !structuralEqual(data, result.data)) {
      return { detail: 'the submitted payload differs', expected: data, actual: result.data }
    }
    return undefined
  }

  if ('expectPage' in step) {
    const page = await driver.currentPage()
    if (page === step.expectPage) return undefined
    return { detail: 'the wizard is on another page', expected: step.expectPage, actual: page }
  }

  return assertNever(step)
}

async function describeFailure(
  fixture: Fixture,
  index: number,
  kind: StepKind,
  mismatch: Mismatch,
  driver: RendererDriver,
): Promise<StepFailure> {
  const snapshot = await snapshotQuietly(driver)
  const lines = [
    `${fixture.name} - step ${index} (${kind}) failed: ${mismatch.detail}`,
    `  expected: ${render(mismatch.expected)}`,
    `  actual:   ${render(mismatch.actual)}`,
  ]
  if (snapshot !== undefined && snapshot !== '') {
    lines.push('  accessible tree:', indent(snapshot))
  }

  return {
    fixture: fixture.name,
    index,
    kind,
    message: lines.join('\n'),
    expected: mismatch.expected,
    actual: mismatch.actual,
    ...(snapshot === undefined ? {} : { ariaSnapshot: snapshot }),
  }
}

/** A snapshot is diagnostics. A driver that cannot produce one has already
 *  failed the case being reported, and must not mask it with a second error. */
async function snapshotQuietly(driver: RendererDriver): Promise<string | undefined> {
  try {
    return await driver.ariaSnapshot()
  } catch {
    return undefined
  }
}

function mountOptionsFor(fixture: Fixture): MountOptions | undefined {
  return fixture.initialValues === undefined ? undefined : { initialValues: fixture.initialValues }
}

function codesAt(messages: readonly ConformanceMessage[], path: string): readonly string[] {
  return messages
    .filter((message) => message.path === path)
    .map((message) => message.code)
    .sort()
}

function summarize(message: ConformanceMessage): string {
  return `${message.path}: ${message.code}`
}

/**
 * The equality every `expect*` step asserts with. TOTAL by design: the
 * expected side is validated JSON, but the actual side is whatever a driver
 * answered, and a driver under test answers undefined, NaN or Infinity
 * precisely when it is broken — the moment the comparison must produce a
 * FAILURE with expected versus actual, never throw and turn the verdict into
 * a crash. (The spec's `canonicalize` throws on all three, which is right for
 * a wire format and wrong here.)
 *
 * So every value is ordinary and comparable: NaN equals NaN — this is an
 * assertion comparator, not IEEE arithmetic — and null never equals undefined,
 * at any depth including the top, because "the value is null" and "there is no
 * value" are different driver answers. Key order never decides a verdict.
 *
 * Exported for its own tests; deliberately not re-exported from index.ts.
 */
export function structuralEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isNaN(left) && Number.isNaN(right)
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => structuralEqual(item, right[index]))
  }
  if (typeof left === 'object' && typeof right === 'object' && left !== null && right !== null) {
    const a = left as Record<string, unknown>
    const b = right as Record<string, unknown>
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    // hasOwn, not `in` or a value check: `{a: undefined}` and `{}` differ.
    return keys.every((key) => Object.hasOwn(b, key) && structuralEqual(a[key], b[key]))
  }
  return false
}

function render(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

function list(paths: readonly string[]): string {
  return paths.map((path) => JSON.stringify(path)).join(', ')
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A fixture broken enough to crash may not even carry a readable name. */
function fixtureName(fixture: Fixture, index: number): string {
  const name: unknown = (fixture as { name?: unknown } | undefined)?.name
  return typeof name === 'string' && name !== '' ? name : `fixtures[${index}]`
}

function formatSuite(
  results: readonly FixtureResult[],
  passed: number,
  failed: number,
  crashed: number,
): string {
  const lines = [`${passed} passed, ${failed} failed, ${crashed} crashed`]
  for (const result of results) {
    if (result.failure !== undefined) lines.push('', result.failure.message)
    if (result.crash !== undefined) {
      lines.push('', `${result.fixture} - driver crashed during ${result.crash.phase}: ${result.crash.message}`)
    }
    if (result.teardownError !== undefined) {
      lines.push(`${result.fixture} - teardown also threw: ${result.teardownError.message}`)
    }
  }
  return lines.join('\n')
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled step: ${JSON.stringify(value)}`)
}
