import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { engineRefusal } from './engine-refusal.js'
import { withDefaults } from './defaults.js'

/**
 * A default: the answer something fresh starts with (0197) — a new form, a new row, a field
 * shown again after its hiding cleared it. Never what is handed in: a draft, a prefill and the
 * server's replay of a submission start exactly as they were given.
 */
const CLOCK = { now: () => 0, today: () => '2026-10-27', random: () => 0.5 }

const options = [
  { value: 'CH', label: 'Switzerland' },
  { value: 'DE', label: 'Germany' },
]

const trip: FormSchema = {
  specVersion: '5',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      { key: 'country', type: 'select', label: 'Country', options, default: 'CH' },
      { key: 'canton', type: 'text', label: 'Canton', default: 'Zürich' },
      { key: 'kept', type: 'text', label: 'Kept', clearOnHide: false, default: 'kept' },
      { key: 'consent', type: 'checkbox', label: 'Consent', default: false },
      { key: 'plain', type: 'text', label: 'Plain' },
      {
        key: 'details',
        type: 'page',
        label: 'Details',
        fields: [
          { key: 'adults', type: 'number', label: 'Adults', default: 2 },
          {
            key: 'stay',
            type: 'group',
            label: 'Stay',
            fields: [{ key: 'board', type: 'radio', label: 'Board', options: [{ value: 'half', label: 'Half' }], default: 'half' }],
          },
          {
            key: 'people',
            type: 'repeater',
            label: 'People',
            minItems: 1,
            fields: [
              { key: 'name', type: 'text', label: 'Name' },
              { key: 'diet', type: 'selectboxes', label: 'Diet', options: [{ value: 'veg', label: 'Vegetarian' }], default: ['veg'] },
            ],
          },
        ],
      },
    ],
  },
  logic: {
    rules: [
      { kind: 'visible', target: 'canton', cel: "country == 'CH'" },
      { kind: 'visible', target: 'kept', cel: "country == 'CH'" },
    ],
  },
}

const engineFor = (schema: FormSchema, initialValue?: unknown) =>
  createFormEngine({ schema, capabilities: CLOCK, ...(initialValue === undefined ? {} : { initialValue }) })

const withField = (field: Partial<FieldDef>, rules: LogicRule[] = []): FormSchema => ({
  specVersion: '5',
  id: 'one',
  title: 'One',
  model: { fields: [{ key: 'answer', type: 'text', label: 'Answer', ...field } as FieldDef] },
  ...(rules.length === 0 ? {} : { logic: { rules } }),
})

