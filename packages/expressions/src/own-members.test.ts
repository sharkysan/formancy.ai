import { describe, expect, test } from 'vitest'
import { fixedCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import { evaluate } from './evaluate.js'
import type { CompileOptions } from './compile.js'
import type { EvaluateOptions } from './evaluate.js'

/**
 * A member named after what every object has, read by an expression (0185).
 *
 * The library tells a map from anything else by `value.constructor`, so an object holding a
 * member of its own under that name was no map to it: `Unsupported type`, and every
 * expression that read the object failed, whatever member it asked for. A key is a name an
 * author chooses, and a repeater row the engine binds holds every member it declares, an
 * unanswered one as null — so without this, a row with a field keyed `constructor` fails every
 * rule on it, answered or not.
 */

const capabilities = fixedCapabilities({ nowMs: 0, today: '2026-10-19', random: 0.5 })

function run(source: string, variables: CompileOptions['variables'], values: Record<string, unknown>, extra?: Partial<EvaluateOptions>) {
  const compiled = compile(source, { kind: 'computed', variables })
  if (!compiled.ok) throw compiled.error
  return evaluate(compiled.program, values, { capabilities, ...extra })
}

function valueOf(source: string, variables: CompileOptions['variables'], values: Record<string, unknown>): unknown {
  const outcome = run(source, variables, values)
  if (!outcome.ok) throw outcome.error
  return outcome.value
}

describe('a map holding its own constructor is still a map', () => {
  test.each([
    ['bound as null, as the engine binds a member nobody answered', null],
    ['answered', 'ACME'],
  ])('a row whose constructor is %s reads every member', (_how, held) => {
    // What a first version of 0185 did, binding a row's unanswered `constructor` as its own
    // null: a row rule `item.qty > 0.0` refused a good row as invalid, a computed total was
    // never stored and a visibility rule failed open. Answered, it failed in every release.
    const item = { qty: 2.5, constructor: held }

    expect(valueOf('item.qty > 0.0', { item: 'map' }, { item })).toBe(true)
    expect(valueOf('item.constructor', { item: 'map' }, { item })).toBe(held)
    expect(valueOf('has(item.constructor)', { item: 'map' }, { item })).toBe(true)
    expect(valueOf('"constructor" in item', { item: 'map' }, { item })).toBe(true)
    expect(valueOf('size(item)', { item: 'map' }, { item })).toBe(2)
  })

  test('and comes back out of an expression as the plain value it went in as', () => {
    // A computed field that copies a row stores what the result is: the library's Map has
    // to leave as JSON, or the stored answer would be `{}`.
    expect(valueOf('item', { item: 'map' }, { item: { qty: 2.5, constructor: 'ACME' } })).toEqual({
      qty: 2.5,
      constructor: 'ACME',
    })
  })

  test('at any depth, and in every row of a list', () => {
    // A group inside a group, and a repeater whose rows each hold the member: each object is
    // handed over as it is reached, not only the one at the top.
    const site = { address: { city: 'Zug', constructor: 'ACME' } }
    const items = [
      { qty: 1, constructor: null },
      { qty: 2, constructor: 'ACME' },
    ]

    expect(valueOf('site.address.city == "Zug"', { site: 'map' }, { site })).toBe(true)
    expect(valueOf('items.all(i, i.qty > 0)', { items: 'list' }, { items })).toBe(true)
    expect(valueOf('items.map(i, i.constructor)', { items: 'list' }, { items })).toEqual([null, 'ACME'])
  })

  test('and every member read out of it costs a step, as one read out of any map does', () => {
    // Handed over as something other than the metered view, a map would be read for free.
    // The map is read from the bag once and walked as a comprehension's variable, and the
    // same walk is run without reading the members, so the difference is those reads alone:
    // the comprehension's own steps are the same either way, and would hide a free read.
    const members = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${String(index)}`, 'a']))
    const steps = (source: string, item: Record<string, unknown>): number => {
      const outcome = run(source, { item: 'map' }, { item })
      if (!outcome.ok) throw outcome.error
      return outcome.steps
    }

    for (const item of [members, { ...members, constructor: 'ACME' }]) {
      const reading = steps('[item].exists(m, m.exists(k, m[k] == "never"))', item)
      const notReading = steps('[item].exists(m, m.exists(k, k == "never"))', item)
      expect(reading - notReading).toBeGreaterThanOrEqual(Object.keys(item).length)
    }
  })

  test('and a map iterated rather than read member by member is charged as well', () => {
    // A result is read by iterating it, as the library compares two maps: entries handed out
    // uncharged made a wide map free to return, where a plain one stops at the budget.
    const wide = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`k${String(index)}`, 'a']))

    for (const item of [wide, { ...wide, constructor: 'ACME' }]) {
      const outcome = run('item', { item: 'map' }, { item }, { budget: { maxSteps: 200 } })
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.error.code).toBe('steps_exceeded')
    }
  })

  test('a top-level variable named constructor reads as any other, as it always did', () => {
    // The control: the library reads the bag as its context, never as a map, so this never
    // failed — and the bag holds its own `constructor` here, so it is handed over as a Map.
    expect(valueOf('constructor == "ACME"', { constructor: 'dyn' as const }, { constructor: 'ACME' })).toBe(true)
  })
})

describe('a declared name the bag does not hold', () => {
  test.each(['constructor', 'toString', 'valueOf'])('"%s" is a missing variable, as any other name is', (name) => {
    // `values[name]` read what every object inherits: a bag without the declared name passed
    // `function Object` to the expression rather than saying it had nothing for it.
    const outcome = run(`${name} == "x"`, { [name]: 'dyn' as const }, {})

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.code).toBe('missing_variable')
  })
})
