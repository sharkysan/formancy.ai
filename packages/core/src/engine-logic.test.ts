import { describe, expect, test } from 'vitest'
import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import type { FormEngineOptions } from './engine.js'

const FIXED_CLOCK = { now: () => 1_726_000_000_000, today: () => '2026-09-19', random: () => 0.5 }

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'country', type: 'select' },
      { key: 'canton', type: 'text', required: true },
      { key: 'state', type: 'text', clearOnHide: false },
      { key: 'price', type: 'number' },
      { key: 'qty', type: 'number' },
      { key: 'subtotal', type: 'number' },
      { key: 'total', type: 'number' },
      { key: 'vip', type: 'checkbox' },
      { key: 'reason', type: 'text' },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'state', kind: 'visible', cel: 'country == "US"' },
      { target: 'subtotal', kind: 'computed', cel: 'price * qty' },
      { target: 'total', kind: 'computed', cel: 'subtotal * 1.1' },
      { target: 'reason', kind: 'required', cel: 'vip == true' },
      { target: 'qty', kind: 'validate', cel: 'qty == null || qty <= 100.0', code: 'tooMany' },
    ],
  },
}

function engineWith(overrides?: Partial<FormEngineOptions>) {
  return createFormEngine({ schema, capabilities: FIXED_CLOCK, ...overrides })
}

describe('visibility rules', () => {
  test('a field is hidden while its visible rule is false, and appears when it turns true', () => {
    const engine = engineWith()

    expect(engine.getFieldSnapshot(['canton']).visible).toBe(false)

    engine.setValue(['country'], 'CH')

    expect(engine.getFieldSnapshot(['canton']).visible).toBe(true)
    expect(engine.getFieldSnapshot(['state']).visible).toBe(false)
  })

  test('a hidden field is excluded from validation, even when required', () => {
    const engine = engineWith()

    // canton is required in the model but hidden while country is not CH.
    expect(engine.validate().errors['canton']).toBeUndefined()

    engine.setValue(['country'], 'CH')
    expect(engine.validate().errors['canton']).toEqual(['required'])
  })

  test('hiding a field prunes its value by default — a hidden branch cannot smuggle data', () => {
    const engine = engineWith()
    engine.setValue(['country'], 'CH')
    engine.setValue(['canton'], 'ZH')

    engine.setValue(['country'], 'DE')

    expect('canton' in (engine.value() as Record<string, unknown>)).toBe(false)
  })

  test('clearOnHide false keeps the value, and it is there when the field returns', () => {
    const engine = engineWith()
    engine.setValue(['country'], 'US')
    engine.setValue(['state'], 'CA')

    engine.setValue(['country'], 'CH')
    expect((engine.value() as Record<string, unknown>)['state']).toBe('CA')

    engine.setValue(['country'], 'US')
    expect(engine.getFieldSnapshot(['state']).value).toBe('CA')
  })
})

describe('computed rules', () => {
  test('a computed field follows its inputs, through a chain, in one settled pass', () => {
    const engine = engineWith()

    engine.setValue(['price'], 10.0)
    engine.setValue(['qty'], 3.0)

    expect(engine.getFieldSnapshot(['subtotal']).value).toBe(30)
    expect(engine.getFieldSnapshot(['total']).value).toBeCloseTo(33)
  })

  test('a cyclic computed chain is rejected when the engine is built, with the cycle named', () => {
    const cyclic: FormSchema = {
      ...schema,
      logic: {
        rules: [
          { target: 'price', kind: 'computed', cel: 'qty * 1.0' },
          { target: 'qty', kind: 'computed', cel: 'price * 1.0' },
        ],
      },
    }

    expect(() => createFormEngine({ schema: cyclic, capabilities: FIXED_CLOCK })).toThrow(/price|qty/)
  })
})

/**
 * The rules of one pass read one bag of answers, and what a computed rule writes goes into it for
 * the rules after it. It went in at the target's top-level name, which for a field inside a group
 * is the group's: a rule writing `addr.zip` left `addr` as "3000", and a row rule in a repeater
 * inside a group left the group as the list of rows. Every rule after it that read a member of the
 * group could not be evaluated whenever the computed rule had written, which once its inputs are
 * answered is every pass.
 */
