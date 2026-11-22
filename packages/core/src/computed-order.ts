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

/** One read of a rule: the model path it names, and whether it waits for every row rule it overlaps, or only for those of lists at the top level. */
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
 * **But a row rule in a repeater inside a group, reading a list inside a group or a group whole,
 * waits for no row rule of a list inside a group** — `size(order.lines)`, `order.lines[index - 1].qty`,
 * which is reported as `order.lines`, `size(order.other)`, `size(other.lines)` or `size(order)`.
 * Main's order cut such a read to a group's name, which no such row rule's node was, and ran every
 * row rule of a list inside a group after the rules on every top-level field, as the document listed
 * them. Both are kept: such a rule ranks after every top-level field, and its whole read takes the
 * rows as the order leaves them when it runs, which keeps main's place for these rules where it can
 * (`inPlace`) and is not shown to be main's order in general. That is right for a row count, the
 * row before, the last row and another list's count. For a member another row rule computes it is
 * this pass's value if that rule runs first and the pass before's otherwise, and for the rule's own
 * member always the pass before's, so it can read a computed member a pass behind where main read
 * it this pass, or this pass where main read it a pass behind: debt (0240), kept because every
 * release's code opened such a form and versions published with one are stored. A list at the top
 * level it waits for, as main did, and at the top level a row reading its own list whole is
 * refused, as it was.
 *
 * **And a rule writing inside a field another computes whole runs after it**, or the whole,
 * written later, replaces what it wrote. That edge closes no cycle the reads did not: a read
 * reaching the inner field overlaps the outer one too, its prefix, so its rule already waited for
 * the outer rule.
 *
 * A rule's place is the model's order of the top-level field it writes, a row rule of a list inside
 * a group after them all, then the document's; `inPlace` orders the rules from their places and
 * their waits, keeping a rule's place in main's order where it can. The cycle a form is refused
 * with is `buildGraph`'s, which walks the same places.
 */
