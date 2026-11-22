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
    // Defence in depth for a spelling `referencedPaths` keeps as written: a quoted key that is not
    // an identifier names no field, so `a["b.c"].d` cannot read `a.x`, and cut to `a` the read
    // over-reports. What this guards is the cut itself: a global pattern instead of a sticky one
    // resumes after the quotes, reads `a.d`, and fails this case alone.
    const total = rule('total', 'a["b.c"].d')
    const x = rule('a.x', '1.0')

    expect(ordered([total, x], ['total', 'a'])).toEqual(['a.x', 'total'])
  })

  test('a key held in a variable reads the whole group, and runs after every field computed in it', () => {
    // `addr[k]` is the member whose key `k` holds, which nothing knows before the pass, so it is
    // reported as `addr` and `k`; read as only `k`, it would run before the zip it may name.
    const picked = rule('picked', 'addr[k]')
    const zip = rule('addr.zip', '"3000"')

    expect(ordered([picked, zip], ['picked', 'addr', 'k'])).toEqual(['addr.zip', 'picked'])
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

describe('a computed rule writing inside a field another computes whole runs after it', () => {
  // The rule writing the whole replaces what is inside it, so run after it the inner rule's field
  // stays empty. Reading nothing of the rows, nothing else orders the two.
  test('a row rule reading nothing of its row, at the top level', () => {
    // Main left the field empty in both orders, the change before this edge in one.
    const x = rule('lines[].x', '2.0')
    const lines = rule('lines', '[{"qty": 3.0}]')

    expect(ordered([x, lines], ['lines'])).toEqual(['lines', 'lines[].x'])
    expect(ordered([lines, x], ['lines'])).toEqual(['lines', 'lines[].x'])
  })

  test('the same in a group, under the list or the group computed whole', () => {
    // Main kept the field, because a row rule in a group ran after every top-level field; the
    // change before this edge gave the row rule its group's place, and the field was replaced.
    const x = rule('order.lines[].x', '2.0')

    expect(ordered([x, rule('order.lines', '[{"qty": 3.0}]')], ['order'])).toEqual(['order.lines', 'order.lines[].x'])
    expect(ordered([x, rule('order', '{"lines": [{"qty": 3.0}]}')], ['order'])).toEqual(['order', 'order.lines[].x'])
  })

  test('a row rule reading only a field outside its rows, in a group', () => {
    // Its read orders it after `first` and nothing else; the edge orders it after the list.
    const x = rule('order.lines[].x', 'first * 1.0')

    expect(ordered([x, rule('order.lines', '[{"qty": 3.0}]')], ['order', 'first'])).toEqual(['order.lines', 'order.lines[].x'])
  })
})

/*
 * Main's order cut a read to its top-level name, and the edge that ordered a list's readers after
 * its rows led from the list's own path, which no read inside a group was cut to. So a row rule in
 * a repeater inside a group could read a list or a group inside any group whole, and depended on
 * none of their rows: a row count, the row before, the last row, another list's count. That is
 * kept, on purpose (0240).
 */
describe('a row rule in a repeater inside a group reading a list or a group inside a group, whole', () => {
  const rows = (cel: string): Computation[] => [rule('order.lines[].x', cel)]

  test('is accepted, as main accepted it, for a row count, the row before, the last row and the group', () => {
    // Each computed what it should in the browser and on the replay, and a version published with
    // one would no longer open were it refused, as its read of its own row makes the field order.
    for (const cel of [
      'double(size(order.lines))',
      'index == 0 ? 0.0 : order.lines[index - 1].qty * 1.0',
      'index == size(order.lines) - 1 ? 1.0 : 0.0',
      'double(size(order))',
      'double(order.lines.filter(l, l.qty > 1.0).size())',
    ]) {
      expect(cycle(rows(cel), ['order']), cel).toBeUndefined()
    }
  })

  test('is accepted for a running total down the rows too, which stays a pass behind: debt', () => {
    // Refusing it would retire a version main published; ordering it cannot make it right. The
    // documents call it debt (0240, A5), and this case fails the day that changes.
    expect(cycle(rows('index == 0 ? item.qty * 1.0 : order.lines[index - 1].x + item.qty'), ['order'])).toBeUndefined()
  })

  test('depends on no row rule, of its own list or of another list in the group', () => {
    // Two lists each reading the group whole would read each other's rows and be one loop.
    const x = rule('order.lines[].x', 'double(size(order))')
    const y = rule('order.other[].y', 'double(size(order))')

    expect(cycle([x, y], ['order'])).toBeUndefined()
    expect(ordered([x, rule('order.lines[].qty', '1.0')], ['order'])).toEqual(['order.lines[].x', 'order.lines[].qty'])
  })

  test('is accepted for two lists of the group each reading the other whole, as main accepted it', () => {
    // Refused as `order.lines[].x -> order.other[].y -> order.lines[].x` by the first ruling, which
    // kept only a row's read of its own list: main opened it, and counting each other it computed
    // right. Read whole, the other list's rows are taken as the pass left them, which for a member
    // the other list computes is the pass before's, as on main: debt beside the running total.
    const x = rule('order.lines[].x', 'double(size(order.other))')
    const y = rule('order.other[].y', 'double(size(order.lines))')
    expect(cycle([x, y], ['order'])).toBeUndefined()

    const counted = rule('order.lines[].x', 'double(order.other.filter(o, o.y > 2.0).size())')
    expect(ordered([counted, rule('order.other[].y', 'item.qty * 2.0')], ['order'])).toEqual(['order.lines[].x', 'order.other[].y'])
  })

  test('a member of another row, or a list at the top level, is read as a field and waits for its row rule', () => {
    // Only a whole read of what lies inside a group is kept as main had it. `order.other[0].y`
    // reaches into a row, which main did not order, cut to the group's name, so it read what the
    // other list wrote the pass before; `items` is a list at the top level, whose rows main
    // ordered before every reader of it, and still does.
    const y = rule('order.other[].y', 'item.qty * 2.0')
    expect(ordered([rule('order.lines[].x', 'order.other[0].y * 1.0'), y], ['order'])).toEqual(['order.other[].y', 'order.lines[].x'])
    const z = rule('items[].z', 'item.qty * 2.0')
    expect(ordered([rule('order.lines[].x', 'double(size(items))'), z], ['order', 'items'])).toEqual(['items[].z', 'order.lines[].x'])
  })

  test('runs where main ran a row rule in a group: after every top-level field, then as the document lists them', () => {
    // The whole read waits for none of the rows, so where it runs decides what it reads. Ranked at
    // its group's place instead, a reader in `order` ran before a writer in `other` listed ahead
    // of it, read the pass before's value, and the replay stored none, where main had it right.
    const writer = rule('other.lines[].y', 'item.qty * 2.0')
    const reader = rule('order.lines[].x', 'double(other.lines.filter(o, o.y > 2.0).size())')
    const total = rule('total', '1.0')

    expect(ordered([writer, reader, total], ['order', 'other', 'total'])).toEqual(['total', 'other.lines[].y', 'order.lines[].x'])
    expect(ordered([reader, writer, total], ['order', 'other', 'total'])).toEqual(['total', 'order.lines[].x', 'other.lines[].y'])
  })

  test('is accepted for lists of two groups each reading the other whole, as main accepted them', () => {
    // Refused as `order.lines[].x -> other.lines[].y -> order.lines[].x` by the second ruling, which
    // kept only a read of the rule's own group; main opened it, counting each other it computed
    // right, and a count of the other's computed members is the pass before's, as on main: debt.
    const x = rule('order.lines[].x', 'double(size(other.lines))')
    const y = rule('other.lines[].y', 'double(size(order.lines))')
    expect(cycle([x, y], ['order', 'other'])).toBeUndefined()

    const counted = rule('order.lines[].x', 'double(other.lines.filter(o, o.y > 2.0).size())')
    expect(ordered([counted, rule('other.lines[].y', 'item.qty * 2.0')], ['order', 'other'])).toEqual(['order.lines[].x', 'other.lines[].y'])
  })

  test('and still runs after a field computed into what it reads', () => {
    // `size(order)` counts the note, which a rule writes; read before it, the count is short.
    const x = rule('order.lines[].x', 'double(size(order))')
    const note = rule('order.note', '"n"')

    expect(ordered([x, note], ['order'])).toEqual(['order.note', 'order.lines[].x'])
  })

  test('control: at the top level the same reads are refused, as they always were', () => {
    // Passed before the change as after, on the cycle's wording aside: a top-level list's rows are
    // ordered before its readers, its own row rules included. `concepts/logic.md` says so.
    for (const cel of [
      'double(size(lines))',
      'index == 0 ? 0.0 : lines[index - 1].qty * 1.0',
      'index == size(lines) - 1 ? 1.0 : 0.0',
      'index == 0 ? item.qty * 1.0 : lines[index - 1].x + item.qty',
    ]) {
      expect(cycle([rule('lines[].x', cel)], ['lines']), cel).toEqual(['lines[].x', 'lines[].x'])
    }
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

  test('loops that reach into a row, or read a list or a group across levels whole, which were accepted', () => {
    // Each read waits for the rule writing the field it names, and main's top-level names hid each
    // loop. Two lists of one group by position; a top-level row and a row in a group by position;
    // a row in a group reading a top-level list whole that its row reads back; a top-level row
    // reading a group whole whose list reads the top-level list back. The last is the same rule as
    // a field outside the rows waiting for them: a top-level row is outside a group's rows.
    const loops: Array<[Computation[], string[], string[]]> = [
      [
        [rule('order.lines[].x', 'order.other[0].y + 1.0'), rule('order.other[].y', 'order.lines[0].x + 1.0')],
        ['order'],
        ['order.lines[].x', 'order.other[].y', 'order.lines[].x'],
      ],
      [
        [rule('lines[].y', 'order.lines[0].x + 1.0'), rule('order.lines[].x', 'lines[0].y + 1.0')],
        ['lines', 'order'],
        ['lines[].y', 'order.lines[].x', 'lines[].y'],
      ],
      [
        [rule('order.lines[].x', 'double(lines.filter(l, l.y > 0.0).size())'), rule('lines[].y', 'order.lines[0].x + 1.0')],
        ['lines', 'order'],
        ['lines[].y', 'order.lines[].x', 'lines[].y'],
      ],
      [
        [rule('lines[].y', 'double(size(g))'), rule('g.other[].x', 'double(size(lines))')],
        ['lines', 'g'],
        ['lines[].y', 'g.other[].x', 'lines[].y'],
      ],
    ]
    for (const [rules, fields, loop] of loops) expect(cycle(rules, fields)).toEqual(loop)
  })

  test('a loop through a group inside a top-level row, which was accepted', () => {
    // Main resolved `item.sub` to a node of that exact name, which `lines[].sub.z` was not; at field
    // granularity the whole sub-group holds the member, so both are loops, as everywhere else.
    expect(cycle([rule('lines[].sub.z', 'double(size(item.sub))')], ['lines'])).toEqual(['lines[].sub.z', 'lines[].sub.z'])
    const x = rule('lines[].x', 'double(size(item.sub))')
    expect(cycle([x, rule('lines[].sub.z', 'item.x * 2.0')], ['lines'])).toEqual(['lines[].x', 'lines[].sub.z', 'lines[].x'])
  })

  test('a loop through a row rule in a repeater inside a group, which was accepted', () => {
    // The read of the rows was cut to `order`, which no edge led from, so the loop was not seen:
    // the form was accepted, and opened with a row in it, neither field was computed. The same
    // loop at the top level was refused.
    const twice = rule('order.lines[].twice', 'item.qty * 2.0 + first')
    const first = rule('first', 'size(order.lines) == 0 ? 1.0 : order.lines[0].twice')

    expect(cycle([twice, first], ['order', 'first'])).toEqual(['first', 'order.lines[].twice', 'first'])
  })

  test('the other loops through a repeater inside a group main did not see, refused as at the top level', () => {
    // Each was accepted on main and is refused at the top level. A count computed from the list
    // and read back in its rows computed right there, and reading `size(order.lines)` in the row
    // itself is its rewrite; a row reading another row's member by position showed values the
    // replay did not store.
    const count = rule('count', 'double(size(order.lines))')
    expect(cycle([rule('order.lines[].x', 'count'), count], ['order', 'count'])).toEqual(['count', 'order.lines[].x', 'count'])
    expect(cycle([rule('order.lines[].x', 'index == 0 ? 1.0 : order.lines[0].x + 1.0')], ['order'])).toEqual(['order.lines[].x', 'order.lines[].x'])
  })
})

describe('a top-level row reading another row of its list by position', () => {
  test('is accepted, and waits for the member it reads, where main refused it as the list', () => {
    // Main cut `lines[0].qty` to `lines`, whose node every row rule of the list fed, so it refused
    // them as `lines -> lines[].x -> lines` and `lines -> lines[].y -> lines`. Read as the field it
    // names, neither is a loop.
    expect(cycle([rule('lines[].x', 'lines[0].qty * 1.0')], ['lines'])).toBeUndefined()
    const y = rule('lines[].y', 'lines[0].x + 1.0')
    expect(ordered([y, rule('lines[].x', 'item.qty * 2.0')], ['lines'])).toEqual(['lines[].x', 'lines[].y'])
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