describe('what a computed rule writes inside a group, read by the rules after it in the same pass', () => {
  const form = (fields: FieldDef[], rules: LogicRule[]): FormSchema => ({
    specVersion: '1',
    id: 'grouped',
    title: 'Grouped',
    model: { fields },
    logic: { rules },
  })

  const address = form(
    [
      {
        key: 'addr',
        type: 'group',
        fields: [
          { key: 'city', type: 'text' },
          { key: 'zip', type: 'text' },
        ],
      },
      { key: 'label', type: 'text' },
      { key: 'town', type: 'text' },
      { key: 'canton', type: 'text' },
      { key: 'note', type: 'text' },
      { key: 'locked', type: 'text' },
    ],
    [
      { target: 'addr.zip', kind: 'computed', cel: '"3000"' },
      { target: 'label', kind: 'computed', cel: '"PLZ " + addr.zip' },
      { target: 'town', kind: 'computed', cel: 'addr.city' },
      { target: 'canton', kind: 'required', cel: 'addr.city == "Bern"' },
      { target: 'note', kind: 'visible', cel: 'addr.city == "Basel"' },
      { target: 'locked', kind: 'disabled', cel: 'addr.city == "Bern"' },
    ],
  )
  const inBern = (mode: 'client' | 'server' = 'client') =>
    createFormEngine({ schema: address, capabilities: FIXED_CLOCK, mode, initialValue: { addr: { city: 'Bern' }, note: 'typed' } })

  test('a rule after it reads the value it wrote', () => {
    // With "3000" where the group belongs, `addr.zip` could not be evaluated, and the label was not
    // written, though the zip it reads was stored.
    expect(inBern().getFieldSnapshot(['label']).value).toBe('PLZ 3000')
  })

  test('a rule after it reads a field of the group the rule did not write', () => {
    // The city stood beside the zip in the store and not in the bag, so the town stayed empty
    // however often the city was changed.
    const engine = inBern()
    expect(engine.getFieldSnapshot(['town']).value).toBe('Bern')

    engine.setValue(['addr', 'city'], 'Thun')
    expect(engine.getFieldSnapshot(['town']).value).toBe('Thun')
  })

  test('a required, a visible and a disabled rule read the group whole, in the browser and on the replay', () => {
    // They run after every computed rule, and each failed open, as 0022 has them: the canton was
    // not asked for and a submission without it was accepted, the note a rule hides was shown, so
    // the server's replay kept what was typed into it rather than strip it, and the field a rule
    // locks could be changed.
    for (const mode of ['client', 'server'] as const) {
      const engine = inBern(mode)

      expect(engine.getFieldSnapshot(['canton']).required).toBe(true)
      expect(engine.getFieldSnapshot(['note']).visible).toBe(false)
      expect(engine.getFieldSnapshot(['locked']).disabled).toBe(true)
      expect(engine.submit()).toEqual({ ok: false, errors: { canton: ['required'] } })
      expect('note' in (engine.value() as Record<string, unknown>)).toBe(false)
    }
  })

  const order = form(
    [
      {
        key: 'order',
        type: 'group',
        fields: [
          { key: 'note', type: 'text' },
          {
            key: 'lines',
            type: 'repeater',
            fields: [
              { key: 'qty', type: 'number' },
              { key: 'twice', type: 'number' },
              { key: 'label', type: 'text' },
            ],
          },
        ],
      },
      { key: 'remark', type: 'text' },
    ],
    [
      { target: 'order.lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' },
      // Reads `item.twice`, so it runs after the rule above.
      { target: 'order.lines[].label', kind: 'computed', cel: 'order.note + " " + string(item.twice)' },
      { target: 'remark', kind: 'visible', cel: 'has(order.note) && order.note != "Probe"' },
    ],
  )
  const probe = () => createFormEngine({ schema: order, capabilities: FIXED_CLOCK, initialValue: { order: { note: 'Probe', lines: [{ qty: 2 }] } } })

  test('a row rule after another, in a repeater inside a group, reads the group', () => {
    // The group was left as its rows, so `order.note` could not be evaluated and every row's
    // label stayed empty.
    expect(probe().getFieldSnapshot(['order', 'lines', 0, 'label']).value).toBe('Probe 4')
  })

  test('a rule after the row rules reads the group, not its rows', () => {
    // The visible rule read the rows where the group belongs, failed open, and showed the remark.
    expect(probe().getFieldSnapshot(['remark']).visible).toBe(false)
  })

  test('a group holding nothing yet is read as the group, not as no rows', () => {
    // With nothing stored there is nothing to read back, and the group was left as an empty list,
    // so even `has(order.note)` could not be evaluated, and the remark showed on every untouched form.
    const engine = createFormEngine({ schema: order, capabilities: FIXED_CLOCK })

    expect(engine.getFieldSnapshot(['remark']).visible).toBe(false)
  })

  test('control: a target at the top level is read back as it was written', () => {
    // Passed before the fix as after. The group is re-read whole from the store; at the top level
    // that is the value just written, so a rule after it reads what it read before.
    const engine = createFormEngine({
      schema: form(
        [
          { key: 'zip', type: 'text' },
          { key: 'label', type: 'text' },
        ],
        [
          { target: 'zip', kind: 'computed', cel: '"3000"' },
          { target: 'label', kind: 'computed', cel: '"PLZ " + zip' },
        ],
      ),
      capabilities: FIXED_CLOCK,
    })

    expect(engine.getFieldSnapshot(['label']).value).toBe('PLZ 3000')
  })

  test('control: a repeater at the top level is read back as its rows, or as none', () => {
    // Passed before the fix as after. A rule after the row rules reads the rows as just written,
    // and a repeater handed null, which validation takes for no rows, as none: read as null, the
    // count could not be evaluated and a visible rule reading its size would show its field.
    const lines = form(
      [
        { key: 'note', type: 'text' },
        {
          key: 'lines',
          type: 'repeater',
          fields: [
            { key: 'qty', type: 'number' },
            { key: 'twice', type: 'number' },
            { key: 'label', type: 'text' },
          ],
        },
        { key: 'count', type: 'number' },
      ],
      [
        { target: 'lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' },
        { target: 'lines[].label', kind: 'computed', cel: 'note + " " + string(item.twice)' },
        { target: 'count', kind: 'computed', cel: 'size(lines) == 0 ? 0.0 : lines[0].twice' },
      ],
    )
    const engine = (initialValue: unknown) => createFormEngine({ schema: lines, capabilities: FIXED_CLOCK, initialValue })

    const filled = engine({ note: 'Probe', lines: [{ qty: 2 }] })
    expect(filled.getFieldSnapshot(['lines', 0, 'label']).value).toBe('Probe 4')
    expect(filled.getFieldSnapshot(['count']).value).toBe(4)
    expect(engine({ note: 'Probe', lines: null }).getFieldSnapshot(['count']).value).toBe(0)
    expect(engine({ note: 'Probe' }).getFieldSnapshot(['count']).value).toBe(0)
  })
})

/**
 * The pass runs the computed rules in the order of what they read. That order was worked out on
 * top-level names: a rule writing inside a group was the group's, and a read of a field in it was
 * a read of the group. So a reader of a row member in a repeater inside a group was not ordered
 * after the row rule, and read the rows as the pass before had left them; and a computed field in
 * a group reading another field of the group read itself, and the form was refused as a cycle.
 */
