import type { ScenarioResult } from '@formancy/core'

/**
 * What changed between two runs of the same scenarios.
 *
 * "Three of five fail" is a number somebody reads once and then stops reading.
 * The question while editing a form is narrower and far more useful: **which
 * ones were holding before I touched this, and are not now.** A panel that
 * answers that is acted on; one that reports a standing total is glanced at.
 *
 * Here rather than in either pane because two builders deciding separately
 * what counts as a regression would eventually disagree, and a disagreement
 * about *that* is a panel telling two people different things about one edit
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 *
 * Identity is the scenario's name. Position would make inserting one at the
 * top report every scenario below it as both regressed and repaired; the cost
 * is that renaming loses the history, which is the lesser mistake and the same
 * trade a field key makes.
 */
export interface ScenarioRunChange {
  /** Held in the previous run, does not now. The list somebody acts on. */
  readonly regressions: readonly string[]
  /**
   * Failed in the previous run, holds now.
   *
   * Reported because a panel that only ever delivers bad news is a panel
   * people stop reading: somebody repairing a rule needs to see that it
   * worked in the same glance that tells them nothing else broke.
   */
  readonly repaired: readonly string[]
}

export function comparedToLastRun(
  /** Undefined on the first run: a form that arrives with failing scenarios has broken nothing. */
  before: readonly ScenarioResult[] | undefined,
  after: readonly ScenarioResult[],
): ScenarioRunChange {
  /*
   * The first run falls out of the same lookup rather than taking a branch of
   * its own. There was an early return here and a mutation of it reddened
   * nothing: with no previous run every scenario is one this function has not
   * seen, and "not seen" is already neither a regression nor a repair. A
   * branch that cannot change an answer is a line claiming a case that is not
   * special.
   */
  const was = new Map((before ?? []).map((result) => [result.name, result.passed]))
  const regressions: string[] = []
  const repaired: string[] = []

  for (const result of after) {
    const previously = was.get(result.name)
    // A scenario that is new has no previous verdict, and writing one and
    // watching it fail is the normal way to write one.
    if (previously === undefined) continue
    if (previously && !result.passed) regressions.push(result.name)
    if (!previously && result.passed) repaired.push(result.name)
  }

  return { regressions, repaired }
}
