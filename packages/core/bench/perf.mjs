// Performance budgets from the design spec, made falsifiable. Runs against the
// BUILT package (dist/), so it measures what ships, not what vitest transforms.
//
//   5,000-field form, one keystroke of engine work   < 1 ms
//   5,000-node cold graph compile                    < 30 ms
import { Bench } from 'tinybench'
import { buildGraph, createValueStore } from '../dist/index.mjs'

const FIELD_COUNT = 5000

function bigForm() {
  const value = {}
  const paths = []
  for (let section = 0; section < 100; section++) {
    const sectionKey = `section${section}`
    value[sectionKey] = {}
    for (let field = 0; field < FIELD_COUNT / 100; field++) {
      value[sectionKey][`field${field}`] = 'initial'
      paths.push([sectionKey, `field${field}`])
    }
  }
  const store = createValueStore(value)
  for (const path of paths) store.subscribeField(path, () => {})
  return { store, paths }
}

function bigGraphNodes() {
  const nodes = []
  for (let i = 0; i < FIELD_COUNT; i++) {
    const dependsOn = []
    if (i % 5 === 4) dependsOn.push(`node${i - 1}`, `node${i - 2}`)
    else if (i % 7 === 6) dependsOn.push(`node${i - 3}`)
    nodes.push({ id: `node${i}`, dependsOn })
  }
  return nodes
}

const { store, paths } = bigForm()
const nodes = bigGraphNodes()
const graph = buildGraph(nodes)
let tick = 0

const bench = new Bench({ time: 500 })
bench
  .add('store: one keystroke, 5k fields + 5k subscribers', () => {
    store.set(paths[tick % paths.length], `typed${tick++}`)
  })
  .add('graph: cold compile, 5k nodes', () => {
    buildGraph(nodes)
  })
  .add('graph: dirtyClosure of one change', () => {
    graph.dirtyClosure(['node0'])
  })

await bench.run()

const BUDGETS_MS = {
  'store: one keystroke, 5k fields + 5k subscribers': 1,
  'graph: cold compile, 5k nodes': 30,
  'graph: dirtyClosure of one change': 1,
}

let failed = false
for (const task of bench.tasks) {
  const meanMs = task.result.latency.mean
  const budget = BUDGETS_MS[task.name]
  const verdict = meanMs <= budget ? 'ok    ' : 'OVER  '
  if (meanMs > budget) failed = true
  console.log(`${verdict} ${task.name}: mean ${meanMs.toFixed(4)} ms (budget ${budget} ms)`)
}
process.exit(failed ? 1 : 0)