describe('a computed rule is ordered by the field it writes and the fields it reads, not their top-level names', () => {
  const form = (fields: FieldDef[], rules: LogicRule[]): FormSchema => ({
    specVersion: '1',
    id: 'ordered',
    title: 'Ordered',
    model: { fields },
    logic: { rules },
  })
  /** The server's replay: an engine on that side, built from the answers the browser sends. */
  const replayed = (schema: FormSchema, answers: unknown): unknown => {
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, mode: 'server', initialValue: answers })
    expect(engine.submit().ok).toBe(true)
    return engine.value()
  }

  const order = (rules: LogicRule[]): FormSchema =>
    form(
      [
        {
          key: 'order',
          type: 'group',
          fields: [
            { key: 'note', type: 'text' },
            {
              key: 'lines',
              type: 'repeater',
              fields: [
                { key: 'qty', type: 'number' },
                { key: 'twice', type: 'number' },
                { key: 'label', type: 'text' },
              ],
            },
          ],
        },
        { key: 'first', type: 'number' },
        { key: 'remark', type: 'text' },
      ],
      rules,
    )
  const twice: LogicRule = { target: 'order.lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' }
  const first: LogicRule = { target: 'first', kind: 'computed', cel: 'size(order.lines) == 0 ? 0.0 : order.lines[0].twice' }

  test('a field reading a row member in a repeater inside a group shows what the server stores', () => {
    // `first` ran before the row rule and read the rows as the pass before had left them: with the
    // quantity changed from 2 to 3 the row said 6 and `first` still 4. The server's replay of those
    // answers, in whose pass the member it reads was not computed yet, stored no `first` at all.
    const schema = order([twice, first])
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: { order: { lines: [{ qty: 2 }] } } })
    engine.setValue(['order', 'lines', 0, 'qty'], 3)

    expect(engine.getFieldSnapshot(['order', 'lines', 0, 'twice']).value).toBe(6)
    expect(engine.getFieldSnapshot(['first']).value).toBe(6)
    const stored = replayed(schema, engine.value())
    expect(stored).toEqual(engine.value())
    expect(stored).toMatchObject({ first: 6 })
  })

  test('the form of the group fix with an aggregate over the rows, in the browser and on the replay', () => {
    // Ordering the group after its rows, the obvious repair of the case above, makes the label,
    // which reads `order.note`, depend on itself, and refuses this form.
    const schema = order([
      twice,
      { target: 'order.lines[].label', kind: 'computed', cel: 'order.note + " " + string(item.twice)' },
      first,
      { target: 'remark', kind: 'visible', cel: 'has(order.note) && order.note != "Probe"' },
    ])
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: { order: { note: 'Probe', lines: [{ qty: 2 }] } } })
    engine.setValue(['order', 'lines', 0, 'qty'], 3)

    expect(engine.getFieldSnapshot(['order', 'lines', 0, 'label']).value).toBe('Probe 6')
    expect(engine.getFieldSnapshot(['first']).value).toBe(6)
    expect(engine.getFieldSnapshot(['remark']).visible).toBe(false)
    expect(replayed(schema, engine.value())).toEqual(engine.value())
  })

  test('a loop through a row rule in a repeater inside a group is refused, as it was at the top level', () => {
    // Not seen, so the form was accepted, and opened with a row in it computed neither field.
    const loop = order([{ target: 'order.lines[].twice', kind: 'computed', cel: 'item.qty * 2.0 + first' }, first])

    expect(() => createFormEngine({ schema: loop, capabilities: FIXED_CLOCK })).toThrow('Dependency cycle: first -> order.lines[].twice -> first')
  })

  test('a row rule on a list another rule computes whole fills its field, in the browser and on the replay', () => {
    // At the top level the row rule ran first, and the list written whole after it replaced what
    // it wrote, so the field stayed empty on both sides. Inside a group it ran last, and was right.
    const schema = form(
      [
        {
          key: 'lines',
          type: 'repeater',
          fields: [
            { key: 'qty', type: 'number' },
            { key: 'twice', type: 'number' },
          ],
        },
      ],
      [
        { target: 'lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' },
        { target: 'lines', kind: 'computed', cel: '[{"qty": 3.0}]' },
      ],
    )
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK })

    expect(engine.getFieldSnapshot(['lines', 0, 'twice']).value).toBe(6)
    expect(replayed(schema, engine.value())).toEqual(engine.value())
  })

  const address = form(
    [
      {
        key: 'addr',
        type: 'group',
        fields: [
          { key: 'city', type: 'text' },
          { key: 'label', type: 'text' },
        ],
      },
    ],
    [{ target: 'addr.label', kind: 'computed', cel: '"in " + addr.city' }],
  )

  test('a computed field in a group reads another field of its group, in the browser and on the replay', () => {
    // Refused as "Dependency cycle: addr -> addr": the write and the read were both the group.
    const engine = createFormEngine({ schema: address, capabilities: FIXED_CLOCK, initialValue: { addr: { city: 'Bern' } } })
    expect(engine.getFieldSnapshot(['addr', 'label']).value).toBe('in Bern')

    engine.setValue(['addr', 'city'], 'Thun')
    expect(engine.getFieldSnapshot(['addr', 'label']).value).toBe('in Thun')
    expect(replayed(address, engine.value())).toEqual({ addr: { city: 'Thun', label: 'in Thun' } })
  })

  test('a computed field reading its group whole is refused, with the field named', () => {
    // `size(addr)` reads the field being computed. The cycle named the group, which says which
    // group and not which of its rules.
    const whole = form(address.model.fields, [{ target: 'addr.label', kind: 'computed', cel: 'string(size(addr))' }])

    expect(() => createFormEngine({ schema: whole, capabilities: FIXED_CLOCK })).toThrow('Dependency cycle: addr.label -> addr.label')
  })
})

/**
 * What the order keeps from main's, and what it refuses that main accepted, run in the browser and
 * on the replay. A row rule in a repeater inside a group reading a list or a group inside a group
 * whole depended on none of their rows on main, and still does (0240): a row count, the row before,
 * the last row and another list's count computed right, and a version published with one must go
 * on opening.
 */
