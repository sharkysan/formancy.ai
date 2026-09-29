import { describe, expect, test } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'

/**
 * Walking past a page.
 *
 * The visa page nobody needing no visa should see. Three things have to hold at
 * once, and the third is the one that makes this worth a rule kind rather than a
 * renderer trick.
 *
 * **The stepper must not show it**, or a form claims four steps and does three.
 *
 * **Next must not land on it**, from either direction: a skipped page in the
 * middle is skipped going forward and going back, and a wizard that walks past
 * it one way and into it the other is one nobody can reason about.
 *
 * **Its fields must not be validated.** A page somebody never saw holding a
 * required answer is a form that cannot be submitted and will not say why —
 * which is the failure that makes conditional routing dangerous rather than
 * merely missing.
 */
const schema: FormSchema = {
  specVersion: '3',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'p1',
        type: 'page',
        label: 'About you',
        fields: [{ key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' }],
      },
      {
        key: 'p2',
        type: 'page',
        label: 'Visa details',
        fields: [{ key: 'passport', type: 'text', label: 'Passport number', required: true }],
      },
      {
        key: 'p3',
        type: 'page',
        label: 'Confirm',
        fields: [{ key: 'agreed', type: 'checkbox', label: 'Agreed' }],
      },
    ],
  },
  logic: { rules: [{ target: 'p2', kind: 'skip', cel: 'needsVisa != true' }] },
}

const engineFor = (): ReturnType<typeof createFormEngine> =>
  createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
  })

describe('a skipped page', () => {
  test('is not one of the steps the form says it has', () => {
    const engine = engineFor()
    const wizard = engine.wizard()

    // Skipped: nobody has said they need a visa, so the rule is true. The page
    // is still THERE — `page()` is an absolute index — and it is marked.
    const live = (): string[] =>
      engine.pages().filter((page) => !page.skipped).map((page) => page.key)

    expect(live()).toEqual(['p1', 'p3'])

    engine.setValue(['needsVisa'], true)
    expect(live()).toEqual(['p1', 'p2', 'p3'])
  })

  test('is walked past going forward', async () => {
    const engine = engineFor()
    const wizard = engine.wizard()

    await wizard?.next()

    expect(wizard?.page()).toBe(2)
  })

  test('and going back, which is where this is usually got wrong', async () => {
    const engine = engineFor()
    const wizard = engine.wizard()
    await wizard?.next()

    wizard?.back()

    expect(wizard?.page()).toBe(0)
  })

  test('does not hold the form up with an answer nobody was asked for', () => {
    // The dangerous one. `passport` is required and lives on the skipped page, so
    // without this the form cannot be submitted and the error is on a page the
    // person never saw and cannot reach.
    const engine = engineFor()

    const outcome = engine.submit()

    expect(outcome.ok).toBe(true)
  })

  test('and holds it up again the moment it is back', () => {
    const engine = engineFor()
    engine.setValue(['needsVisa'], true)

    const outcome = engine.submit()

    expect(outcome.ok).toBe(false)
    expect(JSON.stringify(outcome.errors)).toMatch(/required/)
  })

  test('hides the fields on it, which is what stops them being validated', () => {
    const engine = engineFor()

    expect(engine.getFieldSnapshot(['passport']).visible).toBe(false)

    engine.setValue(['needsVisa'], true)
    expect(engine.getFieldSnapshot(['passport']).visible).toBe(true)
  })

  test('a form with no skip rules walks exactly as it did', async () => {
    // The guard on the feature: every wizard that existed before this must behave
    // identically, and a page count that went through a filter is a page count
    // that can come back wrong.
    const plain = createFormEngine({
      schema: { ...schema, logic: { rules: [] } },
      capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
    })
    const wizard = plain.wizard()

    expect(wizard?.pageCount).toBe(3)
    await wizard?.next()
    expect(wizard?.page()).toBe(1)
  })
})
