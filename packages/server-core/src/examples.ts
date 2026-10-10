import { comparedToLastRun, readScenario } from '@formancy/builder-core'
import type { ScenarioShapeProblem } from '@formancy/builder-core'
import { runScenarios } from '@formancy/core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { can } from './auth.js'
import type { Actor } from './auth.js'
import type { ServerDeps } from './deps.js'
import type { Storage } from './ports.js'

/**
 * A form's examples, kept by the deployment beside the form, and run when it is published
 * ([0166](../../../docs/decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)).
 *
 * An example with its answer written down is the one check that tells a condition that
 * compiles from the condition that was asked for
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)). The builders
 * run them, and the scenarios are the host's to keep
 * ([0111](../../../docs/decisions/0111-a-scenario-panel-names-what-stopped-holding.md)); on a
 * deployment the host is this server, so it keeps them, with the fictional sample they start
 * from, and publishing — the last moment before a version is frozen — runs them.
 *
 * **The permission is decided here, not in the route.** Reading and changing a form's
 * examples take what editing the form takes, `form.publish`, and a host composing its own
 * HTTP over this package gets that rule with the use-case rather than having to remember it.
 */

/** A form's examples as a builder holds them: the list, and where every one starts. */
export interface FormExamples {
  readonly scenarios: readonly Scenario[]
  /** Absent when none was kept: every example then starts from an empty form. */
  readonly sample?: Readonly<Record<string, unknown>>
}

export type ExamplesOutcome =
  | { readonly ok: true; readonly examples: FormExamples }
  /** Not with this actor's role: a viewer may read the form, and not what it is checked against. */
  | { readonly ok: false; readonly kind: 'forbidden' }
  /** Examples are kept beside a form, so there must be one at this path. */
  | { readonly ok: false; readonly kind: 'unknown_form' }

export type KeepExamplesOutcome =
  | ExamplesOutcome
  /** Something sent is not an example, or not a sample: one sentence each, and nothing kept. */
  | { readonly ok: false; readonly kind: 'invalid_examples'; readonly problems: readonly string[] }

/** The examples kept for the form at `path`; none, for a form nobody wrote any for. */
export async function readExamples(
  deps: ServerDeps,
  input: { path: string; actor: Actor },
): Promise<ExamplesOutcome> {
  if (!can(input.actor, 'form.publish')) return { ok: false, kind: 'forbidden' }
  const form = await deps.storage.getFormByPath(input.path)
  if (form === undefined) return { ok: false, kind: 'unknown_form' }

  const kept = await deps.storage.getExamples(form.id)
  return { ok: true, examples: asExamples(kept?.scenarios ?? [], kept?.sample ?? null) }
}

/**
 * Replace the examples of the form at `path`, and the sample they start from.
 *
 * Each is read as an example the way a builder reads a model's draft — `readScenario`, one
 * decision for both — and a list with any item that is not one keeps nothing. Paths are not
 * checked against the published form: an example is written for the form being edited, which
 * may name a field no version has yet, and the runner says so when it runs.
 */
export async function keepExamples(
  deps: ServerDeps,
  input: { path: string; actor: Actor; examples: unknown },
): Promise<KeepExamplesOutcome> {
  if (!can(input.actor, 'form.publish')) return { ok: false, kind: 'forbidden' }
  const form = await deps.storage.getFormByPath(input.path)
  if (form === undefined) return { ok: false, kind: 'unknown_form' }

  const read = readExamplesBody(input.examples)
  if ('problems' in read) return { ok: false, kind: 'invalid_examples', problems: read.problems }

  await deps.storage.keepExamples(
    { formId: form.id, scenarios: read.scenarios, sample: read.sample, updatedAt: deps.nowIso() },
    {
      id: deps.newId(),
      at: deps.nowIso(),
      action: 'form.examples.changed',
      subject: input.path,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      // How many, and whether there is a sample: what changed, never what it says.
      detail: { examples: read.scenarios.length, sample: read.sample !== null },
    },
  )
  return { ok: true, examples: asExamples(read.scenarios, read.sample) }
}