describe('a row rule in a repeater inside a group reading a list inside a group whole, and the loops it is not', () => {
  const lines = (key: string): FieldDef => ({
    key,
    type: 'repeater',
    fields: [
      { key: 'qty', type: 'number' },
      { key: 'x', type: 'number' },
      { key: 'y', type: 'number' },
      { key: 'share', type: 'number' },
    ],
  })
  const form = (fields: FieldDef[], rules: LogicRule[]): FormSchema => ({ specVersion: '1', id: 'rows', title: 'Rows', model: { fields }, logic: { rules } })
  const inGroup = (rules: LogicRule[]): FormSchema =>
    form(
      [
        { key: 'order', type: 'group', fields: [{ key: 'note', type: 'text' }, { key: 'count', type: 'number' }, lines('lines'), lines('other')] },
        { key: 'count', type: 'number' },
        { key: 'other', type: 'group', fields: [lines('lines')] },
      ],
      rules,
    )
  const atTop = (rules: LogicRule[]): FormSchema => form([lines('lines')], rules)
  const x = (cel: string, target = 'order.lines[].x'): LogicRule => ({ target, kind: 'computed', cel })
  const column = (value: unknown, path: readonly string[], member: string): unknown[] =>
    (path.reduce<unknown>((held, key) => (held as Record<string, unknown> | undefined)?.[key], value) as Array<Record<string, unknown>>).map(
      (row) => row[member],
    )
  const xs = (value: unknown, path: readonly string[]): unknown[] => column(value, path, 'x')
  const replayed = (schema: FormSchema, answers: unknown): unknown =>
    createFormEngine({ schema, capabilities: FIXED_CLOCK, mode: 'server', initialValue: answers }).value()

  test('a row count, the row before and the last row compute as on main, in the browser and on the replay', () => {
    // Refused as `order.lines[].x -> order.lines[].x` by the change before this ruling, though each
    // computed right on main. Their figures here are main's, measured on 2026-11-22.
    for (const [cel, built, edited] of [
      ['double(size(order.lines))', [2, 2], [3, 3, 3]],
      ['index == 0 ? 0.0 : order.lines[index - 1].qty * 1.0', [0, 2], [0, 3, 5]],
      ['index == size(order.lines) - 1 ? 1.0 : 0.0', [0, 1], [0, 0, 1]],
      // A row's share of the count, read in the row itself: the rewrite of the share below.
      ['item.qty / double(size(order.lines))', [1, 2.5], [1, 5 / 3, 1 / 3]],
    ] as const) {
      const schema = inGroup([x(cel)])
      const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: { order: { lines: [{ qty: 2 }, { qty: 5 }] } } })
      expect(xs(engine.value(), ['order', 'lines']), cel).toEqual(built)

      engine.setValue(['order', 'lines', 0, 'qty'], 3)
      engine.addRow(['order', 'lines'])
      engine.setValue(['order', 'lines', 2, 'qty'], 1)
      expect(xs(engine.value(), ['order', 'lines']), cel).toEqual(edited)
      expect(xs(replayed(schema, engine.value()), ['order', 'lines']), cel).toEqual(edited)
    }
  })

  test('debt: a running total down the rows of a repeater inside a group is a pass behind, as on main', () => {
    // Accepted because refusing it would retire versions main published, and wrong because the
    // row before is read as the pass before left it: after the first quantity goes from 2 to 3 the
    // second row says 7 where 8 is due, and the replay, one pass from nothing, stores no second
    // row's total at all. 0240, A5 and §11 call it debt; this fails the day it is fixed.
    const schema = inGroup([x('index == 0 ? item.qty * 1.0 : order.lines[index - 1].x + item.qty')])
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: { order: { lines: [{ qty: 2 }, { qty: 5 }] } } })
    engine.setValue(['order', 'lines', 0, 'qty'], 3)

    expect(xs(engine.value(), ['order', 'lines'])).toEqual([3, 7])
    expect(xs(replayed(schema, engine.value()), ['order', 'lines'])).toEqual([3, undefined])
  })

  test('control: at the top level the same rules are refused, as they were on main', () => {
    // Passed before as after, the trace's wording aside: `concepts/logic.md` says a row rule that
    // reads its own list reads its own row.
    for (const cel of ['double(size(lines))', 'index == 0 ? 0.0 : lines[index - 1].qty * 1.0', 'index == size(lines) - 1 ? 1.0 : 0.0']) {
      expect(() => createFormEngine({ schema: atTop([x(cel, 'lines[].x')]), capabilities: FIXED_CLOCK }), cel).toThrow(
        'Dependency cycle: lines[].x -> lines[].x',
      )
    }
  })

  test('the loops through a repeater inside a group main did not see are refused', () => {
    // Accepted on main, refused at the top level and now in a group alike. A row's share of a count
    // computed from its own list computed right on main; it reads `size(order.lines)` in the row
    // now, as above. A row reading another row's member by position showed what the replay did not
    // store.
    const refused = (rules: LogicRule[]) => () => createFormEngine({ schema: inGroup(rules), capabilities: FIXED_CLOCK })

    expect(refused([x('item.qty / count', 'order.lines[].share'), { target: 'count', kind: 'computed', cel: 'double(size(order.lines))' }])).toThrow(
      'Dependency cycle: count -> order.lines[].share -> count',
    )
    expect(refused([x('index == 0 ? 1.0 : order.lines[0].x + 1.0')])).toThrow('Dependency cycle: order.lines[].x -> order.lines[].x')
    // The total kept inside the group was refused on main already, as `order -> order`, and still is.
    expect(
      refused([x('item.qty / order.count', 'order.lines[].share'), { target: 'order.count', kind: 'computed', cel: 'double(size(order.lines))' }]),
    ).toThrow('Dependency cycle: order.count -> order.lines[].share -> order.count')
  })

  test('two lists of the group each reading the other whole compute as on main, in the browser and on the replay', () => {
    // Refused as `order.lines[].x -> order.other[].y -> order.lines[].x` by the first ruling, which
    // kept only a row's read of its own list whole; main opened it. Its figures here are main's.
    const schema = inGroup([x('double(size(order.other))'), x('double(size(order.lines))', 'order.other[].y')])
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: { order: { lines: [{ qty: 2 }, { qty: 5 }], other: [{ qty: 1 }] } } })
    const both = (value: unknown) => [xs(value, ['order', 'lines']), column(value, ['order', 'other'], 'y')]
    expect(both(engine.value())).toEqual([[1, 1], [2]])

    engine.addRow(['order', 'lines'])
    engine.addRow(['order', 'other'])
    expect(both(engine.value())).toEqual([
      [2, 2, 2],
      [3, 3],
    ])
    expect(both(replayed(schema, engine.value()))).toEqual(both(engine.value()))
  })

  test('lists of two groups each reading the other whole compute as on main, in the browser and on the replay', () => {
    // Refused as `order.lines[].x -> other.lines[].y -> order.lines[].x` by the second ruling, which
    // kept only a read of the rule's own group whole; main opened it. Its figures here are main's.
    const schema = inGroup([x('double(size(other.lines))'), x('double(size(order.lines))', 'other.lines[].y')])
    const engine = createFormEngine({
      schema,
      capabilities: FIXED_CLOCK,
      initialValue: { order: { lines: [{ qty: 2 }, { qty: 5 }] }, other: { lines: [{ qty: 1 }] } },
    })
    const both = (value: unknown) => [xs(value, ['order', 'lines']), column(value, ['other', 'lines'], 'y')]
    expect(both(engine.value())).toEqual([[1, 1], [2]])

    engine.addRow(['order', 'lines'])
    engine.addRow(['other', 'lines'])
    expect(both(engine.value())).toEqual([
      [2, 2, 2],
      [3, 3],
    ])
    expect(both(replayed(schema, engine.value()))).toEqual(both(engine.value()))
  })

  test("debt: a whole read of a member another row rule computes is this pass's when that rule runs first, the pass before's after, as on main", () => {
    // A row rule in a repeater inside a group, reading rows whole, waits for no row rule of a list
    // inside a group, so it reads the rows as the order leaves them when it runs, which for these forms is main's: a member a
    // rule listed before it computes is this pass's, one listed after it the pass before's, and the
    // replay, one pass from the answers, then stores none. A list of the same group, a list of
    // another group, and the reader's own list alike; moving a rule in the document flips the
    // value. Main's figures, measured on 2026-11-22; 0240, A5 and §11 call it debt, and this fails
    // the day it changes.
    const start = { order: { lines: [{ qty: 1 }, { qty: 2 }], other: [{ qty: 1 }] }, other: { lines: [{ qty: 1 }] } }
    const cases = [
      // Another list's computed members, counted: the quantity goes from 1 to 2, and 4 is over 2.
      ...(['order.other', 'other.lines'] as const).map((wire) => ({
        wire,
        reader: x(`double(${wire}.filter(o, o.y > 2.0).size())`),
        writer: x('item.qty * 2.0', `${wire}[].y`),
        edit: [...wire.split('.'), 0, 'qty'],
        read: (value: unknown) => xs(value, ['order', 'lines']),
      })),
      // The reader's own list, another member of it counted: the first quantity goes to 3, and 6 is over 4.
      {
        wire: 'order.lines',
        reader: x('double(order.lines.filter(l, l.x > 4.0).size())', 'order.lines[].y'),
        writer: x('item.qty * 2.0'),
        edit: ['order', 'lines', 0, 'qty'],
        read: (value: unknown) => column(value, ['order', 'lines'], 'y'),
      },
    ]
    for (const { wire, reader, writer, edit, read } of cases) {
      for (const [listed, rules, browser, stored] of [
        ['writer after', [reader, writer], [0, 0], [undefined, undefined]],
        ['writer before', [writer, reader], [1, 1], [1, 1]],
      ] as const) {
        const schema = inGroup([...rules])
        const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: start })
        engine.setValue(edit, wire === 'order.lines' ? 3 : 2)

        expect(read(engine.value()), `${wire}, ${listed}`).toEqual(browser)
        expect(read(replayed(schema, engine.value())), `${wire}, ${listed}, replay`).toEqual(stored)
      }
    }
  })

  test('a whole read inside a group reads as on main when a top-level rule waits for its row rule', () => {
    // `lines[].x` or `first` reading `g.lines` whole waits for `g.lines[].x`. The depth-first order
    // then ran `g.lines[].x` ahead of `g.other[].y`, listed before it, where main ran it after: with
    // the quantity going from 1 to 2 it counted 0 where 1 is due, and the replay stored none. Main's
    // figures, measured on 2026-11-22.
    const model: FieldDef[] = [{ key: 'first', type: 'number' }, lines('lines'), { key: 'g', type: 'group', fields: [lines('lines'), lines('other')] }]
    const start = { lines: [{ qty: 1 }], g: { lines: [{ qty: 1 }], other: [{ qty: 1 }] } }
    for (const waiting of [x('double(size(g.lines))', 'lines[].x'), x('double(size(g.lines))', 'first')]) {
      const schema = form(model, [x('item.qty * 2.0', 'g.other[].y'), x('double(g.other.filter(o, o.y > 2.0).size())', 'g.lines[].x'), waiting])
      const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: start })
      engine.setValue(['g', 'other', 0, 'qty'], 2)

      expect(xs(engine.value(), ['g', 'lines']), waiting.target).toEqual([1])
      expect(xs(replayed(schema, engine.value()), ['g', 'lines']), waiting.target).toEqual([1])
    }
  })

  test('a whole read beside a wait main did not have is pinned where the order leaves it', () => {
    // A read into a row now waits for the rule it names, a wait main did not have. Pinned at what
    // this order gives, measured on 2026-11-22, so that a change to the order fails here first.
    // Writer: `h.lines[].x` waits for `g.other[].x`, which takes its place and runs first, then x,
    // then `g.lines[].y` counting `h.lines` whole: x 3 and y 1, both stored. Main ran x before
    // `g.other[].x` and gave x 2 where 3 is due and y 1, storing neither. Reader: `g.lines[].x` also
    // reads `g.third[0].z`, a rule of its rank listed last, which takes its place; it still counts
    // `g.other` before `g.other[].y` runs, 0 where 1 is due and none stored, as main counted.
    const model: FieldDef[] = [
      {
        key: 'g',
        type: 'group',
        fields: [
          lines('lines'),
          lines('other'),
          {
            key: 'third',
            type: 'repeater',
            fields: [
              { key: 'qty', type: 'number' },
              { key: 'z', type: 'number' },
            ],
          },
        ],
      },
      { key: 'h', type: 'group', fields: [lines('lines')] },
    ]
    const start = { g: { lines: [{ qty: 1 }], other: [{ qty: 1 }], third: [{ qty: 1 }] }, h: { lines: [{ qty: 1 }] } }

    const held = form(model, [
      x('g.other[0].x + 1.0', 'h.lines[].x'),
      x('double(h.lines.filter(l, l.x > 1.0).size())', 'g.lines[].y'),
      x('double(index) + item.qty', 'g.other[].x'),
    ])
    const writer = createFormEngine({ schema: held, capabilities: FIXED_CLOCK, initialValue: start })
    writer.setValue(['g', 'other', 0, 'qty'], 2)
    expect([xs(writer.value(), ['h', 'lines']), column(writer.value(), ['g', 'lines'], 'y')]).toEqual([[3], [1]])
    const stored = replayed(held, writer.value())
    expect([xs(stored, ['h', 'lines']), column(stored, ['g', 'lines'], 'y')]).toEqual([[3], [1]])

    const late = form(model, [
      x('double(g.other.filter(o, o.y > 2.0).size()) + g.third[0].z', 'g.lines[].x'),
      x('item.qty * 2.0', 'g.other[].y'),
      x('item.qty * 0.0', 'g.third[].z'),
    ])
    const reader = createFormEngine({ schema: late, capabilities: FIXED_CLOCK, initialValue: start })
    reader.setValue(['g', 'other', 0, 'qty'], 2)
    expect(xs(reader.value(), ['g', 'lines'])).toEqual([0])
    expect(xs(replayed(late, reader.value()), ['g', 'lines'])).toEqual([undefined])
  })

  test('a count placed between a row rule and the member it reads through item reads it as on main', () => {
    // `g.lines[].x` reads `item.y`, a wait main had too, and main's depth-first order ran `y`'s rule
    // just before it, ahead of the count `g.other[].share` listed between them. Held back by place
    // alone, x ran after the count: with the first quantity going from 1 to 2 the count said 0 where
    // 1 is due, and the replay stored none. Main's figures, measured on 2026-11-22.
    const model: FieldDef[] = [{ key: 'g', type: 'group', fields: [lines('lines'), lines('other')] }]
    const schema = form(model, [
      x('item.y * 1.0', 'g.lines[].x'),
      x('double(g.lines.filter(l, l.x > 2.0).size())', 'g.other[].share'),
      x('item.qty * 2.0', 'g.lines[].y'),
    ])
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: { g: { lines: [{ qty: 1 }], other: [{ qty: 1 }] } } })
    engine.setValue(['g', 'lines', 0, 'qty'], 2)

    expect(column(engine.value(), ['g', 'other'], 'share')).toEqual([1])
    expect(column(replayed(schema, engine.value()), ['g', 'other'], 'share')).toEqual([1])
  })

  test('a row reading the group in its own row whole waits for what is written in it, so a loop through it is refused, at the top level too', () => {
    // Main resolved `item.sub` to a node of that exact name, so it never reached `lines[].sub.z`,
    // and accepted both; at field granularity each is a loop. The same principle refuses every
    // loop main's top-level names hid, wherever the list is.
    const sub: FieldDef = {
      key: 'lines',
      type: 'repeater',
      fields: [
        { key: 'qty', type: 'number' },
        { key: 'x', type: 'number' },
        { key: 'sub', type: 'group', fields: [{ key: 'z', type: 'number' }] },
      ],
    }
    const refused = (rules: LogicRule[]) => () => createFormEngine({ schema: form([sub], rules), capabilities: FIXED_CLOCK })

    expect(refused([x('double(size(item.sub))', 'lines[].sub.z')])).toThrow('Dependency cycle: lines[].sub.z -> lines[].sub.z')
    expect(refused([x('double(size(item.sub))', 'lines[].x'), x('item.x * 2.0', 'lines[].sub.z')])).toThrow(
      'Dependency cycle: lines[].x -> lines[].sub.z -> lines[].x',
    )
  })

  test('a row reading a member of a group computed whole in its row waits for it, which main did not, at the top level', () => {
    // `item.sub.z` named a node of its own on main, not `lines[].sub`, so the row read the sub-group
    // as the pass before left it, and the replay, one pass from the answers, stored no `x`.
    const sub: FieldDef = {
      key: 'lines',
      type: 'repeater',
      fields: [
        { key: 'qty', type: 'number' },
        { key: 'x', type: 'number' },
        { key: 'sub', type: 'group', fields: [{ key: 'z', type: 'number' }] },
      ],
    }
    const schema = form([sub], [x('item.sub.z * 2.0', 'lines[].x'), x('{"z": item.qty}', 'lines[].sub')])
    const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK, initialValue: { lines: [{ qty: 2 }, { qty: 5 }] } })

    expect(xs(engine.value(), ['lines'])).toEqual([4, 10])
    expect(xs(replayed(schema, engine.value()), ['lines'])).toEqual([4, 10])
  })

  test('a top-level row reading another row by position is accepted now, and waits for what it reads', () => {
    // Main read `lines[0].qty` as `lines`, whose node every row rule of the list fed, and refused
    // them as `lines -> lines[].x -> lines` and `lines -> lines[].y -> lines`. Read as the field it
    // names, the first reads nothing a rule writes and the second waits for the row rule it reads;
    // neither is a loop.
    const top = (rules: LogicRule[]) => form([lines('lines')], rules)
    const first = top([x('lines[0].qty * 1.0', 'lines[].x')])
    const second = top([x('lines[0].x + 1.0', 'lines[].y'), x('item.qty * 2.0', 'lines[].x')])
    const initialValue = { lines: [{ qty: 2 }, { qty: 5 }] }

    const one = createFormEngine({ schema: first, capabilities: FIXED_CLOCK, initialValue })
    expect(xs(one.value(), ['lines'])).toEqual([2, 2])
    expect(xs(replayed(first, one.value()), ['lines'])).toEqual([2, 2])
    const two = createFormEngine({ schema: second, capabilities: FIXED_CLOCK, initialValue })
    expect(column(two.value(), ['lines'], 'y')).toEqual([5, 5])
    expect(column(replayed(second, two.value()), ['lines'], 'y')).toEqual([5, 5])
  })

  test('a row rule reading nothing of its row keeps its field under a list or a group computed whole', () => {
    // Listed before the rule writing the whole, it ran first and was replaced: at the top level on
    // main, and in a group once the change before this edge gave it its group's place.
    for (const [schema, path] of [
      [atTop([x('2.0', 'lines[].x'), { target: 'lines', kind: 'computed', cel: '[{"qty": 3.0}]' }]), ['lines']],
      [inGroup([x('2.0'), { target: 'order.lines', kind: 'computed', cel: '[{"qty": 3.0}]' }]), ['order', 'lines']],
      [inGroup([x('2.0'), { target: 'order', kind: 'computed', cel: '{"lines": [{"qty": 3.0}]}' }]), ['order', 'lines']],
    ] as const) {
      const engine = createFormEngine({ schema, capabilities: FIXED_CLOCK })

      expect(xs(engine.value(), path)).toEqual([2])
      expect(xs(replayed(schema, engine.value()), path)).toEqual([2])
    }
  })
})

