import type { FormSchema } from '@formancy/spec'
import type { CapabilitySource } from '@formancy/expressions'
import { createFormEngine } from './engine.js'
import { parsePath } from './path.js'
import { getAt } from './value.js'

/**
 * What a form is supposed to do, written down, and run against it.
 *
 * **The gap nothing else closes.** `visible: leaveType == 'other'` and
 * `visible: leaveType != 'other'` are both valid CEL. Both compile, both
 * type-check, both satisfy the validator, the engine's refusal check, the
 * expression checker and every gate this repository has — and one of them asks
 * a question nobody should be asked. The difference is not in the document; it
 * is between the document and what somebody meant, and no amount of checking
 * the document can see it.
 *
 * An example with its answer written down can. The starter templates have
 * carried those since they shipped, and the runner lived inside a single test
 * file as an interface and twenty lines of `expect` — so a capability the
 * product demonstrably needs was available to this repository's own suite and
 * to nobody else ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 *
 * **This reports rather than asserts.** The caller is sometimes a test and
 * sometimes a panel in a builder, and a panel cannot be built out of `expect`.
 * A failure says what was expected and what happened, because "3 of 5 fail"
 * sends somebody back to the document to work out which rule they broke.
 *
 * It runs the real engine, in the mode asked for. Not a second implementation
 * of visibility and validation: a second implementation is a second opinion,
 * and the one thing a scenario must not do is disagree with the form.
 */

/** One example, with what the form should make of it. */
export interface Scenario {
  /** Unique in a set: it is how a failure is named and how a result is found. */
  readonly name: string
  /**
   * Why the example is worth having: the part of what the author said that it checks.
   *
   * For whoever reads the list later, and never run. A drafted example carries the
   * sentence it was drafted from, so a person deciding whether the example or the rule is
   * wrong can see what the example understood
   * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
   */
  readonly because?: string
  /**
   * Values to set, in the order written, through the live engine.
   *
   * Set rather than supplied as an initial value, because turning a branch off
   * has to clear what somebody already typed — and a field that was never
   * filled cannot show that.
   *
   * A map, so a path appears once: setting a field and then changing what
   * decides its branch is two steps and needs `initialValue` for the first.
   * The templates have carried this shape since they shipped, and a list of
   * steps would be the honest alternative the day one of them needs it.
   */
  readonly changes: Readonly<Record<string, unknown>>
  /** Whether the form validates afterwards. */
  readonly valid: boolean
  /** Error codes per path. Absent means none, which is asserted rather than skipped. */
  readonly errors?: Readonly<Record<string, readonly string[]>>
  readonly visible?: Readonly<Record<string, boolean>>
  readonly values?: Readonly<Record<string, unknown>>
  /**
   * Paths the submission must not carry at all. `clearOnHide`'s own question. Each is
   * looked for where its field is, so `home.street` and `items[0].note` are checked too.
   */
  readonly absent?: readonly string[]
}

/** What part of a scenario went wrong, for a panel that groups them. */
export type FailureAbout = 'document' | 'path' | 'valid' | 'errors' | 'visible' | 'values' | 'absent'

export interface ScenarioFailure {
  readonly about: FailureAbout
  /** One sentence naming the path, what was expected and what happened. */
  readonly detail: string
}

export interface ScenarioResult {
  readonly name: string
  readonly passed: boolean
  readonly failures: readonly ScenarioFailure[]
}

export interface ScenarioOptions {
  /** Where every scenario starts. Each gets its own engine over a copy of it. */
  readonly initialValue?: Readonly<Record<string, unknown>>
  /**
   * `client` by default, `server` for what the publish gate and the submission
   * endpoint run. A scenario that passes in one and fails in the other is the
   * drift this product exists to prevent, so both have to be askable.
   */
  readonly mode?: 'client' | 'server'
  readonly capabilities?: CapabilitySource
}

/**
 * Fixed by default, so a scenario means the same thing tomorrow.
 *
 * A form with a `today()` bound would otherwise pass until the date it was
 * written against goes by, and then fail for a reason that is not a change to
 * anything. A caller wanting real time passes its own.
 */
const FIXED: CapabilitySource = {
  now: () => 1_791_244_800_000,
  today: () => '2026-10-06',
  random: () => 0.5,
}

