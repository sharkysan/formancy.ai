import { describe, expect, test, vi } from 'vitest'
import { createInteractionState } from './interaction.js'

describe('createInteractionState', () => {
  test('every field starts untouched', () => {
    const state = createInteractionState()
    expect(state.isTouched(['email'])).toBe(false)
  })

  test('touch marks exactly that field', () => {
    const state = createInteractionState()
    state.touch(['email'])

    expect(state.isTouched(['email'])).toBe(true)
    expect(state.isTouched(['address', 'city'])).toBe(false)
  })

  test('notifies subscribers with the wire path on first touch only', () => {
    const state = createInteractionState()
    const seen: string[][] = []
    state.subscribe((changed) => seen.push([...changed]))

    state.touch(['address', 'city'])
    state.touch(['address', 'city'])

    expect(seen).toEqual([['address.city']])
  })

  test('touchMany marks all paths with a single notification', () => {
    const state = createInteractionState()
    const listener = vi.fn()
    state.subscribe(listener)

    state.touchMany([['email'], ['address', 'city']])

    expect(state.isTouched(['email'])).toBe(true)
    expect(state.isTouched(['address', 'city'])).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('touchMany notifies only the paths that were not already touched', () => {
    const state = createInteractionState()
    state.touch(['email'])
    const seen: string[][] = []
    state.subscribe((changed) => seen.push([...changed].sort()))

    state.touchMany([['email'], ['message']])

    expect(seen).toEqual([['message']])
  })

  test('touchMany with nothing new notifies nobody', () => {
    const state = createInteractionState()
    state.touch(['email'])
    const listener = vi.fn()
    state.subscribe(listener)

    state.touchMany([['email']])

    expect(listener).not.toHaveBeenCalled()
  })

  test('reset returns every field to untouched and reports what was cleared', () => {
    const state = createInteractionState()
    state.touchMany([['email'], ['message']])
    const seen: string[][] = []
    state.subscribe((changed) => seen.push([...changed].sort()))

    state.reset()

    expect(state.isTouched(['email'])).toBe(false)
    expect(seen).toEqual([['email', 'message']])
  })

  test('reset when nothing is touched notifies nobody', () => {
    const state = createInteractionState()
    const listener = vi.fn()
    state.subscribe(listener)

    state.reset()

    expect(listener).not.toHaveBeenCalled()
  })

  test('unsubscribe stops notifications', () => {
    const state = createInteractionState()
    const listener = vi.fn()
    state.subscribe(listener)()

    state.touch(['email'])

    expect(listener).not.toHaveBeenCalled()
  })
})