describe('required and validate rules', () => {
  test('an expression can make a field required, and the snapshot reflects it live', () => {
    const engine = engineWith()

    expect(engine.getFieldSnapshot(['reason']).required).toBe(false)
    expect(engine.validate().errors['reason']).toBeUndefined()

    engine.setValue(['vip'], true)

    expect(engine.getFieldSnapshot(['reason']).required).toBe(true)
    expect(engine.validate().errors['reason']).toEqual(['required'])
  })

  test('a validate rule contributes its code while false, alongside built-in checks', () => {
    const engine = engineWith()

    engine.setValue(['qty'], 500.0)
    expect(engine.validate().errors['qty']).toEqual(['tooMany'])

    engine.setValue(['qty'], 5.0)
    expect(engine.validate().errors['qty']).toBeUndefined()
  })
})

describe('compile-time gates', () => {
  test('a rule reading an unknown identifier fails engine construction, not the user', () => {
    const broken: FormSchema = {
      ...schema,
      logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'ghost == "x"' }] },
    }

    expect(() => createFormEngine({ schema: broken, capabilities: FIXED_CLOCK })).toThrow(/ghost/)
  })

  test('logic rules require capabilities, because now() must be injected, never ambient', () => {
    expect(() => createFormEngine({ schema })).toThrow(/capabilit/i)
  })

  test('a schema without logic needs no capabilities', () => {
    const plain: FormSchema = { ...schema }
    delete (plain as { logic?: unknown }).logic

    expect(() => createFormEngine({ schema: plain })).not.toThrow()
  })
})

