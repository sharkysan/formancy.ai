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
 * Rules that do not read each other run by the model's order of the top-level field they write,
 * then as the document lists them — the order they had when the node was that field — which is
 * also where the cycle a form is refused with starts.
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
  const nodes = new Map<string, { written: readonly string[]; reads: Array<readonly string[]> }>()
  for (const { target, references } of placed) {
    const node = nodes.get(target) ?? { written: segments(target), reads: [] }
    const scope = rowScopeOf(target)
    for (const reference of references) if (scope === undefined || reference !== 'index') node.reads.push(segments(inModel(reference, scope)))
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

  /** The fields written that the reads overlap, in the order they are read, each once. */
  const writersOf = (reads: ReadonlyArray<readonly string[]>): string[] => {
    const found = new Set<string>()
    for (const read of reads) for (const { target, written } of writtenUnder.get(read[0]) ?? []) if (overlaps(read, written)) found.add(target)
    return [...found]
  }

  const graph = buildGraph([...nodes].map(([target, { reads }]) => ({ id: target, dependsOn: writersOf(reads) })))
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
