/**
 * Files on their way to storage, one at a time, each with its own outcome.
 *
 * Both renderers' file fields read this rather than keeping their own, because each
 * behaviour here is a decision somebody could get differently — what a cancelled upload
 * that finishes anyway becomes, whether one failure stops the rest, where a retried file
 * ends up — and two copies of each would be two answers waiting to differ
 * ([0130](../../../docs/decisions/0130-each-file-is-its-own-upload.md)).
 *
 * **Framework-free and DOM-free**, like the rest of this package: a picked file is
 * anything with a name and a size, and cancelling is a callback rather than an
 * `AbortSignal`, which this package's types do not have. Each binding turns that callback
 * into the signal its host's uploader takes.
 */

import type { FormEngine } from './engine.js'
import { parsePath } from './path.js'
import type { Path } from './path.js'

/** What an upload is told while it runs. */
export interface UploadAttempt {
  /** Bytes sent so far, of how many. An upload that never calls it is shown with no figure. */
  progress(sent: number, total: number): void
  /** Called once, if the person cancels this file while it is being sent. */
  onCancel(stop: () => void): void
}

/** A file not yet in the answer: waiting its turn, being sent, or refused. */
export interface PendingUpload {
  /** Stable for as long as the file is in the queue; what a row is keyed and acted on by. */
  readonly key: string
  readonly name: string
  readonly size: number
  readonly state: 'waiting' | 'uploading' | 'failed'
  /** How far it has got, once the uploader has said. */
  readonly sent?: number
  readonly total?: number
  /** Why it was refused, in the uploader's words. */
  readonly reason?: string
}

export interface UploadQueueOptions<F, S> {
  upload(file: F, attempt: UploadAttempt): Promise<S>
  /** Each file that reached storage, in the order they got there. */
  stored(file: S): void
  /** Nothing is waiting or being sent any more. */
  settled?(): void
}

export interface UploadQueue<F> {
  /** The same array until something changes, so a binding can compare it by identity. */
  pending(): readonly PendingUpload[]
  subscribe(listener: () => void): () => void
  add(files: Iterable<F>): void
  /** Take a file out, whatever it is doing: not sent, stopped, or dismissed after a failure. */
  cancel(key: string): void
  retry(key: string): void
  /** The picked file a stored one came from, while this queue lives. */
  sourceOf(storedId: string): F | undefined
  /** Cancel everything. The queue keeps working: a binding may be mounted again. */
  cancelAll(): void
}

interface Entry<F> {
  readonly file: F
  view: PendingUpload
  stops: Array<() => void>
}

export function createUploadQueue<
  F extends { readonly name: string; readonly size: number },
  S extends { readonly id: string },
>(options: UploadQueueOptions<F, S>): UploadQueue<F> {
  let entries: Array<Entry<F>> = []
  let snapshot: readonly PendingUpload[] = []
  let running: Entry<F> | undefined
  let minted = 0
  const listeners = new Set<() => void>()
  const sources = new Map<string, F>()

  const publish = (): void => {
    snapshot = entries.map((entry) => entry.view)
    for (const listener of [...listeners]) listener()
  }

  const fresh = (
    entry: Entry<F>,
    state: PendingUpload['state'],
    reason?: string,
  ): PendingUpload => ({
    key: entry.view.key,
    name: entry.file.name,
    size: entry.file.size,
    state,
    ...(reason === undefined ? {} : { reason }),
  })

  /**
   * Send the next waiting file, or say there is nothing left.
   *
   * One at a time, so the answer's order is the order files were picked in, and a
   * connection is not split five ways for five progress bars that each crawl.
   */
  const next = (): void => {
    if (running !== undefined) return
    const entry = entries.find((candidate) => candidate.view.state === 'waiting')
    if (entry === undefined) {
      options.settled?.()
      return
    }
    running = entry
    entry.view = fresh(entry, 'uploading')
    publish()

    const attempt: UploadAttempt = {
      progress: (sent, total) => {
        if (running !== entry) return
        entry.view = { ...entry.view, sent, total }
        publish()
      },
      onCancel: (stop) => {
        entry.stops.push(stop)
      },
    }

    let sending: Promise<S>
    try {
      sending = options.upload(entry.file, attempt)
    } catch (error) {
      // Refused before it began is still that file's failure, not the queue's.
      sending = Promise.reject(error)
    }
    sending.then(
      (stored) => {
        // Cancelled while it ran: whatever landed is left for the collector, which
        // reclaims a file no submission claims (0055). Recording it would attach a
        // file the person took back.
        if (running !== entry) return
        running = undefined
        entries = entries.filter((other) => other !== entry)
        sources.set(stored.id, entry.file)
        // Into the answer before it leaves the queue's list, so a binding that redraws
        // in between never shows the file in neither place.
        options.stored(stored)
        publish()
        next()
      },
      (error: unknown) => {
        if (running !== entry) return
        running = undefined
        entry.view = fresh(entry, 'failed', error instanceof Error ? error.message : String(error))
        publish()
        next()
      },
    )
  }

  const stopRunning = (): void => {
    const stopping = running
    running = undefined
    for (const stop of stopping?.stops ?? []) stop()
  }

  return {
    pending: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    add(files) {
      for (const file of files) {
        minted += 1
        const entry: Entry<F> = {
          file,
          view: {
            key: `upload-${String(minted)}`,
            name: file.name,
            size: file.size,
            state: 'waiting',
          },
          stops: [],
        }
        entries = [...entries, entry]
      }
      publish()
      next()
    },

    cancel(key) {
      const entry = entries.find((candidate) => candidate.view.key === key)
      if (entry === undefined) return
      entries = entries.filter((other) => other !== entry)
      if (running === entry) stopRunning()
      publish()
      next()
    },

    retry(key) {
      const entry = entries.find((candidate) => candidate.view.key === key)
      if (entry?.view.state !== 'failed') return
      entry.view = fresh(entry, 'waiting')
      publish()
      next()
    },

    sourceOf: (storedId) => sources.get(storedId),

    cancelAll() {
      stopRunning()
      entries = []
      publish()
    },
  }
}