/**
 * A rule can type-check at save time and still fail when it runs. `int(ref)` on
 * a text field is the realistic case: it type-checks, because int(string) is a
 * legal conversion, and it throws the moment somebody types something that is
 * not a number.
 *
 * What happens then is a safety decision, and it is deliberately asymmetric:
 * see docs/decisions/0022-fail-open-fail-closed.md. These tests exist because
 * writing that record revealed that nothing enforced it — swapping the two
 * branches would previously have broken no test at all.
 */
describe('an expression that fails at runtime', () => {
  const brittle: FormSchema = {
    specVersion: '1',
    id: 'brittle',
    title: 'Brittle',
    model: {
      fields: [
        { key: 'reference', type: 'text' },
        { key: 'shown', type: 'text' },
        { key: 'asked', type: 'text' },
        { key: 'locked', type: 'text' },
        { key: 'checked', type: 'text' },
      ],
    },
    logic: {
      rules: [
        { target: 'shown', kind: 'visible', cel: 'int(reference) > 5' },
        { target: 'asked', kind: 'required', cel: 'int(reference) > 5' },
        { target: 'locked', kind: 'disabled', cel: 'int(reference) > 5' },
        { target: 'checked', kind: 'validate', cel: 'int(reference) > 5', code: 'unproven' },
      ],
    },
  }

  const brittleEngine = (): ReturnType<typeof createFormEngine> => {
    const engine = createFormEngine({
      schema: brittle,
      capabilities: FIXED_CLOCK,
    } satisfies FormEngineOptions)
    engine.setValue(['reference'], 'not a number')
    return engine
  }

  test('the premise: the rule really does fail, rather than quietly returning false', () => {
    // Without this, every assertion below would pass for the wrong reason — an
    // expression that evaluated successfully to false looks identical to one
    // that failed open.
    const working = createFormEngine({
      schema: brittle,
      capabilities: FIXED_CLOCK,
    } satisfies FormEngineOptions)
    working.setValue(['reference'], '9')

    expect(working.getFieldSnapshot(['asked']).required).toBe(true)
    expect(brittleEngine().getFieldSnapshot(['asked']).required).toBe(false)
  })

  test('a visible rule fails OPEN, because hiding a field discards what was typed into it', () => {
    expect(brittleEngine().getFieldSnapshot(['shown']).visible).toBe(true)
  })

  test('a required rule fails OPEN, because a field nobody can satisfy blocks the form', () => {
    expect(brittleEngine().getFieldSnapshot(['asked']).required).toBe(false)
  })

  test('a disabled rule fails OPEN, because a control nobody can use blocks the form', () => {
    expect(brittleEngine().getFieldSnapshot(['locked']).disabled).toBe(false)
  })

  test('a validate rule fails CLOSED, because unchecked data in a database is not recoverable', () => {
    const engine = brittleEngine()
    const report = engine.validate()

    expect(report.valid).toBe(false)
    expect(report.errors['checked']).toEqual(['unproven'])
  })

  test('the asymmetry holds in one pass: the form is usable and the submission is refused', () => {
    const engine = brittleEngine()
    const outcome = engine.submit()

    expect(engine.getFieldSnapshot(['shown']).visible).toBe(true)
    expect(outcome.ok).toBe(false)
  })
})

