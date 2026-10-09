import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fieldUploads, thumbnailSize } from '@formancy/core'
import type { PendingUpload, UploadQueue } from '@formancy/core'
import { useFormEngine } from '../context.js'
import { useField } from '../use-field.js'
import { useUploader } from '../uploads.js'
import type { StoredFile, Uploader } from '../uploads.js'
import { FieldShell } from './internals.js'
import type { FieldComponentProps } from './internals.js'


/**
 * The file control, over an uploader the host supplies.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
/**
 * Attached files.
 *
 * The control picks files; something else uploads them and reports back what
 * was stored. That split is the whole design: this package has no opinion
 * about where bytes go, which is what lets the same field work against local
 * disk, S3 or a customer's own service.
 *
 * Without an uploader the field is read-only and says so, rather than
 * pretending to accept a file it has nowhere to put.
 *
 * **Each file is its own upload** — waiting, sending with how far it has got,
 * cancellable, and refused with a reason and a way to try again. What happens to
 * each is `@formancy/core`'s upload queue, read by both renderers
 * ([0130](../../../../docs/decisions/0130-each-file-is-its-own-upload.md)); this
 * draws it.
 */
export function FileField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const upload = useUploader()
  const queue = useUploadQueue(path, upload)
  const pending = useSyncExternalStore(queue.subscribe, queue.pending, queue.pending)
  const files = Array.isArray(field.value) ? (field.value as StoredFile[]) : []
  const [over, setOver] = useState(false)
  /**
   * Attachments taken out of the answer but not yet forgotten.
   *
   * Held with the position they came from, so undoing puts a file BACK where it
   * was rather than on the end — the order matters to somebody who numbered
   * their attachments in a covering note.
   */
  const [removed, setRemoved] = useState<ReadonlyArray<{ at: number; file: StoredFile }>>([])

  const accept = field.def.accept
  const multiple = field.def.maxItems === undefined || field.def.maxItems > 1

  const onPick = (picked: FileList | null): void => {
    if (picked === null || picked.length === 0 || upload === undefined) return
    queue.add(Array.from(picked))
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      {upload === undefined ? (
        <p data-formancy-part="file-unavailable">
          This form cannot accept files here, because no upload destination has been configured.
        </p>
      ) : (
        /*
         * The picker inside a drop target, not instead of one.
         *
         * Dropping is a pointer gesture with no keyboard equivalent, so it can
         * only ever be a SECOND route (WCAG 2.1.1). The input stays exactly as
         * it was and keeps the field's label and ARIA wiring; the region around
         * it accepts a drop and hands the files to the same function. Two routes,
         * one implementation.
         */
        <div
          data-formancy-part="file-dropzone"
          {...(over ? { 'data-state': 'over' } : {})}
          onDragOver={(event) => {
            // Without preventDefault the browser navigates to the file instead
            // of letting the page have it, which looks like the form vanishing.
            event.preventDefault()
            if (field.disabled) return
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            if (field.disabled) return
            onPick(event.dataTransfer.files)
          }}
        >
          {/* Open while files upload: a second file joins the queue rather than
              waiting for the first to be remembered before it can be picked. */}
          <input
            {...field.controlProps}
            type="file"
            multiple={multiple}
            {...(accept === undefined ? {} : { accept: accept.join(',') })}
            disabled={field.disabled}
            onChange={(event) => {
              onPick(event.target.files)
              event.target.value = ''
            }}
          />
        </div>
      )}

      {files.length === 0 && pending.length === 0 && removed.length === 0 ? null : (
        <ul data-formancy-part="file-list">
          {files.map((file, index) => (
            <li key={file.id} data-formancy-part="file-item">
              <FileThumbnail source={queue.sourceOf(file.id)} />
              <span data-formancy-part="file-name">{file.name}</span>
              {/* Absent at the ends rather than disabled, as a repeater row's are: a
                  disabled button still announces a control that does nothing. The
                  position is in the name, so nobody counts rows before pressing. */}
              {index > 0 ? (
                <button
                  type="button"
                  data-formancy-part="file-up"
                  disabled={field.disabled}
                  onClick={() => field.setValue(moved(files, index, index - 1))}
                >
                  {`Move ${file.name}, ${String(index + 1)} of ${String(files.length)}, up`}
                </button>
              ) : null}
              {index < files.length - 1 ? (
                <button
                  type="button"
                  data-formancy-part="file-down"
                  disabled={field.disabled}
                  onClick={() => field.setValue(moved(files, index, index + 1))}
                >
                  {`Move ${file.name}, ${String(index + 1)} of ${String(files.length)}, down`}
                </button>
              ) : null}
              <button
                type="button"
                disabled={field.disabled}
                onClick={() => {
                  // Out of the answer immediately, so a submit in between is
                  // correct, and remembered so it can come back.
                  setRemoved((before) => [...before, { at: index, file }])
                  field.setValue(files.filter((other) => other.id !== file.id))
                }}
              >
                {/* Named with the file, so a screen reader user hears which
                    attachment a button removes rather than "remove" six
                    times over. */}
                Remove {file.name}
              </button>
            </li>
          ))}

          {pending.map((entry) => (
            <PendingRow key={entry.key} entry={entry} queue={queue} disabled={field.disabled} />
          ))}

          {/*
           * A removed attachment stays visible with a way back.
           *
           * The bytes are still in storage until the unclaimed collector runs, so
           * the removal is recoverable for free — and a misclick on the wrong row
           * of six is the ordinary way somebody loses the evidence they came to
           * attach. A row that simply disappears offers no way to notice.
           */}
          {removed.map(({ at, file }) => (
            <li key={file.id} data-formancy-part="file-item" data-state="removed">
              <span data-formancy-part="file-name">{file.name}</span>
              <button
                type="button"
                disabled={field.disabled}
                onClick={() => {
                  setRemoved((before) => before.filter((other) => other.file.id !== file.id))
                  // Back where it was, not on the end: the order matters to
                  // somebody who numbered their attachments in a covering note.
                  const next = [...files]
                  next.splice(Math.min(at, next.length), 0, file)
                  field.setValue(next)
                }}
              >
                Undo removing {file.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* One polite region per field for the uploads' own progress: the form's
          error region belongs to validation, and an upload failure is not a
          validation error. */}
      <p role="status" data-formancy-part="file-status">
        {statusOf(pending)}
      </p>
    </FieldShell>
  )
}

/** The files with one moved a place. */
function moved(files: readonly StoredFile[], from: number, to: number): StoredFile[] {
  const next = [...files]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

/** A file not yet in the answer: waiting, being sent, or refused. */
function PendingRow({
  entry,
  queue,
  disabled,
}: {
  entry: PendingUpload
  queue: UploadQueue<File>
  disabled: boolean
}) {
  const failed = entry.state === 'failed'
  return (
    <li data-formancy-part="file-item" data-state={entry.state}>
      <span data-formancy-part="file-name">{entry.name}</span>
      {entry.state === 'waiting' ? <span data-formancy-part="file-waiting">Waiting</span> : null}
      {entry.state === 'uploading' ? (
        // Without a figure the bar is indeterminate, which is the truth about an
        // uploader that cannot measure — not a bar stuck at zero.
        <progress
          data-formancy-part="file-progress"
          aria-label={`Uploading ${entry.name}`}
          {...(entry.total === undefined ? {} : { value: entry.sent, max: entry.total })}
        />
      ) : null}
      {failed ? (
        <span data-formancy-part="file-error">Not attached: {entry.reason}</span>
      ) : null}
      {failed ? (
        <button type="button" disabled={disabled} onClick={() => queue.retry(entry.key)}>
          Try {entry.name} again
        </button>
      ) : null}
      <button type="button" disabled={disabled} onClick={() => queue.cancel(entry.key)}>
        {failed ? `Dismiss ${entry.name}` : `Cancel uploading ${entry.name}`}
      </button>
    </li>
  )
}

/** What the status region says: the file being sent, or the files refused, by name. */
function statusOf(pending: readonly PendingUpload[]): string {
  const sending = pending.find((entry) => entry.state === 'uploading')
  if (sending !== undefined) return `Uploading ${sending.name}…`
  const failed = pending.filter((entry) => entry.state === 'failed')
  if (failed.length === 1) return `${failed[0]!.name} was not attached: ${failed[0]!.reason ?? ''}`
  if (failed.length > 1) {
    return `${String(failed.length)} files were not attached: ${failed.map((entry) => entry.name).join(', ')}.`
  }
  return ''
}

/**
 * The field's upload queue — the form's, found by the row this control is drawn for,
 * so a row that moves and remounts its controls keeps its uploads (0130).
 *
 * This control supplies only the sending: the host's uploader, given an
 * `AbortSignal` for the queue's cancel, which `@formancy/core` has no type for.
 */
function useUploadQueue(wire: string, upload: Uploader | undefined): UploadQueue<File> {
  const engine = useFormEngine()
  const uploads = fieldUploads<File, StoredFile>(engine, wire)
  useEffect(() => {
    uploads.sender =
      upload === undefined
        ? undefined
        : (file, attempt, field) => {
            const controller = new AbortController()
            attempt.onCancel(() => controller.abort())
            return upload(file, {
              field,
              signal: controller.signal,
              onProgress: (sent, total) => attempt.progress(sent, total),
            })
          }
  }, [uploads, upload])
  return uploads.queue
}

/**
 * A picture of an image picked in this session, drawn from its bytes.
 *
 * **On a canvas, not an `<img>` on an object URL.** A URL is subject to the page's
 * `img-src`, and a strict policy without `blob:` shows a broken image — while this
 * product says a form runs under a strict CSP with no configuration. Decoding with
 * `createImageBitmap` and drawing the bitmap involves no URL at all.
 *
 * Only for a file picked here: a file stored before this page has no bytes in the
 * browser, and the renderer knows no address to fetch them from. Decorative — the
 * name beside it is what is read out.
 */
function FileThumbnail({ source }: { source: File | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawable =
    source !== undefined && source.type.startsWith('image/') && typeof createImageBitmap === 'function'

  useEffect(() => {
    if (!drawable) return
    let current = true
    createImageBitmap(source).then(
      (bitmap) => {
        const target = canvas.current
        if (current && target !== null) {
          // The core's size, which the Angular binding draws at too.
          const { width, height } = thumbnailSize(bitmap.width, bitmap.height)
          target.width = width
          target.height = height
          target.getContext('2d')?.drawImage(bitmap, 0, 0, target.width, target.height)
        }
        bitmap.close()
      },
      // An image the browser cannot decode gets no picture; its name is still there.
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [source, drawable])

  if (!drawable) return null
  return <canvas ref={canvas} data-formancy-part="file-thumbnail" aria-hidden="true" width={0} height={0} />
}
