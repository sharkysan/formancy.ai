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

    // Skipped: nobody has said they need a visa, so the rule is true. The page
    // is still THERE — `page()` is an absolute index — and it is marked.
    const live = (): string[] =>
      engine
        .pages()
        .filter((page) => !page.skipped)
        .map((page) => page.key)

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

/**
 * What a skipped page holds, and what a response stores (0246).
 *
 * Its fields are hidden (0087). What is in them stays in `value()` — what a binding sends and
 * the server replays — so every rule judges it as before and the replay sees what the browser
 * saw; `submission()`, what a response stores, leaves out each field, group and list on the page
 * whole, unless its own `clearOnHide` is false. Until 2026-11-26 the fields were hidden from
 * validation and their answers stored all the same.
 */
const tripWith = (passport: Record<string, unknown>, rules: unknown[] = [], extra: unknown[] = []): FormSchema => ({
  ...schema,
  model: {
    fields: [
      {
        key: 'p1',
        type: 'page',
        label: 'About you',
        fields: [
          { key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' },
          { key: 'agreed', type: 'checkbox', label: 'Agreed' },
        ],
      },
      {
        key: 'p2',
        type: 'page',
        label: 'Visa details',
        fields: [{ key: 'passport', type: 'text', label: 'Passport number', ...passport }, ...extra],
      },
    ],
  } as FormSchema['model'],
  logic: { rules: [{ target: 'p2', kind: 'skip', cel: 'needsVisa != true' }, ...rules] } as NonNullable<FormSchema['logic']>,
})

const capabilities = { now: () => 0, today: () => '2026-09-29', random: () => 0.5 }

describe('what a skipped page holds', () => {
  test('is not in what the server stores, whatever the client sent', () => {
    // A4 by the skip road: a client posting an answer for a page the answers walk past had
    // it stored, because the replay hid the field and kept what was sent for it.
    const engine = createFormEngine({
      schema: tripWith({}),
      initialValue: { needsVisa: false, passport: 'X123' },
      capabilities,
      mode: 'server',
    })

    expect(engine.submit().ok).toBe(true)
    expect(engine.submission()).toEqual({ needsVisa: false })
  })

  test('stays in the value while the page is walked past, and is there when it is back', () => {
    // The person who said they need a visa, typed a passport number and then changed their
    // mind withdrew the question, so the answer is not stored; walking back into the page
    // finds it, because the value kept it — where a skip differs from a field a rule hides.
    const engine = createFormEngine({ schema: tripWith({}), capabilities })
    engine.setValue(['needsVisa'], true)
    engine.setValue(['passport'], 'X123')

    engine.setValue(['needsVisa'], false)
    expect(engine.value()).toEqual({ needsVisa: false, passport: 'X123' })
    expect(engine.submission()).toEqual({ needsVisa: false })

    engine.setValue(['needsVisa'], true)
    expect(engine.submission()).toEqual({ needsVisa: true, passport: 'X123' })
  })

  test('is stored all the same with clearOnHide false', () => {
    // The author's opt-out reads on a skipped page as on a hidden field (0013): leaving it out
    // anyway would lose an answer the author asked to keep.
    const engine = createFormEngine({ schema: tripWith({ clearOnHide: false }), capabilities })
    engine.setValue(['needsVisa'], true)
    engine.setValue(['passport'], 'X123')

    engine.setValue(['needsVisa'], false)

    expect(engine.submission()).toHaveProperty('passport', 'X123')
    expect(engine.submit().ok).toBe(true)
  })

  test('leaves out a default and a list of rows nobody was asked for', () => {
    // A10 by the skip road: a new form fills its defaults and a list's minimum rows on every
    // page, and on a page skipped from the start they were stored as answers.
    const engine = createFormEngine({
      schema: tripWith(
        { default: 'none yet' },
        [],
        [{ key: 'trips', type: 'repeater', label: 'Earlier trips', minItems: 1, fields: [{ key: 'to', type: 'text', label: 'To' }] }],
      ),
      capabilities,
    })
    expect(engine.submission()).toEqual({})

    engine.setValue(['needsVisa'], true)

    expect(engine.submission()).toMatchObject({ needsVisa: true, passport: 'none yet' })
    expect((engine.submission() as { trips: unknown[] }).trips).toHaveLength(1)
  })

  test('stays hidden while the page is skipped, whatever a rule of its own says', () => {
    // A `visible` rule and a skip are two reasons to hide a field, and either hides it. When
    // they shared one switch, the next answer anywhere re-ran the rule, which showed the
    // field again on a page nobody can reach — and a required one held the form up there.
    const engine = createFormEngine({
      schema: tripWith({ required: true }, [{ target: 'passport', kind: 'visible', cel: 'agreed == true' }]),
      capabilities,
    })

    engine.setValue(['agreed'], true)
    expect(engine.getFieldSnapshot(['passport']).visible).toBe(false)
    expect(engine.submit().ok).toBe(true)

    // The page back: now the rule's own verdict decides, both ways.
    engine.setValue(['needsVisa'], true)
    expect(engine.getFieldSnapshot(['passport']).visible).toBe(true)
    expect(engine.submit().ok).toBe(false)
    engine.setValue(['agreed'], false)
    expect(engine.getFieldSnapshot(['passport']).visible).toBe(false)
  })

  test('leaves out a computed field on it, which goes on computing', () => {
    // A computed answer is the engine's, so a page walked past leaves it out of what is stored
    // as any other — and it stays current, so it is right the moment the page is back.
    const engine = createFormEngine({
      schema: tripWith({}, [{ target: 'fee', kind: 'computed', cel: 'agreed == true ? 60.0 : 0.0' }], [{ key: 'fee', type: 'number', label: 'Fee' }]),
      initialValue: { needsVisa: false, agreed: true },
      capabilities,
    })
    expect(engine.submission()).toEqual({ needsVisa: false, agreed: true })

    engine.setValue(['agreed'], false)
    engine.setValue(['needsVisa'], true)

    expect(engine.submission()).toHaveProperty('fee', 0)
  })

  test('goes whole, a group or a list by its own clearOnHide, as a group a rule hides does', () => {
    // What a rule hides it hides whole (0184), and a skipped page leaves out each thing on it
    // the same way: a list's rows go with it, and a group that keeps its answers keeps all.
    const engine = createFormEngine({
      schema: tripWith(
        {},
        [],
        [
          { key: 'trips', type: 'repeater', label: 'Earlier trips', fields: [{ key: 'to', type: 'text', label: 'To' }] },
          { key: 'sponsor', type: 'group', label: 'Sponsor', clearOnHide: false, fields: [{ key: 'name', type: 'text', label: 'Name' }] },
        ],
      ),
      initialValue: { needsVisa: false, trips: [{ to: 'Oslo' }], sponsor: { name: 'Ada' } },
      capabilities,
      mode: 'server',
    })

    expect(engine.submission()).toEqual({ needsVisa: false, sponsor: { name: 'Ada' } })
  })
})

describe('a skip reading the page it walks past', () => {
  // Payment walked past when nothing is due, its total shown on it. Pruning what the page held,
  // as a field a rule hides is pruned, took the total the skip reads, so the page came back
  // and the card it asks for held the form up — measured on 2026-11-26 against a first
  // version of this fix, in the browser and on the server's replay alike.
  const payment = {
    specVersion: '3',
    id: 'pay',
    title: 'Pay',
    model: {
      fields: [
        { key: 'p1', type: 'page', label: 'Order', fields: [{ key: 'qty', type: 'number', label: 'Tickets' }] },
        {
          key: 'p2',
          type: 'page',
          label: 'Payment',
          fields: [
            { key: 'total', type: 'number', label: 'Total due' },
            { key: 'card', type: 'text', label: 'Card number', required: true },
          ],
        },
      ],
    },
    logic: {
      rules: [
        { target: 'total', kind: 'computed', cel: 'qty * 10.0' },
        { target: 'p2', kind: 'skip', cel: 'total == 0.0' },
      ],
    },
  } as FormSchema

  test('walks past it and stays past it, in the browser and on the replay', () => {
    const browser = createFormEngine({ schema: payment, capabilities })
    browser.setValue(['qty'], 0)
    const replay = createFormEngine({ schema: payment, initialValue: browser.value(), capabilities, mode: 'server' })

    for (const engine of [browser, replay]) {
      expect(engine.pages().map((page) => page.skipped)).toEqual([false, true])
      expect(engine.submit().ok).toBe(true)
      expect(engine.submission()).toEqual({ qty: 0 })
    }
  })

  test('and two pages each walked past by a default on the other open as they did', () => {
    // With pruning, each page's prune brought the other back and its default re-seeded,
    // until the stack ran out: a document validation accepts that no engine could open.
    const crossed = {
      specVersion: '3',
      id: 'crossed',
      title: 'Crossed',
      model: {
        fields: [
          { key: 'pa', type: 'page', label: 'A', fields: [{ key: 'a', type: 'checkbox', label: 'A', default: true }] },
          { key: 'pb', type: 'page', label: 'B', fields: [{ key: 'b', type: 'checkbox', label: 'B', default: true }] },
        ],
      },
      logic: {
        rules: [
          { target: 'pa', kind: 'skip', cel: 'b == true' },
          { target: 'pb', kind: 'skip', cel: 'a == true' },
        ],
      },
    } as FormSchema

    const engine = createFormEngine({ schema: crossed, capabilities })

    expect(engine.pages().map((page) => page.skipped)).toEqual([true, true])
    expect(engine.submission()).toEqual({})
  })
})

describe('a rule reading what a skipped page holds', () => {
  test('reads it as it did before: what it showed and computed is stored, the answer is not (0246)', () => {
    // The cost of judging with the answers: a field shown because of an answer on a page the
    // answers then walked past is still shown, asked and stored, and a fee computed from it is
    // stored, while the answer itself is not (A3). Pinned so that a change to it is a decision
    // rather than an accident.
    const withFee = {
      ...schema,
      model: {
        fields: [
          {
            key: 'p1',
            type: 'page',
            label: 'About you',
            fields: [
              { key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' },
              { key: 'visaFee', type: 'text', label: 'Visa fee receipt' },
              { key: 'fee', type: 'number', label: 'Fee' },
            ],
          },
          { key: 'p2', type: 'page', label: 'Visa details', fields: [{ key: 'passport', type: 'text', label: 'Passport number' }] },
        ],
      },
      logic: {
        rules: [
          { target: 'p2', kind: 'skip', cel: 'needsVisa != true' },
          { target: 'visaFee', kind: 'visible', cel: "passport == 'X123'" },
          { target: 'fee', kind: 'computed', cel: "passport == 'X123' ? 60.0 : 0.0" },
        ],
      },
    } as FormSchema
    const engine = createFormEngine({ schema: withFee, capabilities })
    engine.setValue(['needsVisa'], true)
    engine.setValue(['passport'], 'X123')
    engine.setValue(['visaFee'], 'R-1')
    engine.setValue(['needsVisa'], false)

    expect(engine.getFieldSnapshot(['visaFee']).visible).toBe(true)
    expect(engine.submission()).toEqual({ needsVisa: false, visaFee: 'R-1', fee: 60 })
  })
})

/**
 * The replay of what the browser hands over judges as the browser did.
 *
 * The browser reaches its answers one at a time; the server builds an engine once, in server
 * mode, from exactly what `value()` handed over. The two must give the same verdict, the same
 * errors, walk past the same pages and store the same thing — the property a first repair of the
 * skipped page broke, by leaving the answers out of `value()` while the browser's rules read
 * them (0246). Each case below disagreed under it, measured on 2026-11-27.
 */
describe('the replay of what the browser hands over', () => {
  const page = (key: string, fields: unknown[]): unknown => ({ key, type: 'page', label: key, fields })
  const formOf = (fields: unknown[], rules: unknown[]): FormSchema =>
    ({ specVersion: '5', id: 'road', title: 'Road', model: { fields }, logic: { rules } }) as FormSchema
  const visa = (p3: unknown[], rules: unknown[], p2extra: unknown[] = []): FormSchema =>
    formOf(
      [
        page('p1', [{ key: 'needsVisa', type: 'checkbox', label: 'Visa?' }]),
        page('p2', [{ key: 'passport', type: 'text', label: 'Passport' }, ...p2extra]),
        page('p3', p3),
      ],
      [{ target: 'p2', kind: 'skip', cel: 'needsVisa != true' }, ...rules],
    )

  const cases: Array<{ name: string; schema: FormSchema; steps: Array<[string, unknown]> }> = [
    {
      name: 'a field shown by an answer on a page later walked past',
      schema: visa([{ key: 'visaFee', type: 'text', label: 'Receipt', required: true }], [{ target: 'visaFee', kind: 'visible', cel: "passport == 'X123'" }]),
      steps: [
        ['needsVisa', true],
        ['passport', 'X123'],
        ['visaFee', 'R-1'],
        ['needsVisa', false],
      ],
    },
    {
      name: 'the same field required and left empty',
      schema: visa([{ key: 'visaFee', type: 'text', label: 'Receipt', required: true }], [{ target: 'visaFee', kind: 'visible', cel: "passport == 'X123'" }]),
      steps: [
        ['needsVisa', true],
        ['passport', 'X123'],
        ['needsVisa', false],
      ],
    },
    {
      name: 'a question required when the skipped page holds no answer',
      schema: formOf(
        [
          page('p1', [{ key: 'insured', type: 'checkbox', label: 'Insured?' }]),
          page('p2', [{ key: 'policy', type: 'text', label: 'Policy number' }]),
          page('p3', [{ key: 'selfPay', type: 'checkbox', label: 'I will pay myself' }]),
        ],
        [
          { target: 'p2', kind: 'skip', cel: 'insured != true' },
          { target: 'selfPay', kind: 'required', cel: 'policy == null' },
        ],
      ),
      steps: [
        ['insured', true],
        ['policy', 'P-9'],
        ['insured', false],
      ],
    },
    {
      name: 'a default on a page skipped from the start feeding a computed fee',
      schema: visa(
        [{ key: 'fee', type: 'number', label: 'Fee' }],
        [{ target: 'fee', kind: 'computed', cel: "visaType == 'tourist' ? 60.0 : 0.0" }],
        [{ key: 'visaType', type: 'text', label: 'Visa type', default: 'tourist' }],
      ),
      steps: [['needsVisa', false]],
    },
    {
      name: 'a skip reading an answer on a page that is walked past',
      schema: formOf(
        [
          page('p1', [{ key: 'go', type: 'checkbox', label: 'Go' }]),
          page('p2', [{ key: 'x', type: 'checkbox', label: 'X' }]),
          page('p3', [{ key: 'y', type: 'text', label: 'Y', required: true }]),
        ],
        [
          { target: 'p2', kind: 'skip', cel: 'go != true' },
          { target: 'p3', kind: 'skip', cel: 'x != true' },
        ],
      ),
      steps: [
        ['go', true],
        ['x', true],
        ['go', false],
      ],
    },
    {
      name: 'a skip reading an answered field on its own page',
      schema: formOf(
        [page('p1', [{ key: 'name', type: 'text', label: 'Name' }]), page('p2', [{ key: 'consented', type: 'checkbox', label: 'I consent', required: true }])],
        [{ target: 'p2', kind: 'skip', cel: 'consented == true' }],
      ),
      steps: [['consented', true]],
    },
  ]

  for (const { name, schema: form, steps } of cases) {
    test(name, () => {
      const browser = createFormEngine({ schema: form, capabilities })
      for (const [key, value] of steps) browser.setValue([key], value)
      const replay = createFormEngine({ schema: form, initialValue: browser.value(), capabilities, mode: 'server' })

      const seen = (engine: typeof browser) => ({
        submit: engine.submit(),
        pages: engine.pages().map((each) => each.skipped),
        stored: engine.submission(),
      })
      expect(seen(replay)).toEqual(seen(browser))
    })
  }
})