/**
 * `runsOn` exists because some checks cannot run in both places. A uniqueness
 * check needs the database; a debounced hint needs the keyboard. Without a way
 * to say which, an author writes the check twice — which is the duplicated,
 * drifting logic this project exists to prevent.
 *
 * It applies to `validate` rules only. Metadata rules must run identically in
 * both places or the server's replay stops being a check at all, so the spec
 * refuses `runsOn` on anything else.
 */
describe('runsOn', () => {
  const sided: FormSchema = {
    specVersion: '1',
    id: 'sided',
    title: 'Sided',
    model: { fields: [{ key: 'email', type: 'text' }] },
    logic: {
      rules: [
        { target: 'email', kind: 'validate', cel: 'false', code: 'everywhere' },
        { target: 'email', kind: 'validate', cel: 'false', code: 'clientOnly', runsOn: 'client' },
        { target: 'email', kind: 'validate', cel: 'false', code: 'serverOnly', runsOn: 'server' },
      ],
    },
  }

  const codesIn = (mode: 'client' | 'server' | undefined): string[] => {
    const engine = createFormEngine({
      schema: sided,
      capabilities: FIXED_CLOCK,
      ...(mode === undefined ? {} : { mode }),
    } satisfies FormEngineOptions)
    return engine.validate().errors['email'] ?? []
  }

  test('an unmarked rule runs in both places', () => {
    expect(codesIn('client')).toContain('everywhere')
    expect(codesIn('server')).toContain('everywhere')
  })

  test('a client-only rule does not run on the server', () => {
    expect(codesIn('client')).toContain('clientOnly')
    expect(codesIn('server')).not.toContain('clientOnly')
  })

  test('a server-only rule does not run on the client', () => {
    expect(codesIn('server')).toContain('serverOnly')
    expect(codesIn('client')).not.toContain('serverOnly')
  })

  test('the default is the client, because that is where a form is filled in', () => {
    expect(codesIn(undefined)).toEqual(codesIn('client'))
  })
})

/**
 * A list stored as `null` reads as no rows, as an absent one does. Validation takes `null` for a
 * repeater as no rows, so an API body can send it; but only a row rule's read-back turned it into
 * `[]`, so one form answered two ways depending on whether it had a row rule.
 */
