import { describe, expect, test } from 'vitest'
import type { ScenarioResult } from '@formancy/core'
import { comparedToLastRun, scenarioStatus } from './scenario-runs.js'
import { BUILDER_MESSAGES_DE } from './messages-de.js'
import { createBuilderText } from './messages.js'

/**
 * What changed between two runs of the same scenarios.
 *
 * "Three of five fail" is a number somebody reads once and stops reading. The
 * question while editing a form is narrower and much more useful: **which ones
 * were holding before I touched this, and are not now.** That is the signal a
 * panel exists to give, and it is the difference between a list that is
 * glanced at and one that is acted on.
 *
 * Its own function in `builder-core` rather than in either pane, for the
 * reason everything else here is: two builders deciding separately what counts
 * as a regression would eventually disagree, and a disagreement about *that*
 * is a panel telling two people different things about the same edit
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 */
const result = (name: string, passed: boolean): ScenarioResult => ({
  name,
  passed,
  failures: passed ? [] : [{ about: 'valid', detail: `${name} does not hold` }],
})

describe('comparing a run with the one before it', () => {
  test('names what stopped holding, which is the only part somebody acts on', () => {
    const before = [result('a', true), result('b', true), result('c', false)]
    const after = [result('a', true), result('b', false), result('c', false)]

    const changed = comparedToLastRun(before, after)

    // `b` alone. `c` was already failing, and reporting it as a regression
    // would make every edit look like it broke something.
    expect(changed.regressions).toEqual(['b'])
  })

  test('and what started holding, so a fix is visible as a fix', () => {
    /*
     * The other direction matters more than it looks. Somebody editing a rule
     * to repair one scenario needs to see that it worked in the same glance
     * that tells them nothing else broke — otherwise the panel only ever
     * delivers bad news and gets ignored.
     */
    const before = [result('a', false), result('b', true)]
    const after = [result('a', true), result('b', true)]

    expect(comparedToLastRun(before, after).repaired).toEqual(['a'])
  })

  test('the first run reports no regressions, because there is nothing to regress from', () => {
    /*
     * A form opened with failing scenarios has not broken anything — it
     * arrived that way. Calling those regressions would greet somebody with a
     * list of things they are not responsible for, on a screen whose whole
     * value is that it only speaks up when it matters.
     */
    const changed = comparedToLastRun(undefined, [result('a', false), result('b', true)])

    expect(changed.regressions).toEqual([])
    expect(changed.repaired).toEqual([])
  })

  test('a scenario that is new is not a regression even when it fails', () => {
    // Writing one and watching it fail is the normal way to write one. It was
    // not holding before, because it did not exist.
    const changed = comparedToLastRun([result('a', true)], [result('a', true), result('b', false)])

    expect(changed.regressions).toEqual([])
  })

  test('and one that is gone is not reported either way', () => {
    // Deleting a failing scenario is not a repair, and deleting a passing one
    // is not a regression. Both would be the panel claiming credit or blame
    // for somebody pressing delete.
    const changed = comparedToLastRun(
      [result('a', true), result('gone', false)],
      [result('a', true)],
    )

    expect(changed).toEqual({ regressions: [], repaired: [] })
  })

  test('identity is the name, so renaming one is a different scenario', () => {
    /*
     * Stated rather than assumed, because the alternative — position — would
     * make inserting a scenario at the top report every one below it as both
     * regressed and repaired. The cost of names is that renaming loses the
     * history, which is the lesser mistake and the same trade a field key
     * makes.
     */
    const changed = comparedToLastRun([result('old name', true)], [result('new name', false)])

    expect(changed.regressions).toEqual([])
  })
})

describe('what the scenario panel says', () => {
  const english = createBuilderText()
  const german = createBuilderText({ locale: 'de', messages: BUILDER_MESSAGES_DE })
  const none = { regressions: [], repaired: [] }

  test('puts what stopped holding first, because it is about the edit just made', () => {
    expect(
      scenarioStatus(3, 1, { regressions: ['Swiss address'], repaired: ['Empty form'] }, english),
    ).toBe('Stopped holding: Swiss address. Holds again: Empty form. 1 of 3 does not hold.')
  })

  test('counts in the language’s plural, which "1 of 3 do not hold" did not', () => {
    expect(scenarioStatus(1, 0, none, english)).toBe('The one scenario holds.')
    expect(scenarioStatus(4, 2, none, english)).toBe('2 of 4 do not hold.')
    expect(scenarioStatus(2, 0, none, german)).toBe(german('scenarios.allHold', { count: 2 }))
  })

  test('says there are none rather than that all of none hold', () => {
    expect(scenarioStatus(0, 0, none, english)).toBe(english('scenarios.none'))
  })
})