/**
 * The upload queue of one file field, kept with the form rather than with the control
 * that draws it.
 *
 * **Because a row that moves remounts its controls**, in both renderers. Owned by the
 * control, the queue was cancelled with it and the file silently dropped; before the
 * queue existed, a file that finished after the move was written into whichever row now
 * sat at the old position — somebody else's receipt. Kept here by the row's identity, a
 * control drawn for the same row finds its uploads where it left them, and a finished
 * file goes to the row it was picked in, wherever that row is now, or nowhere if the
 * row was removed.
 */
export interface FieldUploads<F, S> {
  readonly queue: UploadQueue<F>
  /**
   * What sends a file: set by whichever control draws the field now, which is the one
   * holding the host's uploader. `field` is the data path a server reads, with `[]` for
   * a row — the same for every row.
   */
  sender: ((file: F, attempt: UploadAttempt, field: string) => Promise<S>) | undefined
}

const formsUploads = new WeakMap<FormEngine, Map<string, FieldUploads<never, never>>>()

/** The uploads of the file field at `wire`, made the first time a control asks. */
export function fieldUploads<
  F extends { readonly name: string; readonly size: number },
  S extends { readonly id: string },
>(engine: FormEngine, wire: string): FieldUploads<F, S> {
  const identity = identityOf(engine, parsePath(wire))
  const key = JSON.stringify(identity)
  let forms = formsUploads.get(engine)
  if (forms === undefined) {
    forms = new Map()
    formsUploads.set(engine, forms)
  }
  const found = forms.get(key)
  if (found !== undefined) return found as unknown as FieldUploads<F, S>

  const field = wire.replace(/\[\d+\]/g, '[]')
  const made: FieldUploads<F, S> = {
    sender: undefined,
    queue: createUploadQueue<F, S>({
      upload: (file, attempt) =>
        made.sender === undefined
          ? Promise.reject(new Error('No upload destination.'))
          : made.sender(file, attempt, field),
      stored: (file) => {
        const path = pathOf(engine, identity)
        if (path === undefined) return
        const before = engine.getFieldSnapshot(path).value
        engine.setValue(path, [...(Array.isArray(before) ? before : []), file])
      },
      // Visited once its files have settled, so "required" is not shown while the first
      // file is still on its way.
      settled: () => {
        const path = pathOf(engine, identity)
        if (path !== undefined) engine.touch(path)
      },
    }),
  }
  forms.set(key, made as unknown as FieldUploads<never, never>)
  return made
}

/** Stop every upload of a form that is going away. Its queues keep working afterwards. */
export function cancelUploads(engine: FormEngine): void {
  for (const uploads of formsUploads.get(engine)?.values() ?? []) uploads.queue.cancelAll()
}

/** A path with each row position replaced by that row's identity, which survives a move. */
type Identity = ReadonlyArray<string | { readonly row: string }>

function identityOf(engine: FormEngine, path: Path): Identity {
  return path.map((segment, at) =>
    typeof segment === 'number' ? { row: engine.rowId(path.slice(0, at), segment) } : segment,
  )
}

/** Where a row identity is now, or undefined when the row is gone. */
function pathOf(engine: FormEngine, identity: Identity): Path | undefined {
  const path: Array<string | number> = []
  for (const segment of identity) {
    if (typeof segment === 'string') {
      path.push(segment)
      continue
    }
    const count = engine.rowCount(path)
    let index = 0
    while (index < count && engine.rowId(path, index) !== segment.row) index += 1
    if (index === count) return undefined
    path.push(index)
  }
  return path
}

/** The largest side of a file's thumbnail, in canvas pixels. A theme sizes it from there. */
export const THUMBNAIL_SIDE = 64

/**
 * The size a thumbnail is drawn at: within {@link THUMBNAIL_SIDE} on its longer side,
 * keeping its shape, never enlarged, and never zero — a canvas of no pixels draws nothing.
 */
export function thumbnailSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, THUMBNAIL_SIDE / Math.max(width, height, 1))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
