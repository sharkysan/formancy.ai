/**
 * @formancy/conformance — one suite, N drivers.
 *
 * formancy ships a React renderer and an Angular renderer over one headless
 * engine. The risk that architecture carries is that the two renderers drift
 * apart, each passing its own tests while behaving differently. This package is
 * the mechanism against that: a behaviour is written down once, as data, and
 * executed against the engine in Node, the engine in a browser, each renderer
 * and the server's revalidation endpoint.
 *
 * It is published so that a third party building a Vue, Svelte or Solid
 * renderer can self-certify against the same cases. Everything exported here is
 * therefore a public contract.
 *
 * The rule that makes it worth more than a test suite is in `driver.ts`: a
 * driver may only reach a control by accessible name and role, so a renderer
 * whose markup cannot be queried that way cannot pass.
 */

export { builtinFixtures } from './builtin-fixtures.js'

export type {
  ConformanceMessage,
  DriverFactory,
  MountOptions,
  RendererDriver,
  SubmitResult,
} from './driver.js'

export {
  BACK_COMMAND,
  COMMAND_SEPARATOR,
  NEXT_COMMAND,
  addItemCommand,
  fieldAtPath,
  pageKeys,
  removeItemCommand,
} from './paths.js'

export { FixtureError, parseFixture, stepKind, validateFixture } from './validate.js'
export type { FixtureProblem } from './validate.js'

export type {
  ActivateStep,
  AddItemStep,
  BackStep,
  ConformanceFieldDef,
  ConformanceOption,
  ConformanceSchema,
  ExpectErrorsStep,
  ExpectHiddenStep,
  ExpectNoErrorsStep,
  ExpectPageStep,
  ExpectSubmitStep,
  ExpectValueStep,
  ExpectVisibleStep,
  Fixture,
  FixtureStep,
  JsonValue,
  NextStep,
  RemoveItemStep,
  SetStep,
  StepKind,
  SubmitStatus,
  SubmitStep,
} from './types.js'

export { loadFixtures } from './loader.js'
export type { FixtureSource } from './loader.js'

export { ConformanceAssertionError, assertFixtureResult, runFixture, runSuite } from './runner.js'
export type {
  DriverCrash,
  FixtureResult,
  FixtureStatus,
  StepFailure,
  StepOutcome,
  StepStatus,
  SuiteResult,
} from './runner.js'

export { describeConformance } from './suite.js'
export type { ConformanceTestApi, DescribeConformanceOptions } from './suite.js'