describe('a default', () => {
  // Inside a page beside its siblings, inside a group in its object, and in the row a
  // repeater's minimum seeds — wherever the field's answer would sit.
  test('is the answer a new form starts with, wherever the field sits', () => {
    const value = engineFor(trip).value() as Record<string, unknown>
    expect(value).toMatchObject({
      country: 'CH',
      canton: 'Zürich',
      consent: false,
      adults: 2,
      stay: { board: 'half' },
      people: [{ diet: ['veg'] }],
    })
    expect(value).not.toHaveProperty('plain')
  })

  // The rules run over it before anybody asks: Switzerland is the default, so the canton is shown.
  test('is what the rules see on the first pass', () => {
    expect(engineFor(trip).getFieldSnapshot(['canton']).visible).toBe(true)
  })

  // A draft, a prefill and the server's replay are states that already exist. Filling them would
  // put back an answer somebody cleared — and on the server, store an answer nobody sent.
  test('is never added to what is handed in', () => {
    const value = engineFor(trip, { country: 'DE' }).value() as Record<string, unknown>
    expect(value['country']).toBe('DE')
    expect(value).not.toHaveProperty('adults')
    expect(value).not.toHaveProperty('consent')
    expect(engineFor(trip, {}).value()).not.toHaveProperty('country')
  })

  test('is in every row added, and the rows already there are left as they are', () => {
    const engine = engineFor(trip, { people: [{ name: 'Ada' }] })
    engine.addRow(['people'])
    expect(engine.value()).toMatchObject({ people: [{ name: 'Ada' }, { diet: ['veg'] }] })
    expect((engine.value() as { people: Array<Record<string, unknown>> }).people[0]).not.toHaveProperty('diet')
  })

  // The engine hands out its own answers, unfrozen. Were a row's list the document's own array,
  // a host changing the value it was handed would change what every later row — and every form
  // built from that document — starts with.
  test('is a copy in each row, never the document’s own list', () => {
    const engine = engineFor(trip)
    engine.addRow(['people'])
    const [first, second] = (engine.value() as { people: Array<{ diet: string[] }> }).people
    const people = trip.model.fields.find((field) => field.key === 'details')?.fields?.find((field) => field.key === 'people')
    const documented = people?.fields?.find((field) => field.key === 'diet')?.default
    expect(first?.diet).not.toBe(documented)
    expect(second?.diet).not.toBe(documented)
    expect(first?.diet).not.toBe(second?.diet)
  })

  // A field whose hiding cleared it opens again as it opened the first time, as a repeater
  // opens again with its minimum (0023). One that kept its answer keeps it.
  test('comes back when a field hidden and cleared is shown again', () => {
    const engine = engineFor(trip)
    engine.setValue(['canton'], 'Bern')
    engine.setValue(['kept'], 'mine')
    engine.setValue(['country'], 'DE')
    expect(engine.value()).not.toHaveProperty('canton')
    engine.setValue(['country'], 'CH')
    expect(engine.value()).toMatchObject({ canton: 'Zürich', kept: 'mine' })
  })

  // A field hidden from the start loses its default to its hiding like any answer, and gets it
  // back when it appears — so a default on a conditional question is not lost before it is seen.
  test('on a field hidden from the start is there when it appears', () => {
    const engine = engineFor({ ...trip, model: { fields: trip.model.fields.map((f) => (f.key === 'country' ? { ...f, default: 'DE' } : f)) } })
    expect(engine.value()).not.toHaveProperty('canton')
    engine.setValue(['country'], 'CH')
    expect(engine.value()).toMatchObject({ canton: 'Zürich' })
  })
})

describe('a prefill with the defaults', () => {
  // For a host that hands in a few answers and wants the rest to start as a new form's would:
  // the engine's own fill, so the two cannot disagree about where a default goes.
  test('fills what is absent, keeps what is handed in, and keeps a cleared answer cleared', () => {
    expect(withDefaults(trip, { country: 'DE', consent: null, people: [{ name: 'Ada' }] })).toEqual({
      country: 'DE',
      canton: 'Zürich',
      kept: 'kept',
      consent: null,
      adults: 2,
      stay: { board: 'half' },
      people: [{ name: 'Ada', diet: ['veg'] }],
    })
  })
})

describe('a default the field would refuse', () => {
  // Checked with the function every answer is checked with, so the document cannot hold a
  // default that the form would then call wrong — on a field nobody has touched yet.
  test.each([
    ['not an option', { type: 'select', options, default: 'FR' }, 'option'],
    ['below the minimum', { type: 'number', min: 1, default: 0 }, 'min'],
    ['too long', { maxLength: 3, default: 'Zürich' }, 'maxLength'],
    ['not the pattern', { pattern: '[0-9]{4}', default: 'abcd' }, 'pattern'],
    ['not a date', { type: 'date', default: '27.10.2026' }, 'shape'],
    ['before the earliest', { type: 'date', earliest: '2026-11-01', default: '2026-10-27' }, 'earliest'],
    ['a tick not offered', { type: 'selectboxes', options, default: ['FR'] }, 'option'],
  ] as Array<[string, Partial<FieldDef>, string]>)('%s keeps the form from opening, naming the field and why', (_, field, code) => {
    const refusal = engineRefusal(withField(field))
    expect(refusal).toContain('"answer"')
    expect(refusal).toContain(code)
  })

  // A computed field's value is the engine's (0181): a default would be overwritten before
  // anybody saw it, and an author who wrote one meant something the form would not do.
  test('includes any default on a computed field', () => {
    const refusal = engineRefusal(withField({ type: 'number', default: 1 }, [{ kind: 'computed', target: 'answer', cel: '2.0' }]))
    expect(refusal).toContain('"answer"')
    expect(refusal).toContain('computed')
  })

  test('is a refusal only when there is one', () => {
    expect(engineRefusal(withField({ default: 'fine' }))).toBeUndefined()
  })
})
