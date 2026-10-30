import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { acceptRemoteAnswer, capRemoteAnswer } from '@formancy/spec'
import type { RemoteCompleteness } from '@formancy/spec'
import type { OptionsRequest } from '@formancy/react'
import { DEMO_OPTIONS_SOURCES, PICKUP_POINTS } from './demo-capabilities.js'

/**
 * The playground's options source answers the way a database would (0177).
 *
 * `pickup-points` is what a visitor opens to see what a list from a source does, and the
 * thing it exists to show is a list that is not all there: one page of a longer list, and a
 * row the source matched and cannot hand over. A source that answered every row as an array
 * would still render, still narrow, and show a total nobody would have counted — the
 * behaviour this change replaces, demonstrated as if it were the feature. Only the source's
 * answer can say which it is, so this reads the answer through the same two functions both
 * renderers read it through, not the screen.
 */
const source = DEMO_OPTIONS_SOURCES['pickup-points']!
const SHOWN = source.maxRows!

/** What the control would say about a search for `query`, decided as both renderers decide it. */
async function searchFor(query: string): Promise<{ values: string[]; completeness: RemoteCompleteness }> {
  const request: OptionsRequest = {
    kind: 'search',
    source: 'pickup-points',
    path: 'deliveryPoint',
    query,
    values: [],
    locale: 'en',
    limit: SHOWN,
    signal: new AbortController().signal,
  }
  const answering = source.resolve(request)
  // The stand-in waits a quarter of a second on purpose, for the busy state; not here.
  await vi.runAllTimersAsync()
  const accepted = acceptRemoteAnswer(await answering)
  // A refused answer is a source that failed, and a demo that fails is no demonstration.
  expect(accepted, `the answer for "${query}" was refused`).toBeDefined()
  const { shown, completeness } = capRemoteAnswer(accepted!, SHOWN)
  return { values: shown.map((row) => row.value), completeness }
}

describe('the playground’s list from a source', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('opened, shows one page and says there are more, with no total', async () => {
    // The first thing a visitor sees on opening the field, *Where to collect it*. Answered as a
    // list of every point, this was "the first 6 of 10" — a count a paging source never has.
    const { values, completeness } = await searchFor('')
    expect(values).toHaveLength(SHOWN)
    expect(completeness).toEqual({ kind: 'more', shown: SHOWN })
  })

  test('narrowed until nothing is left out, says nothing', async () => {
    // Typing narrows the page to silence: success announces nothing, so a demo that still
    // spoke here would be showing a status at rest.
    const { values, completeness } = await searchFor('zür')
    expect(values).toEqual(PICKUP_POINTS.filter((point) => point.label.startsWith('Zürich')).map((point) => point.value))
    expect(completeness).toEqual({ kind: 'complete' })
  })

  test('matches a point it cannot offer, and counts it rather than hiding it', async () => {
    // A point with no code yet cannot be stored, so the source withholds it — and says so,
    // or the visitor reads "no such point" for a point that exists.
    const { values, completeness } = await searchFor('chur')
    expect(values).toEqual([])
    expect(completeness).toEqual({ kind: 'withheld', withheld: 1 })
  })

  test('names a point the form already holds, so a stored answer is not a bare code', async () => {
    // A field a rule disables asks only for this, so an answer the controls refused here would
    // leave every read-only delivery point showing `p3` where the visitor chose Bern.
    const bern = PICKUP_POINTS.find((point) => point.label === 'Bern Bahnhof')!
    const naming = source.resolve({
      kind: 'labels',
      source: 'pickup-points',
      path: 'deliveryPoint',
      query: '',
      values: [bern.value],
      locale: 'en',
      limit: 1,
      signal: new AbortController().signal,
    })
    await vi.runAllTimersAsync()
    expect(acceptRemoteAnswer(await naming)?.options).toEqual([bern])
  })

  test('stops when its answer stops being wanted, as a host’s source should', async () => {
    // The demo is what a host copies. One that ignored the signal would still look right on
    // screen — the control drops a stale answer — and teach every copy to keep a database
    // reading for a keystroke nobody is waiting on.
    const stop = new AbortController()
    const answering = source.resolve({
      kind: 'search',
      source: 'pickup-points',
      path: 'deliveryPoint',
      query: '',
      values: [],
      locale: 'en',
      limit: SHOWN,
      signal: stop.signal,
    })
    stop.abort()
    await expect(answering).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })

  test('and never offers that point, so nothing it shows is a value the form cannot hold', async () => {
    // The withheld point is matched by a broader search too, and must not leak into the
    // rows there, where choosing it would store a value no deployment list confirms.
    const { values, completeness } = await searchFor('bahnhof')
    const offered = new Set(PICKUP_POINTS.map((point) => point.value))
    expect(values.every((value) => offered.has(value))).toBe(true)
    expect(completeness).toEqual({ kind: 'withheld', withheld: 1 })
  })
})
