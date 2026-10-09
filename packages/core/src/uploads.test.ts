import { describe, expect, test, vi } from 'vitest'
import type { FormSchema } from '@formancy/spec'
import { createFormEngine } from './engine.js'
import { cancelUploads, createUploadQueue, fieldUploads, thumbnailSize } from './uploads.js'
import type { UploadAttempt } from './uploads.js'

/**
 * Files on their way to storage, each with its own outcome (0130).
 *
 * Both renderers read this queue rather than keeping their own, because every case
 * below is a decision — what a cancelled upload that finishes anyway becomes, whether a
 * failure stops the others, where a retried file ends up — and two copies of each would
 * be two answers waiting to differ.
 */
interface Picked {
  name: string
  size: number
}
interface Stored {
  id: string
  name: string
}

const picked = (name: string): Picked => ({ name, size: name.length })

/** An upload that waits to be told how it ends, so a test can look in between. */
function controlled() {
  const calls: Array<{
    file: Picked
    attempt: UploadAttempt
    resolve: (stored: Stored) => void
    reject: (error: unknown) => void
  }> = []
  const upload = vi.fn(
    (file: Picked, attempt: UploadAttempt) =>
      new Promise<Stored>((resolve, reject) => calls.push({ file, attempt, resolve, reject })),
  )
  return { calls, upload }
}

/**
 * Lets settled uploads run their callbacks. Microtasks rather than a timer: this
 * package has no DOM or Node types, so `setTimeout` does not exist for it.
 */
const settle = async (): Promise<void> => {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
}

