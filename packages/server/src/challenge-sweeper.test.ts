import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Storage } from '@formancy/server-core'
import { startChallengeSweeper } from './challenge-sweeper.js'

/**
 * The sweeper had no test either.
 *
 * There is nothing here to decide — `forgetExpiredChallenges` is one storage call — so
 * what is worth testing is entirely the timing, and every one of these is a bug that
 * only appears after the process has been up for a day: a pass must not overlap itself,
 * a thrown pass must not stop the timer, and `stop()` must actually stop it.
 */

function fake() {
  const swept: string[] = []
  let fails = false
  let gate: Promise<void> | undefined

  const storage = {
    forgetExpiredChallenges: async (before: string) => {
      if (gate !== undefined) await gate
      if (fails) throw new Error('the table is locked')
      swept.push(before)
    },
  } as unknown as Storage

  return {
    storage,
    swept,
    fail: (yes: boolean) => {
      fails = yes
    },
    hold: (promise: Promise<void>) => {
      gate = promise
    },
  }
}

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve()
}

describe('startChallengeSweeper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('sweeps on the interval, with the moment it ran', async () => {
    const world = fake()
    startChallengeSweeper(world.storage, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(world.swept).toHaveLength(1)
    // An ISO string, because that is what the storage port takes: a Date would be
    // compared against a text column and match nothing.
    expect(world.swept[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  })

  test('does nothing until the first interval elapses', async () => {
    const world = fake()
    startChallengeSweeper(world.storage, { intervalMs: 1000 })

    await settle()

    expect(world.swept).toEqual([])
  })

  test('a pass that throws complains and comes back', async () => {
    // A sweeper that stops is a table that grows for a reason nobody is watching.
    const world = fake()
    const complained = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    world.fail(true)
    startChallengeSweeper(world.storage, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(complained).toHaveBeenCalled()
    expect(world.swept).toEqual([])

    world.fail(false)
    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(world.swept).toHaveLength(1)
  })

  test('does not start a pass while one is still running', async () => {
    // A slow database and an hourly timer will not collide, but a deployment that
    // shortens the interval must not get two deletes running over each other.
    let release = (): void => undefined
    const world = fake()
    world.hold(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    startChallengeSweeper(world.storage, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(5000)
    await settle()
    expect(world.swept).toEqual([])

    release()
    await settle()

    expect(world.swept).toHaveLength(1)
  })

  test('stop() means stop', async () => {
    const world = fake()
    const sweeper = startChallengeSweeper(world.storage, { intervalMs: 1000 })
    sweeper.stop()

    await vi.advanceTimersByTimeAsync(10_000)
    await settle()

    expect(world.swept).toEqual([])
  })
})
