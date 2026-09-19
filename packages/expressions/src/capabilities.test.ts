import { describe, expect, test } from 'vitest'
import { captureCapabilities, fixedCapabilities } from './capabilities.js'

describe('captureCapabilities', () => {
  test('reads each source exactly once so one pass cannot see time move', () => {
    let nowCalls = 0
    let randomCalls = 0
    const captured = captureCapabilities({
      now: () => {
        nowCalls += 1
        return 1_700_000_000_000 + nowCalls
      },
      today: () => '2026-09-19',
      random: () => {
        randomCalls += 1
        return 0.25
      },
    })

    expect(nowCalls).toBe(1)
    expect(randomCalls).toBe(1)
    expect(captured).toEqual({ nowMs: 1_700_000_000_001, today: '2026-09-19', random: 0.25 })
  })

  test('freezes the result, so nothing can rewrite the pass mid-evaluation', () => {
    const captured = captureCapabilities({
      now: () => 0,
      today: () => '2026-09-19',
      random: () => 0,
    })

    expect(Object.isFrozen(captured)).toBe(true)
  })
})

describe('fixedCapabilities', () => {
  test('accepts a recorded snapshot, which is how a submission is replayed', () => {
    const replayed = fixedCapabilities({ nowMs: 1_700_000_000_000, today: '2026-09-19', random: 0 })

    expect(replayed).toEqual({ nowMs: 1_700_000_000_000, today: '2026-09-19', random: 0 })
  })

  test('rejects values that would make a replay disagree with the original', () => {
    expect(() => fixedCapabilities({ nowMs: 1.5, today: '2026-09-19', random: 0 })).toThrow(
      RangeError,
    )
    expect(() => fixedCapabilities({ nowMs: 0, today: '19.09.2026', random: 0 })).toThrow(RangeError)
    expect(() => fixedCapabilities({ nowMs: 0, today: '2026-09-19', random: 1 })).toThrow(RangeError)
    expect(() => fixedCapabilities({ nowMs: 0, today: '2026-09-19', random: -0.1 })).toThrow(
      RangeError,
    )
  })
})
