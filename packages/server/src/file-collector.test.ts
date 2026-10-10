import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Storage } from '@formancy/server-core'
import { startFileCollector } from './file-collector.js'
import type { FileStore } from './file-store.js'
import { createServerLog } from './server-log.js'

/**
 * The collector deletes things, and it had no test.
 *
 * What it decides — which files count as abandoned — lives in `collectAbandonedFiles`
 * and is tested there. What is left here is the order of two irreversible steps and
 * three timing properties, each of which only shows up after hours of running: a pass
 * must not overlap itself, a thrown pass must not stop the timer, and `stop()` must
 * actually stop it.
 */

interface FileRow {
  id: string
  storageKey: string
}

/** A store and a storage that record what they were asked to do, in order. */
function fakes(abandoned: FileRow[]) {
  const order: string[] = []
  const removed: string[] = []
  const deletedRows: string[][] = []
  let failOn: string | undefined

  const store: FileStore = {
    put: async () => undefined,
    open: async () => undefined,
    sizeOf: async () => undefined,
    remove: async (key: string) => {
      if (key === failOn) throw new Error(`the store refused ${key}`)
      order.push(`bytes:${key}`)
      removed.push(key)
    },
  }

  const storage = {
    abandonedFiles: async () => abandoned,
    deleteFiles: async (ids: readonly string[]) => {
      order.push(`rows:${ids.join(',')}`)
      deletedRows.push([...ids])
    },
  } as unknown as Storage

  return {
    store,
    storage,
    order,
    removed,
    deletedRows,
    failAt: (key: string) => {
      failOn = key
    },
  }
}

/** Let the pass's promise chain settle without advancing the fake clock. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve()
}

describe('startFileCollector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('deletes the BYTES before the row, never the other way round', async () => {
    // The one ordering that matters, and it is not symmetric. A row with no bytes is a
    // broken reference somebody finds the moment they try to download it; bytes with no
    // row are invisible and the disk fills up silently.
    const world = fakes([{ id: 'f1', storageKey: 'k1' }])
    startFileCollector(world.storage, world.store, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(world.order).toEqual(['bytes:k1', 'rows:f1'])
  })

  test('deletes the rows in one call once every file’s bytes are gone', async () => {
    const world = fakes([
      { id: 'f1', storageKey: 'k1' },
      { id: 'f2', storageKey: 'k2' },
    ])
    startFileCollector(world.storage, world.store, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(world.order).toEqual(['bytes:k1', 'bytes:k2', 'rows:f1,f2'])
  })

  test('a store that refuses leaves the rest for the next pass, and keeps every row', async () => {
    // The failure this prevents: deleting the row for a file whose bytes are still
    // there, which loses track of them forever — the collector will never see that file
    // again, because it walks rows.
    const world = fakes([
      { id: 'f1', storageKey: 'k1' },
      { id: 'f2', storageKey: 'k2' },
    ])
    world.failAt('k1')
    startFileCollector(world.storage, world.store, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(world.removed).toEqual([])
    expect(world.deletedRows).toEqual([])
  })

  test('touches nothing when there is nothing abandoned', async () => {
    // Not merely tidy: `deleteFiles([])` against a real database is a statement with an
    // empty IN list, which some drivers turn into a delete of everything.
    const world = fakes([])
    startFileCollector(world.storage, world.store, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(3000)
    await settle()

    expect(world.order).toEqual([])
  })

  test('does nothing until the first interval elapses', async () => {
    // A collector that ran on construction would surprise a caller who started it
    // before finishing their own setup.
    const world = fakes([{ id: 'f1', storageKey: 'k1' }])
    startFileCollector(world.storage, world.store, { intervalMs: 1000 })

    await settle()

    expect(world.order).toEqual([])
  })

  test('a pass that throws complains, without what was thrown, and comes back', async () => {
    // A collector that stops is a disk that fills up, and nothing is watching it. Its
    // complaint is the error's kind, never its words: the store's error names the key,
    // and was printed whole to standard error until the log had a rule (C3).
    const world = fakes([{ id: 'f1', storageKey: 'planted-storage-key-2c9d' }])
    world.failAt('planted-storage-key-2c9d')
    const written: string[] = []
    startFileCollector(world.storage, world.store, {
      intervalMs: 1000,
      log: createServerLog({ write: (line) => written.push(line) }, 'info'),
    })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(written.map((line) => JSON.parse(line) as unknown)).toEqual([
      { time: expect.any(String), level: 'error', event: 'collector.failed', kind: 'Error' },
    ])
    expect(written.join('')).not.toContain('planted')

    // Still running: the next pass happens.
    world.failAt('nothing')
    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    expect(world.order).toEqual(['bytes:planted-storage-key-2c9d', 'rows:f1'])
  })

  test('given no log, it complains on standard error, through the same rule', async () => {
    // Exported, so a host can start it without the server's log. It complained to
    // standard error before there was a log, and still does — without the store's words.
    const world = fakes([{ id: 'f1', storageKey: 'planted-storage-key-77e0' }])
    world.failAt('planted-storage-key-77e0')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    startFileCollector(world.storage, world.store, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await settle()

    const said = stderr.mock.calls.map(([chunk]) => String(chunk)).filter((chunk) => chunk.includes('"event"'))
    expect(said.map((line) => JSON.parse(line) as unknown)).toEqual([
      { time: expect.any(String), level: 'error', event: 'collector.failed', kind: 'Error' },
    ])
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).not.toContain('planted')
  })

  test('does not start a pass while one is still running', async () => {
    // A slow store and a short interval would otherwise have two passes deleting the
    // same file, and the second one's `deleteFiles` naming rows the first already
    // removed.
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const world = fakes([{ id: 'f1', storageKey: 'k1' }])
    const slow: FileStore = {
      ...world.store,
      remove: async (key: string) => {
        await held
        await world.store.remove(key)
      },
    }
    startFileCollector(world.storage, slow, { intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(5000)
    await settle()
    expect(world.order).toEqual([])

    release()
    await settle()

    expect(world.order).toEqual(['bytes:k1', 'rows:f1'])
  })

  test('stop() means stop', async () => {
    const world = fakes([{ id: 'f1', storageKey: 'k1' }])
    const collector = startFileCollector(world.storage, world.store, { intervalMs: 1000 })
    collector.stop()

    await vi.advanceTimersByTimeAsync(10_000)
    await settle()

    expect(world.order).toEqual([])
  })
})
