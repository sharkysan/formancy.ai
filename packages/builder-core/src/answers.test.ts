import { describe, expect, test, vi } from 'vitest'
import { createStop, readAnswer } from './answers.js'

/**
 * The stop a person presses, as a run sees it.
 *
 * A callback rather than an `AbortSignal`, because this package compiles against
 * the language alone and has no DOM types — `@formancy/core`'s uploads made the
 * same choice. A host turns it into a signal in one line.
 */
describe('a stop', () => {
  test('tells each listener once, however often it is pressed', () => {
    // A double click on Stop would otherwise abort a host's request twice, and a
    // host's cleanup is rarely written to run twice.
    const stop = createStop()
    const heard = vi.fn()
    stop.onStop(heard)

    stop.stop()
    stop.stop()

    expect(stop.stopped).toBe(true)
    expect(heard).toHaveBeenCalledTimes(1)
  })

  test('tells a listener added after it was pressed at once', () => {
    // Otherwise a turn begun a moment after the stop would wait for ever.
    const stop = createStop()
    stop.stop()
    const heard = vi.fn()

    stop.onStop(heard)

    expect(heard).toHaveBeenCalledTimes(1)
  })

  test('tells a listener that has gone nothing', () => {
    // A turn that answered stops listening, so a stop pressed later does not
    // cancel a request that has already finished.
    const stop = createStop()
    const heard = vi.fn()
    const forget = stop.onStop(heard)

    forget()
    stop.stop()

    expect(heard).not.toHaveBeenCalled()
  })
})

/**
 * Reading what a model, or a person pasting for one, handed back.
 *
 * The relay puts a paste straight into this reader, so its cost is the page's to pay:
 * a pattern that backtracks quadratically hangs the tab on a long paste that opens a
 * code fence and never closes it — CodeQL's js/polynomial-redos on the fence pattern.
 */
describe('reading an answer', () => {
  test('a fence that is opened and never closed is read in linear time', () => {
    // Quadratic on this input took far longer than the test's budget; linear reads it at once.
    const pasted = '```' + '\t'.repeat(200_000)
    expect(readAnswer(pasted)).toBeUndefined()
  }, 2_000)

  test('and a fenced object is still found, with or without the json label', () => {
    // The reason the fence is read at all: models fence their JSON however they are told.
    for (const text of ['```json\n{"a": 1}\n```', 'Here:\n```\n{"a": 1}\n```\nDone.', '```json{"a": 1}```']) {
      expect(readAnswer(text)).toEqual({ kind: 'object', value: { a: 1 } })
    }
  })
})
