import { buildGraph } from './graph.js'
import { topSegment } from './path.js'
import { inModel, rowScopeOf } from './row-reads.js'

/** A computed rule as the order sees it. */
export interface Computation {
  /** The field it writes, as the rule names it: `total`, `addr.zip`, `order.lines[].twice`. */
  readonly target: string
  /** What its expression reads, as `referencedPaths` reports it. */
  readonly references: readonly string[]
}

/** One read of a rule: the model path it names, and whether it waits for the row rules it overlaps. */
interface Read {
  readonly path: readonly string[]
  readonly rows: boolean
}

/**
 * The computed rules in the order one pass runs them, each after every computed rule whose field
 * it reads — or a `GraphCycleError` naming the fields, when some of them read each other.
 *
 * **Apart from the engine** because what a computed rule depends on is a reason to change of its
 * own, separate from evaluating one: it changed when a dependency became a field rather than its
 * top-level name (0240), and nothing in the pass did. Only computed rules write, so only they can
 * loop and only they are ordered here; every other kind runs after them all and reads the result.
 *
 * **A rule's node is its target as written, and a read is the field the reference names**, every
 * index one `[]`: `order.lines[0].twice` reads `order.lines[].twice`. A row's reads are resolved
 * by `inModel`, as the checks of an unknown path and of a temporal literal resolve them, so
 * `item.qty` is `order.lines[].qty` to all three; in a row, `index` reads nothing.
 *
 * **A rule depends on every computed rule whose field overlaps one of its reads** — one path is
 * the other or lies inside it. So `size(order.lines)` reads every row rule of the list, the whole
 * `item` every member of its row, and a computed index such as `lines[i]`, which `referencedPaths`
 * reports as the whole list, every row rule too. Conservative on purpose: a missed dependency is
 * a stale value, an extra one at most a form refused as a cycle that would not have looped.
 *
 * **But a row rule in a repeater inside a group, reading its own list or a group holding it
 * whole, waits for no row rule** — `size(order.lines)`, `order.lines[index - 1].qty`, which is
 * reported as `order.lines`, or `size(order)`. Main's order cut such a read to the group's name,
 * which no row rule's node was, so it read the rows as the pass had left them when it ran: right
 * for a row count, the row before and the last row, a pass behind for a running total down the
 * rows. Every release's code opened such a form and versions published with one are stored, so
 * the split is kept rather than made a cycle (0240); the running total is debt. At the top level
 * the same read was refused, and still is.
 *
 * **And a rule writing inside a field another computes whole runs after it**, or the whole,
 * written later, replaces what it wrote. That edge closes no cycle the reads did not: a read
 * reaching the inner field overlaps the outer one too, its prefix, so its rule already waited for
 * the outer rule.
 *
 * Rules that nothing orders run by the model's order of the top-level field they write, then as
 * the document lists them, which is also where the cycle a form is refused with starts.
 */
export function computedOrder<T>(rules: readonly T[], computation: (rule: T) => Computation, fields: readonly string[]): T[] {
  const placed = rules
    .map((rule) => {
      const { target, references } = computation(rule)
      return { rule, target, references, rank: fields.indexOf(topSegment(target)) }
    })
    .sort((a, b) => a.rank - b.rank)

  // One node per field written. Two rules on one target, which validation refuses, share it and
  // keep the document's order, as they did when every rule on a top-level field shared one.
  const nodes = new Map<string, { written: readonly string[]; reads: Read[] }>()
  for (const { target, references } of placed) {
    const node = nodes.get(target) ?? { written: segments(target), reads: [] }
    const scope = rowScopeOf(target)
    const list = scope === undefined ? undefined : segments(scope.slice(0, -'[]'.length))
    for (const reference of references) {
      if (scope !== undefined && reference === 'index') continue
      const path = segments(inModel(reference, scope))
      node.reads.push({ path, rows: !ownListWhole(path, list) })
    }
    nodes.set(target, node)
  }

  // Two paths overlap only under one top-level field, so a read is held against the fields
  // written under its own, and a form of top-level fields is not compared rule by rule.
  const writtenUnder = new Map<string | undefined, Array<{ target: string; written: readonly string[] }>>()
  for (const [target, { written }] of nodes) {
    const under = writtenUnder.get(written[0])
    if (under === undefined) writtenUnder.set(written[0], [{ target, written }])
    else under.push({ target, written })
  }

  /** The fields written that the reads overlap, in the order they are read, each once, a row rule's only where the read waits for rows. */
  const writersOf = (reads: readonly Read[]): string[] => {
    const found = new Set<string>()
    for (const { path, rows } of reads) {
      for (const { target, written } of writtenUnder.get(path[0]) ?? []) if ((rows || !written.includes('[]')) && overlaps(path, written)) found.add(target)
    }
    return [...found]
  }

  /** The fields written whole that a field written lies inside, all under its own top-level name, where it is too. */
  const containersOf = (written: readonly string[]): string[] =>
    writtenUnder
      .get(written[0])!
      .filter((other) => other.written.length < written.length && overlaps(other.written, written))
      .map(({ target }) => target)

  const graph = buildGraph(
    [...nodes].map(([target, { written, reads }]) => ({ id: target, dependsOn: [...new Set([...writersOf(reads), ...containersOf(written)])] })),
  )
  const position = new Map(graph.order.map((target, index) => [target, index]))
  return placed.toSorted((a, b) => position.get(a.target)! - position.get(b.target)!).map(({ rule }) => rule)
}

/** One key, after a dot unless it is the first, or one `[]`, exactly where the last one ended. */
const SEGMENT = /(?:^|\.)([A-Za-z_]\w*)|\[\]/y

/**
 * A path's segments: `order.lines[].twice` is `order`, `lines`, `[]`, `twice`. A key is an
 * identifier, so a read going on past the keys and indices — a quoted key such as `a["b.c"]`,
 * which `referencedPaths` reports for a name that is not one — names no field below them, and is
 * cut there, to the part a field can be inside, which over-reports rather than under.
 */
function segments(path: string): readonly string[] {
  const found: string[] = []
  SEGMENT.lastIndex = 0
  for (let match = SEGMENT.exec(path); match !== null; match = SEGMENT.exec(path)) found.push(match[1] ?? match[0])
  return found
}

/** Whether one path is the other or lies inside it: `order.lines` and `order.lines[].twice` do, `order.note` does not. */
function overlaps(a: readonly string[], b: readonly string[]): boolean {
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return false
  return true
}

/**
 * Whether a row rule's read is its own list whole, or a group holding it, with the list inside a
 * group: `order.lines` and `order` for a rule on `order.lines[].x`, never `lines` for one on
 * `lines[].x`. `list` is the rule's repeater, undefined for a rule outside a row.
 */
function ownListWhole(read: readonly string[], list: readonly string[] | undefined): boolean {
  return list !== undefined && list.length > 1 && read.length <= list.length && overlaps(read, list)
}
