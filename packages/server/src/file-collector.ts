import { collectAbandonedFiles } from '@formancy/server-core'
import type { Storage } from '@formancy/server-core'
import type { FileStore } from './file-store.js'

/**
 * Deleting files nobody claimed.
 *
 * Somebody who attaches a file and then closes the tab leaves bytes behind.
 * Without this they stay forever, and a disk that fills up for a reason nobody
 * is watching is the most tedious kind of outage.
 *
 * **Bytes first, then the row.** A row with no bytes is a broken reference and
 * shows up the moment anybody tries to download it. Bytes with no row are
 * invisible: nothing will ever look for them again, and the disk fills up
 * silently. Of the two ways to be interrupted halfway, the first is the one
 * you find out about.
 *
 * The same shape as the outbox worker, for the same reasons: a timer in the
 * server process rather than a queue library, one pass at a time, and a
 * thrown pass complains and comes back rather than stopping the timer. It is
 * likewise not a distributed job — `abandonedFiles` takes no lock, so two
 * replicas would both try to delete the same file. That is harmless here,
 * unlike a webhook sent twice, because deleting a file twice is deleting it
 * once.
 */
export interface CollectorHandle {
  stop: () => void
}

export function startFileCollector(
  storage: Storage,
  store: FileStore,
  options: { intervalMs?: number; afterHours?: number } = {},
): CollectorHandle {
  const interval = options.intervalMs ?? 15 * 60_000
  const afterHours = options.afterHours ?? 24
  let stopped = false
  let running = false

  const tick = async (): Promise<void> => {
    if (running || stopped) return
    running = true
    try {
      const abandoned = await collectAbandonedFiles(storage, new Date(), afterHours)
      if (abandoned.length === 0) return

      const removed: string[] = []
      for (const file of abandoned) {
        // One at a time, and the row only once its bytes are gone. A failure
        // partway leaves the rest for the next pass rather than losing track
        // of what was already done.
        await store.remove(file.storageKey)
        removed.push(file.id)
      }
      await storage.deleteFiles(removed)
    } catch (error) {
      // A collector that throws is a collector that stops, and a disk that
      // fills up. Complain and come back.
      console.error('files: a collection pass failed', error)
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