describe('an upload queue', () => {
  test('sends one file at a time, in the order given, and reports each as it is stored', async () => {
    const { calls, upload } = controlled()
    const stored = vi.fn()
    const queue = createUploadQueue({ upload, stored })

    queue.add([picked('a.pdf'), picked('b.pdf')])

    // One at a time: the second waits rather than racing the first for the connection.
    expect(queue.pending().map(({ name, state }) => [name, state])).toEqual([
      ['a.pdf', 'uploading'],
      ['b.pdf', 'waiting'],
    ])
    expect(upload).toHaveBeenCalledTimes(1)

    calls[0]!.resolve({ id: 'a', name: 'a.pdf' })
    await settle()
    calls[1]!.resolve({ id: 'b', name: 'b.pdf' })
    await settle()

    expect(stored.mock.calls.map(([file]) => file.id)).toEqual(['a', 'b'])
    expect(queue.pending()).toEqual([])
  })

  test('a file picked while another is being sent waits its turn', () => {
    const { upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    queue.add([picked('a.pdf')])

    queue.add([picked('b.pdf')])

    expect(upload).toHaveBeenCalledTimes(1)
    expect(queue.pending().map(({ state }) => state)).toEqual(['uploading', 'waiting'])
  })

  test('keeps a file that failed, with the reason, and goes on with the rest', async () => {
    // A failure on the second of three must not cost the third its upload, nor the
    // first its place in the answer: the first's bytes are already in storage.
    const { calls, upload } = controlled()
    const stored = vi.fn()
    const queue = createUploadQueue({ upload, stored })
    queue.add([picked('a.pdf'), picked('b.pdf'), picked('c.pdf')])

    calls[0]!.resolve({ id: 'a', name: 'a.pdf' })
    await settle()
    calls[1]!.reject(new Error('the object store is full'))
    await settle()
    calls[2]!.resolve({ id: 'c', name: 'c.pdf' })
    await settle()

    expect(stored.mock.calls.map(([file]) => file.id)).toEqual(['a', 'c'])
    expect(queue.pending()).toEqual([
      expect.objectContaining({
        name: 'b.pdf',
        state: 'failed',
        reason: 'the object store is full',
      }),
    ])
  })

  test('tries a failed file again with the same file, and stores it when it gets there', async () => {
    const { calls, upload } = controlled()
    const stored = vi.fn()
    const queue = createUploadQueue({ upload, stored })
    queue.add([picked('a.pdf')])
    calls[0]!.reject(new Error('offline'))
    await settle()

    queue.retry(queue.pending()[0]!.key)
    expect(queue.pending()[0]?.state).toBe('uploading')
    expect(calls[1]?.file).toBe(calls[0]?.file)
    calls[1]!.resolve({ id: 'a', name: 'a.pdf' })
    await settle()

    expect(stored).toHaveBeenCalledWith({ id: 'a', name: 'a.pdf' })
    expect(queue.pending()).toEqual([])
  })

  test('does not start a file again that is still being sent', () => {
    const { upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    queue.add([picked('a.pdf')])

    queue.retry(queue.pending()[0]!.key)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(queue.pending()[0]?.state).toBe('uploading')
  })

  test('shows how far each file has got, when the uploader says', async () => {
    const { calls, upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    queue.add([picked('a.pdf')])

    // Nothing reported is no figure, not zero: an uploader that cannot measure must
    // not be drawn as stuck at the start.
    expect(queue.pending()[0]).not.toHaveProperty('sent')
    calls[0]!.attempt.progress(300, 1200)

    expect(queue.pending()[0]).toMatchObject({ state: 'uploading', sent: 300, total: 1200 })
  })

  test('cancelling the file being sent tells the uploader, and drops whatever it finishes with', async () => {
    // The uploader may not stop in time, and the bytes may land anyway. Recording them
    // would attach a file the person took back; leaving them is safe, because a file no
    // submission claims is collected (0055).
    const { calls, upload } = controlled()
    const stored = vi.fn()
    const stop = vi.fn()
    const queue = createUploadQueue({ upload, stored })
    queue.add([picked('a.pdf'), picked('b.pdf')])
    calls[0]!.attempt.onCancel(stop)

    queue.cancel(queue.pending()[0]!.key)

    expect(stop).toHaveBeenCalledTimes(1)
    expect(queue.pending().map(({ name, state }) => [name, state])).toEqual([
      ['b.pdf', 'uploading'],
    ])
    calls[0]!.resolve({ id: 'a', name: 'a.pdf' })
    calls[1]!.resolve({ id: 'b', name: 'b.pdf' })
    await settle()
    expect(stored.mock.calls.map(([file]) => file.id)).toEqual(['b'])
  })

  test('and an upload that goes on reporting after it was cancelled changes nothing', () => {
    // An uploader that ignores the signal keeps calling back. Without the check the
    // field redraws for a file that is gone — and a late figure could land on the
    // next attempt at the same file.
    const { calls, upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    queue.add([picked('a.pdf')])
    queue.cancel(queue.pending()[0]!.key)
    const listener = vi.fn()
    queue.subscribe(listener)

    calls[0]!.attempt.progress(5, 10)

    expect(listener).not.toHaveBeenCalled()
  })

  test('and the abort a cancelled upload rejects with costs the next file nothing', async () => {
    // What a fetch does when its signal is aborted: it rejects. That rejection
    // arrives while the next file is already being sent, and must not be taken for
    // that file's outcome.
    const { calls, upload } = controlled()
    const stored = vi.fn()
    const queue = createUploadQueue({ upload, stored })
    queue.add([picked('a.pdf'), picked('b.pdf')])

    queue.cancel(queue.pending()[0]!.key)
    calls[0]!.reject(new Error('The operation was aborted.'))
    await settle()
    calls[1]!.resolve({ id: 'b', name: 'b.pdf' })
    await settle()

    expect(stored).toHaveBeenCalledWith({ id: 'b', name: 'b.pdf' })
    expect(queue.pending()).toEqual([])
  })

  test('cancelling a file still waiting never sends it', () => {
    const { upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    queue.add([picked('a.pdf'), picked('b.pdf')])

    queue.cancel(queue.pending()[1]!.key)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(queue.pending().map(({ name }) => name)).toEqual(['a.pdf'])
  })

  test('and cancelling a failed file is how it is dismissed', async () => {
    const { calls, upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    queue.add([picked('a.pdf')])
    calls[0]!.reject(new Error('offline'))
    await settle()

    queue.cancel(queue.pending()[0]!.key)

    expect(queue.pending()).toEqual([])
  })

  test('an uploader that throws instead of rejecting fails that file, not the queue', async () => {
    const stored = vi.fn()
    const queue = createUploadQueue<Picked, Stored>({
      upload: (file) => {
        if (file.name === 'a.pdf') throw new Error('refused before it began')
        return Promise.resolve({ id: 'b', name: 'b.pdf' })
      },
      stored,
    })

    queue.add([picked('a.pdf'), picked('b.pdf')])
    await settle()

    expect(queue.pending()).toEqual([
      expect.objectContaining({
        name: 'a.pdf',
        state: 'failed',
        reason: 'refused before it began',
      }),
    ])
    expect(stored).toHaveBeenCalledWith({ id: 'b', name: 'b.pdf' })
  })

  test('says when it has nothing left to do, which is when the field counts as visited', async () => {
    const { calls, upload } = controlled()
    const settled = vi.fn()
    const queue = createUploadQueue({ upload, stored: () => {}, settled })
    queue.add([picked('a.pdf'), picked('b.pdf')])

    calls[0]!.resolve({ id: 'a', name: 'a.pdf' })
    await settle()
    expect(settled).not.toHaveBeenCalled()
    calls[1]!.reject(new Error('offline'))
    await settle()

    expect(settled).toHaveBeenCalledTimes(1)
  })

  test('remembers which picked file a stored one came from, which is what a thumbnail is drawn from', async () => {
    const { calls, upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    const file = picked('photo.jpg')
    queue.add([file])
    calls[0]!.resolve({ id: 'p1', name: 'photo.jpg' })
    await settle()

    expect(queue.sourceOf('p1')).toBe(file)
    expect(queue.sourceOf('stored-before-this-page')).toBeUndefined()
  })

  test('hands out the same list until something changes, and says when it does', async () => {
    // Identity is what useSyncExternalStore and a signal compare; a fresh array on every
    // read would re-render the field forever.
    const { calls, upload } = controlled()
    const queue = createUploadQueue({ upload, stored: () => {} })
    const listener = vi.fn()
    queue.subscribe(listener)
    queue.add([picked('a.pdf')])
    const before = queue.pending()

    expect(queue.pending()).toBe(before)
    calls[0]!.attempt.progress(1, 2)
    expect(queue.pending()).not.toBe(before)
    expect(listener).toHaveBeenCalled()
  })

  test('stopping everything cancels what is running, and the queue still works afterwards', async () => {
    // A field that unmounts stops its uploads. React mounts twice in development, so a
    // queue that refused work after this would leave a field that never uploads again.
    const { calls, upload } = controlled()
    const stored = vi.fn()
    const stop = vi.fn()
    const queue = createUploadQueue({ upload, stored })
    queue.add([picked('a.pdf'), picked('b.pdf')])
    calls[0]!.attempt.onCancel(stop)

    queue.cancelAll()
    calls[0]!.resolve({ id: 'a', name: 'a.pdf' })
    await settle()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(queue.pending()).toEqual([])
    expect(stored).not.toHaveBeenCalled()

    queue.add([picked('c.pdf')])
    calls[1]!.resolve({ id: 'c', name: 'c.pdf' })
    await settle()
    expect(stored).toHaveBeenCalledWith({ id: 'c', name: 'c.pdf' })
  })
})

describe('the uploads of a file field', () => {
  // A row that moves remounts its controls in both renderers. Owned by the control, a
  // queue was cancelled with it; before the queue existed, a file that finished after
  // the move was written into whichever row now sat at the old position.
  const CLOCK = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }
  const expenses = () =>
    createFormEngine({
      schema: {
        specVersion: '4',
        id: 'expenses',
        title: 'Expenses',
        model: {
          fields: [
            {
              key: 'items',
              type: 'repeater',
              label: 'Items',
              minItems: 2,
              fields: [{ key: 'receipt', type: 'file', label: 'Receipt' }],
            },
          ],
        },
      } as unknown as FormSchema,
      capabilities: CLOCK,
    })
  const receipt = (id: string) => ({
    id,
    name: `${id}.pdf`,
    size: 1,
    contentType: 'application/pdf',
    storageKey: id,
  })

  test('are found again by a control drawn for the same row after it moved', () => {
    const engine = expenses()
    const before = fieldUploads(engine, 'items[0].receipt')

    engine.moveRow(['items'], 0, 1)

    expect(fieldUploads(engine, 'items[1].receipt')).toBe(before)
    expect(fieldUploads(engine, 'items[0].receipt')).not.toBe(before)
  })

  test('and a file that finishes after its row moved lands in that row', async () => {
    const engine = expenses()
    const uploads = fieldUploads<Picked, ReturnType<typeof receipt>>(engine, 'items[0].receipt')
    const { calls, upload } = controlled()
    uploads.sender = (file, attempt) => upload(file, attempt) as never
    uploads.queue.add([picked('taxi.pdf')])

    engine.moveRow(['items'], 0, 1)
    calls[0]!.resolve(receipt('taxi') as never)
    await settle()

    const rows = (engine.value() as { items: Array<Record<string, unknown>> }).items
    expect(rows[1]?.['receipt']).toEqual([receipt('taxi')])
    expect(rows[0]).not.toHaveProperty('receipt')
  })

  test('and is told which field it is for, whichever row', () => {
    const engine = expenses()
    const uploads = fieldUploads<Picked, ReturnType<typeof receipt>>(engine, 'items[1].receipt')
    const sender = vi.fn(() => new Promise<ReturnType<typeof receipt>>(() => {}))
    uploads.sender = sender

    uploads.queue.add([picked('taxi.pdf')])

    expect(sender).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'items[].receipt')
  })

  test('and the field counts as visited once its files have settled, not before', async () => {
    // Touched while the first file is still on its way, a required file field would say
    // "required" beside a file that is uploading.
    const engine = expenses()
    const uploads = fieldUploads<Picked, ReturnType<typeof receipt>>(engine, 'items[0].receipt')
    const { calls, upload } = controlled()
    uploads.sender = (file, attempt) => upload(file, attempt) as never
    uploads.queue.add([picked('taxi.pdf')])

    expect(engine.getFieldSnapshot(['items', 0, 'receipt']).touched).toBe(false)
    calls[0]!.resolve(receipt('taxi') as never)
    await settle()

    expect(engine.getFieldSnapshot(['items', 0, 'receipt']).touched).toBe(true)
  })

  test('and a file whose row was removed is attached to no other row', async () => {
    const engine = expenses()
    const uploads = fieldUploads<Picked, ReturnType<typeof receipt>>(engine, 'items[0].receipt')
    const { calls, upload } = controlled()
    uploads.sender = (file, attempt) => upload(file, attempt) as never
    uploads.queue.add([picked('taxi.pdf')])

    engine.removeRow(['items'], 0)
    calls[0]!.resolve(receipt('taxi') as never)
    await settle()

    const rows = (engine.value() as { items: Array<Record<string, unknown>> }).items
    expect(rows.every((row) => !('receipt' in row))).toBe(true)
  })

  test('and stopping a form stops every field’s uploads', () => {
    const engine = expenses()
    const stop = vi.fn()
    const uploads = fieldUploads<Picked, ReturnType<typeof receipt>>(engine, 'items[0].receipt')
    uploads.sender = (_file, attempt) => {
      attempt.onCancel(stop)
      return new Promise(() => {})
    }
    uploads.queue.add([picked('taxi.pdf')])

    cancelUploads(engine)

    expect(stop).toHaveBeenCalledTimes(1)
    expect(uploads.queue.pending()).toEqual([])
  })
})

describe('a thumbnail', () => {
  test('fits its longer side, keeps its shape, and is never enlarged or empty', () => {
    // Both renderers draw at this size, so a picture is the same shape in either.
    expect(thumbnailSize(400, 200)).toEqual({ width: 64, height: 32 })
    expect(thumbnailSize(100, 400)).toEqual({ width: 16, height: 64 })
    expect(thumbnailSize(20, 10)).toEqual({ width: 20, height: 10 })
    expect(thumbnailSize(1000, 1)).toEqual({ width: 64, height: 1 })
  })
})
