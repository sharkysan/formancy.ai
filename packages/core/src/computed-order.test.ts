import { describe, expect, test } from 'vitest'
import { parse, referencedPaths } from '@formancy/expressions'
import { computedOrder } from './computed-order.js'
import type { Computation } from './computed-order.js'
import { GraphCycleError } from './graph.js'

/**
 * A computed rule as the engine hands it over: its target as written and what its expression
 * reads, asked of `referencedPaths` rather than typed here, so no case can assume a spelling of
 * a read that the expressions package does not produce.
 */
function rule(target: string, cel: string): Computation {
  const parsed = parse(cel)
  if (!parsed.ok) throw new Error(`${cel} does not parse`)
  return { target, references: referencedPaths(parsed.ast) }
}

/** The targets in the order one pass runs them. */
function ordered(rules: readonly Computation[], fields: readonly string[]): string[] {
  return computedOrder(rules, (computation) => computation, fields).map(({ target }) => target)
}

/** The cycle the order is refused with, or undefined when it is not refused. */
function cycle(rules: readonly Computation[], fields: readonly string[]): readonly string[] | undefined {
  try {
    computedOrder(rules, (computation) => computation, fields)
    return undefined
  } catch (error) {
    if (error instanceof GraphCycleError) return error.cycle
    throw error
  }
}

describe('a computed rule runs after every computed rule whose field it reads', () => {
  test('a reader of a row member in a repeater inside a group runs after the row rule', () => {
    // The row rule's node was the repeater, `order.lines`, and a read of `order.lines[0].twice`
    // was cut to `order`, so nothing ordered the two: `first` ran first and read the rows as the
    // pass before had left them, one change behind what the rows showed.
    const twice = rule('order.lines[].twice', 'item.qty * 2.0')
    const first = rule('first', 'size(order.lines) == 0 ? 0.0 : order.lines[0].twice')

    expect(ordered([twice, first], ['order', 'first'])).toEqual(['order.lines[].twice', 'first'])
    expect(ordered([first, twice], ['first', 'order'])).toEqual(['order.lines[].twice', 'first'])
  })

  test('an aggregate over the rows runs after every row rule, as an index computed at run time does', () => {
    // `size(order.lines)` and `order.lines[int(n)]` both read the whole list, the second because
    // its index is not known before the pass, which is the conservative reading of it.
    const twice = rule('order.lines[].twice', 'item.qty * 2.0')
    const count = rule('count', 'double(size(order.lines))')
    const picked = rule('picked', 'order.lines[int(n)].twice')

    expect(ordered([count, picked, twice], ['count', 'picked', 'n', 'order'])).toEqual(['order.lines[].twice', 'count', 'picked'])
  })

  test('a computed field in a group may read another field of the same group', () => {
    // Both the write and the read were the group's node, so the form was refused as
    // "addr -> addr" though nothing in it loops. `has()` on a sibling reads the sibling too.
    expect(cycle([rule('addr.label', '"in " + addr.city')], ['addr'])).toBeUndefined()
    expect(cycle([rule('addr.label', 'has(addr.city) ? addr.city : ""')], ['addr'])).toBeUndefined()
  })

  test('two computed fields of one group run in the order one reads the other', () => {
    // As one node they could not be ordered at all, and were refused as a cycle.
    const label = rule('addr.label', '"PLZ " + addr.zip')
    const zip = rule('addr.zip', '"3000"')

    expect(ordered([label, zip], ['addr'])).toEqual(['addr.zip', 'addr.label'])
  })

  test('a row rule reading the group its repeater is in runs beside the row rule it reads, not after them all', () => {
    // The form of #355 with an aggregate added. Ordering the group after its rows would have made
    // `order.lines[].label`, which reads `order.note`, depend on itself.
    const twice = rule('order.lines[].twice', 'item.qty * 2.0')
    const label = rule('order.lines[].label', 'order.note + " " + string(item.twice)')
    const first = rule('first', 'size(order.lines) == 0 ? 0.0 : order.lines[0].twice')

    expect(ordered([twice, label, first], ['order', 'first'])).toEqual(['order.lines[].twice', 'order.lines[].label', 'first'])
  })

  test('a row rule on a list another rule computes whole runs after it, since it reads the rows', () => {
    // At the top level the list's own node was the one the row rules ran before, so the list
    // written whole replaced what the row rule had just written, and its field stayed empty.
    const twice = rule('lines[].twice', 'item.qty * 2.0')
    const lines = rule('lines', '[{"qty": 3.0}]')

    expect(ordered([twice, lines], ['lines'])).toEqual(['lines', 'lines[].twice'])
  })

  test('a read is cut where it stops being keys and indices, and not resumed past it', () => {
    // A quoted key that is not an identifier names no field. Cut there the read is `a`, which
    // over-reports; resumed after the quotes it would be `a.d`, and miss the field computed in `a`.
    const total = rule('total', 'a["b.c"].d')
    const x = rule('a.x', '1.0')

    expect(ordered([total, x], ['total', 'a'])).toEqual(['a.x', 'total'])
  })

  test('control: inside a row, `item.qty` reads the row member and `index` reads nothing', () => {
    // Passed before the change as after. The row-relative reads keep their meaning: `item.qty` is
    // `items[].qty` in this row, and `index` the row's position, not a field called `index`,
    // which the engine refuses beside a row rule and this order does not have to know about.
    const total = rule('items[].total', 'item.qty * double(index)')
    const qty = rule('items[].qty', '1.0')
    const index = rule('index', '2.0')

    expect(ordered([total, qty, index], ['items', 'index'])).toEqual(['items[].qty', 'items[].total', 'index'])
    // Outside a row there is no row, and `index` is a field like any other.
    expect(ordered([rule('label', 'string(index)'), index], ['label', 'index'])).toEqual(['index', 'label'])
  })
})

