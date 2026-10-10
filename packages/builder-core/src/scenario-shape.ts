import type { Scenario } from '@formancy/core'

/**
 * What an example is, read from JSON somebody else wrote.
 *
 * Two readers ask: `draftScenarios`, reading a model's answer item by item
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)),
 * and a server keeping a form's examples
 * ([0166](../../../docs/decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)).
 * Decided here once, because two readers deciding it apart would disagree where nobody looks:
 * a draft kept in a builder refused by the server that keeps it, or an example kept that the
 * runner reads as less than it says.
 *
 * **Strict about shape, because the runner is not.** An `errors` that is not a map of code
 * lists would be compared as though it were, a key the runner does not read — a model's
 * `"required": {…}` — would be dropped, leaving an example that checks less than it reads, and
 * `changes` that are not a map throw. Nothing about paths: whether a path is a form's is the
 * engine's question, and its answer is in the run.
 */

/** Why a value is not an example. */
export type ScenarioShapeReason =
  | 'not-an-object'
  | 'unknown-key'
  | 'no-name'
  | 'no-changes'
  | 'no-verdict'
  | 'malformed'

export interface ScenarioShapeProblem {
  /** Its name, when it has one that is text. */
  readonly name?: string
  readonly reason: ScenarioShapeReason
  /** For `unknown-key` and `malformed`: the key. */
  readonly part?: string
}

export type ReadScenario =
  | { readonly ok: true; readonly scenario: Scenario }
  | { readonly ok: false; readonly problem: ScenarioShapeProblem }

/** The keys an example has: core's `Scenario`, and nothing invented beside it. */
const KEYS: ReadonlySet<string> = new Set([
  'name',
  'because',
  'changes',
  'valid',
  'errors',
  'visible',
  'values',
  'absent',
])

/**
 * `value` as an example, with its name and its reason trimmed, or why it is not one.
 *
 * Names and reasons are trimmed because a name is how a result is found: `"  Canton "` and
 * `"Canton"` would be two examples to a panel and one to the person reading it.
 */
export function readScenario(value: unknown): ReadScenario {
  if (!isRecord(value)) return { ok: false, problem: { reason: 'not-an-object' } }
  const rawName = value['name']
  const name = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : undefined
  const refuse = (reason: ScenarioShapeReason, part?: string): ReadScenario => ({
    ok: false,
    problem: {
      ...(name === undefined ? {} : { name }),
      reason,
      ...(part === undefined ? {} : { part }),
    },
  })

  const stranger = Object.keys(value).find((key) => !KEYS.has(key))
  if (stranger !== undefined) return refuse('unknown-key', stranger)
  if (name === undefined) return refuse('no-name')
  const { because, changes, valid, errors, visible, values, absent } = value
  if (!isRecord(changes)) return refuse('no-changes')
  if (typeof valid !== 'boolean') return refuse('no-verdict')
  if (because !== undefined && typeof because !== 'string') return refuse('malformed', 'because')
  if (errors !== undefined && !isMapOf(errors, isTextList)) return refuse('malformed', 'errors')
  if (visible !== undefined && !isMapOf(visible, (entry) => typeof entry === 'boolean')) {
    return refuse('malformed', 'visible')
  }
  if (values !== undefined && !isRecord(values)) return refuse('malformed', 'values')
  if (absent !== undefined && !isTextList(absent)) return refuse('malformed', 'absent')

  return {
    ok: true,
    scenario: {
      name,
      ...(typeof because === 'string' && because.trim() !== '' ? { because: because.trim() } : {}),
      changes,
      valid,
      ...(errors === undefined ? {} : { errors: errors as Record<string, string[]> }),
      ...(visible === undefined ? {} : { visible: visible as Record<string, boolean> }),
      ...(values === undefined ? {} : { values }),
      ...(absent === undefined ? {} : { absent: absent as string[] }),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTextList(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isMapOf(value: unknown, entry: (value: unknown) => boolean): boolean {
  return isRecord(value) && Object.values(value).every(entry)
}