export function computedOrder<T>(rules: readonly T[], computation: (rule: T) => Computation, fields: readonly string[]): T[] {
  const placed = rules
    .map((rule) => {
      const { target, references } = computation(rule)
      // A row rule of a list inside a group runs after every top-level field, as on main: its whole reads
      // wait for no row rule, so where it runs decides what they read.
      return { rule, target, references, rank: inGroupRow(segments(target)) ? fields.length : fields.indexOf(topSegment(target)) }
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
      node.reads.push({ path, rows: !wholeInGroups(path, list) })
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

  /** The fields written that the reads overlap, in the order they are read, each once; a row rule of a list inside a group only where the read waits for rows. */
  const writersOf = (reads: readonly Read[]): string[] => {
    const found = new Set<string>()
    for (const { path, rows } of reads) {
      for (const { target, written } of writtenUnder.get(path[0]) ?? []) if ((rows || !inGroupRow(written)) && overlaps(path, written)) found.add(target)
    }
    return [...found]
  }

  /** The fields written whole that a field written lies inside, all under its own top-level name, where it is too. */
  const containersOf = (written: readonly string[]): string[] =>
    writtenUnder
      .get(written[0])!
      .filter((other) => other.written.length < written.length && overlaps(other.written, written))
      .map(({ target }) => target)

  const edges = [...nodes].map(([target, { written, reads }]) => ({ id: target, dependsOn: [...new Set([...writersOf(reads), ...containersOf(written)])] }))
  const graph = buildGraph(edges) // the cycle gate: throws GraphCycleError with the trace
  const rankOf = new Map(placed.map(({ target, rank }) => [target, rank]))
  const position = new Map(inPlace(edges, graph.order, (id) => rankOf.get(id)!).map((target, index) => [target, index]))
  return placed.toSorted((a, b) => position.get(a.target)! - position.get(b.target)!).map(({ rule }) => rule)
}

/**
 * The order that keeps a rule's place in main's order where it can: Kahn's algorithm, the waiting
 * rules freed one by one, the free one with the earliest key taken first. `nodes` is in place
 * order, rank and then the document; `dependenciesFirst` is any order of them that puts what a rule
 * waits for before it, which `buildGraph` gives once it has refused a cycle.
 *
 * The force is the whole reads inside a group, which wait for no row rule of a list inside a group
 * and so read whatever the order leaves them: the order decides their value, and main's is the one
 * every version published so far was computed with. Main's depth-first order ran what a rule waits
 * for just before that rule; a rule's key is therefore the earliest place among it and the rules of
 * its own rank that wait for it, through any chain of such rules, so that what a row rule in a group
 * waits for runs where main ran it, ahead of the row rules placed between them. A rule of another
 * rank that waits for it does not pull it, so a top-level rule waiting for a row rule in a group
 * leaves that row rule among the row rules, where main ran it. Measured, this gives main's values
 * on every case the tests name but one, which it computes this pass where main was a pass behind;
 * it is not shown to equal main's order in general.
 */
function inPlace(
  nodes: ReadonlyArray<{ id: string; dependsOn: readonly string[] }>,
  dependenciesFirst: readonly string[],
  rankOf: (id: string) => number,
): string[] {
  const at = new Map(nodes.map(({ id }, index) => [id, index]))
  const waiting = nodes.map(({ dependsOn }) => dependsOn.length)
  const dependents: number[][] = nodes.map(() => [])
  nodes.forEach(({ dependsOn }, index) => {
    for (const id of dependsOn) dependents[at.get(id)!]!.push(index)
  })
  // Dependents before what they wait for, so each waiter's key is settled before it is inherited.
  const key = nodes.map((_, index) => index)
  for (const id of dependenciesFirst.toReversed()) {
    const index = at.get(id)!
    for (const dependent of dependents[index]!) if (rankOf(nodes[dependent]!.id) === rankOf(id)) key[index] = Math.min(key[index]!, key[dependent]!)
  }
  const free = new KeyQueue(key)
  waiting.forEach((count, index) => {
    if (count === 0) free.push(index)
  })
  const order: string[] = []
  for (let next = free.pop(); next !== undefined; next = free.pop()) {
    order.push(nodes[next]!.id)
    for (const dependent of dependents[next]!) if (--waiting[dependent]! === 0) free.push(dependent)
  }
  return order
}

/** The free rules by key, then by place, the least first: a binary heap of their indices. */
class KeyQueue {
  private readonly heap: number[] = []
  private readonly key: readonly number[]

  constructor(key: readonly number[]) {
    this.key = key
  }

  /** Whether the rule at index `a` comes before the one at `b`. */
  private before(a: number, b: number): boolean {
    const keyA = this.key[a]!
    const keyB = this.key[b]!
    return keyA < keyB || (keyA === keyB && a < b)
  }

  push(index: number): void {
    const heap = this.heap
    heap.push(index)
    for (let at = heap.length - 1; at > 0;) {
      const parent = (at - 1) >> 1
      if (!this.before(heap[at]!, heap[parent]!)) break
      ;[heap[parent], heap[at]] = [heap[at]!, heap[parent]!]
      at = parent
    }
  }

  pop(): number | undefined {
    const heap = this.heap
    if (heap.length <= 1) return heap.pop()
    const top = heap[0]!
    heap[0] = heap.pop()!
    for (let at = 0; ;) {
      const left = 2 * at + 1
      const right = left + 1
      let least = at
      if (left < heap.length && this.before(heap[left]!, heap[least]!)) least = left
      if (right < heap.length && this.before(heap[right]!, heap[least]!)) least = right
      if (least === at) break
      ;[heap[least], heap[at]] = [heap[at]!, heap[least]!]
      at = least
    }
    return top
  }
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
 * Whether a row rule in a repeater inside a group reads whole, never into a row — a list, a group,
 * or a field: `order.lines`, `order.other`, `other.lines` and `order` for a rule on
 * `order.lines[].x`, not `order.lines[].qty`, nor anything for one on `lines[].x`. Such a read
 * waits for no row rule of a list inside a group (`inGroupRow`); a list at the top level it still
 * waits for, as main did. `list` is the rule's repeater, undefined outside a row.
 */
function wholeInGroups(read: readonly string[], list: readonly string[] | undefined): boolean {
  return list !== undefined && list.length > 1 && !read.includes('[]')
}

/** Whether a field written is a member of the rows of a list inside a group: `order.lines[].x`, not `lines[].x`. */
function inGroupRow(written: readonly string[]): boolean {
  return written.indexOf('[]') > 1
}