describe('what is still refused as a cycle, named by the fields in it', () => {
  test('two fields computed from each other, at the top level', () => {
    // Passed before the change as after: a top-level target's field is its top-level name.
    expect(cycle([rule('price', 'qty * 1.0'), rule('qty', 'price * 1.0')], ['price', 'qty'])).toEqual(['price', 'qty', 'price'])
  })

  test('a row rule reading its own repeater whole, its own row included', () => {
    // A running total down the rows reads every row, so the rule reads what it writes.
    expect(cycle([rule('fees[].x', 'double(size(fees))')], ['fees'])).toEqual(['fees[].x', 'fees[].x'])
    expect(cycle([rule('fees[].x', 'index == 0 ? 0.0 : fees[index - 1].x + 1.0')], ['fees'])).toEqual(['fees[].x', 'fees[].x'])
  })

  test('a computed row member reading its whole row', () => {
    // Passed before the change as after. The whole `item` holds the member being computed.
    expect(cycle([rule('fees[].x', 'double(size(item))')], ['fees'])).toEqual(['fees[].x', 'fees[].x'])
  })

  test('a computed member of a group reading the group whole', () => {
    // `size(addr)` reads every field of the group, the one being computed among them.
    expect(cycle([rule('addr.label', 'string(size(addr))')], ['addr'])).toEqual(['addr.label', 'addr.label'])
  })

  test('a row rule reading the aggregate that reads the rows', () => {
    // The aggregate reads the list, which holds the rule's own member.
    expect(cycle([rule('items[].line', 'grand * 1.0'), rule('grand', 'double(size(items))')], ['items', 'grand'])).toEqual([
      'items[].line',
      'grand',
      'items[].line',
    ])
  })

  test('a loop through a row rule in a repeater inside a group, which was accepted', () => {
    // The read of the rows was cut to `order`, which no edge led from, so the loop was not seen:
    // the form was accepted, and opened with a row in it, neither field was computed. The same
    // loop at the top level was refused.
    const twice = rule('order.lines[].twice', 'item.qty * 2.0 + first')
    const first = rule('first', 'size(order.lines) == 0 ? 1.0 : order.lines[0].twice')

    expect(cycle([twice, first], ['order', 'first'])).toEqual(['order.lines[].twice', 'first', 'order.lines[].twice'])
  })
})

describe('the order among rules that do not read each other', () => {
  test('control: by the model order of the field they write, then as the document lists them', () => {
    // Passed before the change as after. Nothing a value depends on, but the cycle a form is
    // refused with starts where this order reaches it first, and it is the one the builder shows.
    const rules = [rule('b', '1.0'), rule('g.y', '1.0'), rule('a', '1.0'), rule('g.x', '1.0')]

    expect(ordered(rules, ['a', 'g', 'b'])).toEqual(['a', 'g.y', 'g.x', 'b'])
  })

  test('control: two rules on one target, which validation refuses, order as one field rather than fail', () => {
    // Passed before the change as after. An engine handed a document no validator saw kept both,
    // in the document's order and after what either reads. A node per rule is refused by the
    // graph as a duplicate, and a node keeping only the last rule's reads runs the first too soon.
    const rules = [rule('total', 'subtotal * 1.1'), rule('subtotal', '1.0'), rule('total', '2.0')]

    expect(computedOrder(rules, (computation) => computation, ['total', 'subtotal'])).toEqual([rules[1], rules[0], rules[2]])
  })
})