export function runScenarios(
  schema: FormSchema,
  scenarios: readonly Scenario[],
  options: ScenarioOptions = {},
): ScenarioResult[] {
  const capabilities = options.capabilities ?? FIXED

  return scenarios.map((scenario) => {
    const failures: ScenarioFailure[] = []

    let engine
    try {
      engine = createFormEngine({
        schema,
        /*
         * Passed as given. There was a defensive copy here and a mutation of
         * it reddened nothing, which is the answer: the value store writes
         * immutably — `set` replaces the root rather than editing it — so an
         * engine never touches the caller's object and one scenario cannot
         * reach the next through it. The isolation case holds because of
         * that, not because of a copy, and a copy that protects nothing is a
         * line claiming a danger that is not there.
         */
        ...(options.initialValue === undefined ? {} : { initialValue: options.initialValue }),
        ...(options.mode === undefined ? {} : { mode: options.mode }),
        capabilities,
      })
    } catch (error) {
      /*
       * The document does not open. Reported per scenario because that is
       * where a caller looks, and the detail is the engine's own words — the
       * same refusal the server's publish gate gives.
       */
      return {
        name: scenario.name,
        passed: false,
        failures: [
          {
            about: 'document',
            detail: `The engine will not open this form, so no scenario can run: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }

    const known = (path: string): boolean => {
      try {
        return engine.getFieldSnapshot(parsePath(path)) !== undefined
      } catch {
        return false
      }
    }

    /*
     * Every path the scenario names, before anything is set.
     *
     * A scenario naming `otherReson` would otherwise set nothing, assert
     * nothing and pass — green while checking a field that does not exist,
     * which is exactly how a renamed field leaves its scenarios behind.
     */
    const named = [
      ...Object.keys(scenario.changes),
      ...Object.keys(scenario.errors ?? {}),
      ...Object.keys(scenario.visible ?? {}),
      ...Object.keys(scenario.values ?? {}),
      ...(scenario.absent ?? []),
    ]
    for (const path of [...new Set(named)]) {
      if (known(path)) continue
      failures.push({
        about: 'path',
        detail: `This form has no "${path}". A scenario naming a field that is not there checks nothing — it was probably renamed.`,
      })
    }

    if (failures.length > 0) return { name: scenario.name, passed: false, failures }

    for (const [path, value] of Object.entries(scenario.changes)) {
      engine.setValue(parsePath(path), value)
    }

    const report = engine.validate()
    if (report.valid !== scenario.valid) {
      failures.push({
        about: 'valid',
        detail: scenario.valid
          ? `Expected the form to be valid; it is not: ${describeErrors(report.errors)}.`
          : 'Expected the form to be invalid; every field passes.',
      })
    }

    const expectedErrors = scenario.errors ?? {}
    for (const path of [...new Set([...Object.keys(expectedErrors), ...Object.keys(report.errors)])]) {
      const want = [...(expectedErrors[path] ?? [])].sort()
      const got = [...(report.errors[path] ?? [])].sort()
      if (want.join(',') === got.join(',')) continue
      failures.push({
        about: 'errors',
        detail: `"${path}": expected ${want.length === 0 ? 'no error' : want.join(', ')}, got ${
          got.length === 0 ? 'none' : got.join(', ')
        }.`,
      })
    }

    for (const [path, want] of Object.entries(scenario.visible ?? {})) {
      const got = engine.getFieldSnapshot(parsePath(path)).visible
      if (got === want) continue
      failures.push({
        about: 'visible',
        detail: `"${path}": expected to be ${want ? 'visible' : 'hidden'}, and it is ${got ? 'visible' : 'hidden'}.`,
      })
    }

    for (const [path, want] of Object.entries(scenario.values ?? {})) {
      const got = engine.getFieldSnapshot(parsePath(path)).value
      if (JSON.stringify(got) === JSON.stringify(want)) continue
      failures.push({
        about: 'values',
        detail: `"${path}": expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}.`,
      })
    }

    /*
     * Looked for where the field is, through its path, as everything else here is. A key
     * looked up at the top of the submission found `home.street` in none, so an `absent`
     * on a field inside a group or a row held whatever the form did
     * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
     */
    const submitted = engine.value()
    for (const path of scenario.absent ?? []) {
      const segments = parsePath(path)
      const holder = getAt(submitted, segments.slice(0, -1))
      const key = segments.at(-1)!
      if (holder === null || typeof holder !== 'object' || !Object.hasOwn(holder, key)) continue
      failures.push({
        about: 'absent',
        detail: `"${path}" is still in the submission as ${JSON.stringify(
          (holder as Record<string | number, unknown>)[key],
        )}; it was expected to be gone.`,
      })
    }

    return { name: scenario.name, passed: failures.length === 0, failures }
  })
}

function describeErrors(errors: Readonly<Record<string, readonly string[]>>): string {
  const entries = Object.entries(errors)
  if (entries.length === 0) return 'no errors were reported either, which is a disagreement worth reporting'
  return entries.map(([path, codes]) => `${path} (${codes.join(', ')})`).join(', ')
}