/**
 * What publishing says about the form's examples: one sentence for each that held against the
 * version the form has and does not hold against the one being published.
 *
 * **Run as the server replays a submission**, in `server` mode, from the kept sample, and
 * compared by `comparedToLastRun` — the scenario panel's own verdict, so the publish cannot
 * call something a regression the panel would not
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)). An example that did
 * not hold before either is not this publish's doing, and one that holds again is good news;
 * neither is a warning.
 *
 * **It never throws.** A publish may warn and never refuses over its examples
 * ([0097](../../../docs/decisions/0097-a-publish-may-warn.md)): a rule changed on purpose stops
 * its old example holding, and the person decides. A stored row the runner cannot read — one
 * edited around `keepExamples` — would otherwise turn every publish of the form into a 500.
 */
export async function examplesThatStopHolding(
  storage: Storage,
  formId: string,
  before: { readonly schema: FormSchema; readonly version: number } | undefined,
  after: { readonly schema: FormSchema; readonly version: number },
): Promise<string[]> {
  const kept = await storage.getExamples(formId)
  if (kept === undefined || kept.scenarios.length === 0 || before === undefined) return []

  try {
    const options = { mode: 'server' as const, ...(kept.sample === null ? {} : { initialValue: kept.sample }) }
    const now = runScenarios(after.schema, kept.scenarios, options)
    const { regressions } = comparedToLastRun(runScenarios(before.schema, kept.scenarios, options), now)
    return regressions.map((name) => {
      const failures = now.find((result) => result.name === name)?.failures ?? []
      return (
        `The example "${name}" held against version ${String(before.version)} and does not hold against ` +
        `version ${String(after.version)}: ${failures.map((failure) => failure.detail).join(' ')}`
      )
    })
  } catch (error) {
    return [
      `The form's examples could not be run against version ${String(after.version)}, so nothing was said ` +
        `about them: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }
}

function asExamples(scenarios: readonly Scenario[], sample: Readonly<Record<string, unknown>> | null): FormExamples {
  return { scenarios, ...(sample === null ? {} : { sample }) }
}

type ReadBody =
  | { readonly scenarios: readonly Scenario[]; readonly sample: Readonly<Record<string, unknown>> | null }
  | { readonly problems: readonly string[] }

/** `{ scenarios, sample? }` from a request body, or a sentence for everything that is not. */
function readExamplesBody(body: unknown): ReadBody {
  if (!isRecord(body) || !Array.isArray(body['scenarios'])) {
    return { problems: ['Send { scenarios, sample? }, where scenarios is a list of examples.'] }
  }
  const { sample } = body
  const problems: string[] = []
  if (sample !== undefined && sample !== null && !isRecord(sample)) {
    problems.push('The sample is the answers every example starts from, by field, and this is not that.')
  }

  const scenarios: Scenario[] = []
  const first = new Map<string, number>()
  body['scenarios'].forEach((item: unknown, index) => {
    const position = index + 1
    const read = readScenario(item)
    if (!read.ok) {
      problems.push(`${which(position, read.problem.name)} ${SHAPE_PROBLEMS[read.problem.reason](read.problem)}`)
      return
    }
    const earlier = first.get(read.scenario.name)
    if (earlier !== undefined) {
      problems.push(
        `${which(position, read.scenario.name)} has the name of example ${String(earlier)}; a name is how an example's result is found.`,
      )
      return
    }
    first.set(read.scenario.name, position)
    scenarios.push(read.scenario)
  })

  return problems.length > 0 ? { problems } : { scenarios, sample: isRecord(sample) ? sample : null }
}

function which(position: number, name: string | undefined): string {
  return `Example ${String(position)}${name === undefined ? '' : ` ("${name}")`}`
}

/** What each reason `readScenario` gives means, said for whoever sent the list. */
const SHAPE_PROBLEMS: Readonly<Record<ScenarioShapeProblem['reason'], (problem: ScenarioShapeProblem) => string>> = {
  'not-an-object': () => 'is not an object.',
  'unknown-key': ({ part }) => `has "${part ?? ''}", which an example does not have.`,
  'no-name': () => 'has no name.',
  'no-changes': () => 'has no "changes": the answers it sets, by field.',
  'no-verdict': () => 'does not say whether the form is "valid" afterwards, as true or false.',
  malformed: ({ part }) => `has a "${part ?? ''}" of the wrong shape.`,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
