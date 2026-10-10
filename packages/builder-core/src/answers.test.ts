import { describe, expect, test, vi } from 'vitest'
import { createStop } from './answers.js'

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