describe('a list stored as null, read by the rules', () => {
  const lines: FieldDef = {
    key: 'lines',
    type: 'repeater',
    fields: [
      { key: 'qty', type: 'number' },
      { key: 'twice', type: 'number' },
    ],
  }
  const form = (fields: FieldDef[], rules: LogicRule[]): FormSchema => ({
    specVersion: '1',
    id: 'nulls',
    title: 'Nulls',
    model: { fields },
    logic: { rules },
  })
  const rowRule: LogicRule = { target: 'lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' }
  const aggregates = (path: string): LogicRule[] => [
    { target: 'count', kind: 'computed', cel: `double(size(${path}))` },
    { target: 'gone', kind: 'visible', cel: `size(${path}) > 0` },
  ]
  const tail: FieldDef[] = [
    { key: 'count', type: 'number' },
    { key: 'gone', type: 'text' },
  ]
  const modes = ['client', 'server'] as const

  test.each(modes)('a top-level repeater stored as null counts as no rows, with or without a row rule (%s)', (mode) => {
    // Without a row rule the bag held null: `size(lines)` could not be evaluated, the visible rule
    // failed open and showed its field, and the count was never written. With a row rule the same
    // form answered 0 and hid the field, because that pass reads the list back as `[]`.
    for (const rules of [aggregates('lines'), [rowRule, ...aggregates('lines')]]) {
      const engine = createFormEngine({
        schema: form([lines, ...tail], rules),
        capabilities: FIXED_CLOCK,
        mode,
        initialValue: { lines: null, gone: 'typed' },
      })

      expect(engine.getFieldSnapshot(['count']).value).toBe(0)
      expect(engine.getFieldSnapshot(['gone']).visible).toBe(false)
    }
  })

  const order: FieldDef = {
    key: 'order',
    type: 'group',
    fields: [{ key: 'note', type: 'text' }, lines],
  }
  // The guard the guide recommends for a path inside a group.
  const guarded: LogicRule[] = [
    { target: 'count', kind: 'computed', cel: 'has(order.lines) ? double(size(order.lines)) : 0.0' },
    { target: 'gone', kind: 'visible', cel: 'has(order.lines) && size(order.lines) > 0' },
  ]
  const inGroup = (mode: 'client' | 'server', rules: LogicRule[], held: unknown) =>
    createFormEngine({
      schema: form([order, ...tail], rules),
      capabilities: FIXED_CLOCK,
      mode,
      initialValue: { order: held, gone: 'typed' },
    })
  const noteRule: LogicRule = { target: 'order.note', kind: 'computed', cel: '"n"' }
  const groupRowRule: LogicRule = { target: 'order.lines[].twice', kind: 'computed', cel: 'item.qty * 2.0' }

  test.each(modes)('inside a group, the has() guard answers for a list stored as null as for an absent one (%s)', (mode) => {
    // The guard the guide recommends for a path in a group answered for an absent list and failed
    // open for a null one: `has(order.lines)` is true for null, `size(null)` could not be
    // evaluated, the field a rule hides was shown and the count was never written.
    for (const held of [{ lines: null }, {}]) {
      const engine = inGroup(mode, guarded, held)

      expect(engine.getFieldSnapshot(['count']).value).toBe(0)
      expect(engine.getFieldSnapshot(['gone']).visible).toBe(false)
    }
  })

  test.each(modes)('inside a group, a null list still reads as no rows after a row rule or a computed write into the group (%s)', (mode) => {
    // Read back raw after a write, the group brought its null list back and every rule after it
    // failed open: inside a group the same form read two ways, by whether it had a row rule or a
    // computed rule beside the list.
    for (const rules of [
      [groupRowRule, ...guarded],
      [noteRule, ...guarded],
    ]) {
      const engine = inGroup(mode, rules, { lines: null })

      expect(engine.getFieldSnapshot(['count']).value).toBe(0)
      expect(engine.getFieldSnapshot(['gone']).visible).toBe(false)
    }
  })

  test.each(modes)('a required rule over a list stored as null asks for the answer, and refuses a body without it (%s)', (mode) => {
    // A required rule that could not be evaluated failed open: the field was not asked for and a
    // submission without it was stored, as hazard A1 has it.
    const engine = createFormEngine({
      schema: form([lines, { key: 'reason', type: 'text' }], [{ target: 'reason', kind: 'required', cel: 'size(lines) == 0' }]),
      capabilities: FIXED_CLOCK,
      mode,
      initialValue: { lines: null },
    })

    expect(engine.getFieldSnapshot(['reason']).required).toBe(true)
    expect(engine.submit()).toEqual({ ok: false, errors: { reason: ['required'] } })
  })

  test.each(modes)('a validate rule over a list stored as null is judged, not failed closed (%s)', (mode) => {
    // A validate rule that could not be evaluated failed closed, and refused a body whose list
    // holds no rows, which no limit on the rows was ever broken by.
    const engine = createFormEngine({
      schema: form([lines, { key: 'note', type: 'text' }], [{ target: 'note', kind: 'validate', cel: 'size(lines) <= 3', code: 'tooMany' }]),
      capabilities: FIXED_CLOCK,
      mode,
      initialValue: { lines: null, note: 'x' },
    })

    expect(engine.submit()).toEqual({ ok: true, errors: {} })
  })

  test.each(modes)('a skip rule over a list stored as null skips the page, so its required field is not asked for (%s)', (mode) => {
    // A skip rule that could not be evaluated did not skip, and the page nobody sees held a
    // required answer: a body that could not be accepted, without a reason anyone could act on.
    const engine = createFormEngine({
      schema: {
        ...form(
          [
            { key: 'p1', type: 'page', fields: [lines] },
            { key: 'p2', type: 'page', fields: [{ key: 'why', type: 'text', required: true }] },
          ],
          [{ target: 'p2', kind: 'skip', cel: 'size(lines) == 0' }],
        ),
        specVersion: '3',
      },
      capabilities: FIXED_CLOCK,
      mode,
      initialValue: { lines: null },
    })

    expect(engine.submit()).toEqual({ ok: true, errors: {} })
  })

  test('what was stored is not rewritten: the value still says null', () => {
    // Reading null as no rows is the bag's business. Writing `[]` back would change what a
    // stored response says, and a submission is what was sent.
    const engine = createFormEngine({
      schema: form([lines, ...tail], aggregates('lines')),
      capabilities: FIXED_CLOCK,
      initialValue: { lines: null },
    })

    expect((engine.value() as Record<string, unknown>).lines).toBeNull()
  })

  test('a repeater stored as null inside a page reads as no rows too', () => {
    // A page scopes nothing: its list sits at the top level, and a walk of the declared fields that
    // stopped at a page would leave it as null.
    const engine = createFormEngine({
      schema: form([{ key: 'p', type: 'page', fields: [lines] }, ...tail], aggregates('lines')),
      capabilities: FIXED_CLOCK,
      initialValue: { lines: null, gone: 'typed' },
    })

    expect(engine.getFieldSnapshot(['count']).value).toBe(0)
  })

  test('control: a group stored as null is refused by validation, so no rule reads it', () => {
    // Ruling: a null group is NOT read as `{}`, because validation does not take it for an empty
    // one. If this starts passing validation, the ruling is wrong and the bag must read it as `{}`.
    const engine = createFormEngine({
      schema: form(
        [{ key: 'addr', type: 'group', fields: [{ key: 'city', type: 'text' }] }, ...tail],
        [{ target: 'gone', kind: 'visible', cel: 'has(addr.city)' }],
      ),
      capabilities: FIXED_CLOCK,
      initialValue: { addr: null },
    })

    expect(engine.submit()).toEqual({ ok: false, errors: { addr: ['type'] } })
  })

  test('control: the same group stored as null is refused on the server replay too', () => {
    // The ruling rests on validation refusing it wherever it runs, and A5 says so.
    const engine = createFormEngine({
      schema: form([{ key: 'addr', type: 'group', fields: [{ key: 'city', type: 'text' }] }, ...tail], []),
      capabilities: FIXED_CLOCK,
      mode: 'server',
      initialValue: { addr: null },
    })

    expect(engine.submit()).toEqual({ ok: false, errors: { addr: ['type'] } })
  })
})
