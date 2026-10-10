import { describe, expect, test } from 'vitest'
import type { Scenario } from '@formancy/core'
import { draftScenarios } from './scenario-drafts.js'
import { readScenario } from './scenario-shape.js'
import type { AskModel } from './answers.js'

/**
 * What an example is, read from JSON somebody else wrote (0166).
 *
 * Two readers ask it: a builder reading a model's answer item by item (0162), and a server
 * keeping a form's examples. If they disagreed, a draft kept in a builder would be refused by
 * the server that keeps it, or the server would keep an example the runner reads as less than
 * it says.
 */
const ASKS_FOR_A_CANTON: Scenario = {
  name: 'Switzerland asks for a canton',
  changes: { country: 'CH' },
  valid: true,
  visible: { canton: true },
}

describe('reading an example', () => {
  test('gives back an example that has the shape, as written', () => {
    // The runner reads these keys and no others; an example read back short of one would
    // check less than the person wrote.
    const full: Scenario = {
      ...ASKS_FOR_A_CANTON,
      because: 'Only Switzerland has cantons.',
      errors: { canton: ['required'] },
      values: { canton: 'Bern' },
      absent: ['note'],
    }
    expect(readScenario(full)).toEqual({ ok: true, scenario: full })
  })

  test('trims the name and the reason, and drops a reason that is only space', () => {
    // A name is how a result is found. "  Canton " and "Canton" would be two examples
    // to the panel and one to the person reading it.
    expect(readScenario({ ...ASKS_FOR_A_CANTON, name: '  Canton ', because: '   ' })).toEqual({
      ok: true,
      scenario: { ...ASKS_FOR_A_CANTON, name: 'Canton' },
    })
  })

  test.each([
    ['not an object', ['x'], { reason: 'not-an-object' }],
    [
      'a key the runner does not read',
      { ...ASKS_FOR_A_CANTON, expected: {} },
      { name: ASKS_FOR_A_CANTON.name, reason: 'unknown-key', part: 'expected' },
    ],
    ['no name', { changes: {}, valid: true }, { reason: 'no-name' }],
    ['no changes', { name: 'a', valid: true }, { name: 'a', reason: 'no-changes' }],
    ['changes that are not a map', { name: 'a', changes: null, valid: true }, { name: 'a', reason: 'no-changes' }],
    ['no verdict', { name: 'a', changes: {}, valid: 'yes' }, { name: 'a', reason: 'no-verdict' }],
    [
      'errors not lists of codes',
      { name: 'a', changes: {}, valid: false, errors: { canton: 'required' } },
      { name: 'a', reason: 'malformed', part: 'errors' },
    ],
    [
      'visibility not true or false',
      { name: 'a', changes: {}, valid: true, visible: { canton: 'no' } },
      { name: 'a', reason: 'malformed', part: 'visible' },
    ],
    ['values not a map', { name: 'a', changes: {}, valid: true, values: ['x'] }, { name: 'a', reason: 'malformed', part: 'values' }],
    ['absent not a list of paths', { name: 'a', changes: {}, valid: true, absent: 'note' }, { name: 'a', reason: 'malformed', part: 'absent' }],
    ['a reason that is not text', { name: 'a', changes: {}, valid: true, because: 42 }, { name: 'a', reason: 'malformed', part: 'because' }],
  ])('refuses %s, and says which part', (_what, value, problem) => {
    // Each of these would be run as written, and fail — or pass — for a reason that is
    // about its spelling, not the form. `changes: null` throws in the runner, and at a
    // publish that would be a 500 rather than a warning.
    expect(readScenario(value)).toEqual({ ok: false, problem })
  })

  test('is how a model’s answer is read, item by item', async () => {
    // The two readers are one: an item a server would refuse is one the drafting part
    // lists as unusable, for the same reason, and one it keeps is drafted as written.
    const items: unknown[] = [
      ASKS_FOR_A_CANTON,
      { name: 'b', changes: {}, valid: false, errors: { canton: 'required' } },
      { name: 'c', changes: {}, valid: true, expected: {} },
      { name: 'd', valid: true },
    ]
    const ask: AskModel = () => Promise.resolve(JSON.stringify({ scenarios: items }))
    const form = {
      specVersion: '4',
      id: 'f',
      title: 'F',
      model: { fields: [{ key: 'country', type: 'text' }, { key: 'canton', type: 'text' }] },
    } as const

    const drafted = await draftScenarios(ask, form as never, 'anything')

    const read = items.map(readScenario)
    expect(drafted.ok && drafted.drafts).toEqual(read.flatMap((one) => (one.ok ? [one.scenario] : [])))
    expect(drafted.ok && drafted.unusable).toEqual(
      read.flatMap((one, index) => (one.ok ? [] : [{ position: index + 1, ...one.problem }])),
    )
  })
})
