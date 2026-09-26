import type { Storage } from '@formancy/server-core'

/**
 * Forgetting challenges that can no longer be replayed anyway.
 *
 * A solved challenge is recorded so it cannot be spent twice. Once it has
 * expired the record is doing nothing: the stateless expiry check refuses the
 * solution before the spend is ever consulted. Keeping the row past that point
 * only grows a table.
 *
 * Its own timer rather than a job on the file collector, because the two are
 * configured independently: a deployment can have public forms and no uploads,
 * and that deployment still accumulates spent challenges. Hanging this off the
 * collector would make sweeping conditional on a setting that has nothing to
 * do with it.
 *
 * The same shape as the collector and the outbox worker: a timer in the
 * process, one pass at a time, and a thrown pass complains and comes back
 * rather than stopping the timer. Also not a distributed job — running two is
 * harmless, because deleting an expired row twice is deleting it once.
 */
export interface SweeperHandle {
  stop: () => void
}

export function startChallengeSweeper(
  storage: Storage,
  options: { intervalMs?: number } = {},
): SweeperHandle {
  // Hourly. The rows expire in ten minutes and are a challenge hash each, so
  // an hour's worth of them is nothing; sweeping more often would be work
  // nobody asked for.
  const interval = options.intervalMs ?? 60 * 60_000
  let stopped = false
  let running = false

  const tick = async (): Promise<void> => {
    if (running || stopped) return
    running = true
    try {
      await storage.forgetExpiredChallenges(new Date().toISOString())
    } catch (error) {
      // A sweeper that throws is a sweeper that stops, and a table that grows
      // for a reason nobody is watching.
      console.error('challenges: a sweep failed', error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), interval)
  timer.unref?.()

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
  }
}
