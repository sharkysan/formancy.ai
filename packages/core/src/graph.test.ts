import { describe, expect, test } from 'vitest'
import { buildGraph, GraphCycleError } from './graph.js'

describe('buildGraph', () => {
  test('orders every dependency before its dependent', () => {
    const graph = buildGraph([
      { id: 'total', dependsOn: ['price', 'qty'] },
      { id: 'price', dependsOn: [] },
      { id: 'qty', dependsOn: [] },
      { id: 'label', dependsOn: ['total'] },
    ])

    const position = new Map(graph.order.map((id, i) => [id, i]))
    expect(position.get('price')!).toBeLessThan(position.get('total')!)
    expect(position.get('qty')!).toBeLessThan(position.get('total')!)
    expect(position.get('total')!).toBeLessThan(position.get('label')!)
  })

  test('is deterministic: the same input always yields the same order', () => {
    const nodes = [
      { id: 'c', dependsOn: ['a'] },
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ]
    expect(buildGraph(nodes).order).toEqual(buildGraph([...nodes]).order)
  })

  test('rejects a cycle with the full trace, in order, for the builder to display', () => {
    let caught: unknown
    try {
      buildGraph([
        { id: 'a', dependsOn: ['c'] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ])
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(GraphCycleError)
    const cycle = (caught as GraphCycleError).cycle
    // The trace walks the actual dependency loop and closes it.
    expect(cycle[0]).toBe(cycle[cycle.length - 1])
    expect(cycle).toHaveLength(4)
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']))
  })

  test('rejects a self-dependency as a cycle of one', () => {
    expect(() => buildGraph([{ id: 'a', dependsOn: ['a'] }])).toThrow(GraphCycleError)
  })

  test('rejects an edge to an unknown node, naming both ends', () => {
    expect(() => buildGraph([{ id: 'a', dependsOn: ['ghost'] }])).toThrow(/ghost.*a|a.*ghost/)
  })

  test('rejects duplicate node ids', () => {
    expect(() =>
      buildGraph([
        { id: 'a', dependsOn: [] },
        { id: 'a', dependsOn: [] },
      ]),
    ).toThrow(/duplicate/i)
  })
})

describe('dirtyClosure', () => {
  const graph = buildGraph([
    { id: 'price', dependsOn: [] },
    { id: 'qty', dependsOn: [] },
    { id: 'subtotal', dependsOn: ['price', 'qty'] },
    { id: 'tax', dependsOn: ['subtotal'] },
    { id: 'total', dependsOn: ['subtotal', 'tax'] },
    { id: 'unrelated', dependsOn: [] },
  ])

  test('a change dirties its transitive dependents and nothing else', () => {
    expect(graph.dirtyClosure(['price'])).toEqual(new Set(['price', 'subtotal', 'tax', 'total']))
  })

  test('a leaf change dirties only itself', () => {
    expect(graph.dirtyClosure(['unrelated'])).toEqual(new Set(['unrelated']))
  })

  test('never dirties upstream: dependencies of a changed node stay clean', () => {
    expect(graph.dirtyClosure(['tax']).has('subtotal')).toBe(false)
  })

  test('a diamond is visited once, not once per incoming edge', () => {
    // total is reachable from price via subtotal directly and via tax.
    const closure = graph.dirtyClosure(['price', 'qty'])
    expect(closure).toEqual(new Set(['price', 'qty', 'subtotal', 'tax', 'total']))
  })

  test('an unknown id throws rather than silently returning an empty closure', () => {
    expect(() => graph.dirtyClosure(['ghost'])).toThrow(/ghost/)
  })
})
