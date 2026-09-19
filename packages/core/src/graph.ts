/**
 * The dependency DAG.
 *
 * Node ids are engine node identities (field values, visibility rules,
 * computed values). Edges come from static extraction over expression ASTs, so
 * the whole graph is known at schema-compile time — which is what turns "this
 * form can loop" from a runtime hang into an authoring-time error the builder
 * can display, cycle trace included. A schema that fails buildGraph is never
 * persisted.
 */
export interface GraphNode {
  id: string
  dependsOn: readonly string[]
}

export interface Graph {
  /** Every dependency ordered before its dependents. Deterministic. */
  order: readonly string[]
  /** The changed nodes plus everything transitively computed from them. */
  dirtyClosure(changed: readonly string[]): Set<string>
}

export class GraphCycleError extends Error {
  readonly cycle: readonly string[]

  constructor(cycle: readonly string[]) {
    super(`Dependency cycle: ${cycle.join(' -> ')}`)
    this.name = 'GraphCycleError'
    this.cycle = cycle
  }
}

export function buildGraph(nodes: readonly GraphNode[]): Graph {
  const byId = new Map<string, GraphNode>()
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`Duplicate node id "${node.id}"`)
    byId.set(node.id, node)
  }

  /** Reverse edges, precomputed once: dirtyClosure walks these on every commit. */
  const dependents = new Map<string, string[]>()
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!byId.has(dependency)) {
        throw new Error(`Node "${node.id}" depends on unknown node "${dependency}"`)
      }
      const list = dependents.get(dependency)
      if (list) list.push(node.id)
      else dependents.set(dependency, [node.id])
    }
  }

  // Depth-first over the input order: deterministic, and the visiting stack is
  // exactly the dependency chain, so a back-edge yields the cycle verbatim.
  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const chain: string[] = []

  function visit(id: string): void {
    const seen = state.get(id)
    if (seen === 'done') return
    if (seen === 'visiting') {
      const loopStart = chain.indexOf(id)
      throw new GraphCycleError([...chain.slice(loopStart), id])
    }

    state.set(id, 'visiting')
    chain.push(id)
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency)
    chain.pop()
    state.set(id, 'done')
    order.push(id)
  }

  for (const node of nodes) visit(node.id)

  return {
    order,

    dirtyClosure(changed) {
      for (const id of changed) {
        if (!byId.has(id)) throw new Error(`Cannot dirty unknown node "${id}"`)
      }

      const dirty = new Set<string>()
      const queue = [...changed]
      while (queue.length > 0) {
        const id = queue.pop()!
        if (dirty.has(id)) continue
        dirty.add(id)
        for (const dependent of dependents.get(id) ?? []) {
          if (!dirty.has(dependent)) queue.push(dependent)
        }
      }
      return dirty
    },
  }
}
