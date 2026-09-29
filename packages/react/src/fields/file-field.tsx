import { useState } from 'react'
import { useField } from '../use-field.js'
import { useUploader } from '../uploads.js'
import type { StoredFile } from '../uploads.js'
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
 */
export function FileField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const upload = useUploader()
  const files = Array.isArray(field.value) ? (field.value as StoredFile[]) : []
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
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

  const onPick = async (picked: FileList | null): Promise<void> => {
    if (picked === null || picked.length === 0 || upload === undefined) return
    setBusy(true)
    setFailure(undefined)

    // Each file succeeds or fails on its own.
    //
    // The first version collected them into an array and set the value once, so
    // a throw on the third of five discarded the two that had ALREADY uploaded:
    // their bytes were in storage, the submission never mentioned them, the
    // collector reclaimed them within the day, and the person was told the
    // upload failed when half of it had not. Whose fault the failure is does not
    // change who loses the file.
    const uploaded: StoredFile[] = []
    const refused: string[] = []

    for (const file of Array.from(picked)) {
      try {
        uploaded.push(await upload(file))
      } catch (error) {
        refused.push(`${file.name} (${error instanceof Error ? error.message : String(error)})`)
      }
    }

    // Recorded before the failure is reported, so nothing that reached storage
    // is left unclaimed while somebody reads the message.
    if (uploaded.length > 0) field.setValue([...files, ...uploaded])

    if (refused.length > 0) {
      // Named, because "the upload failed" over a list of five attachments does
      // not say which one to try again.
      setFailure(
        refused.length === 1
          ? `${refused[0]!} was not attached.`
          : `${String(refused.length)} files were not attached: ${refused.join(', ')}.`,
      )
    }

    setBusy(false)
    field.touch()
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
            if (field.disabled || busy) return
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            if (field.disabled || busy) return
            void onPick(event.dataTransfer.files)
          }}
        >
          <input
            {...field.controlProps}
            type="file"
            multiple={multiple}
            {...(accept === undefined ? {} : { accept: accept.join(',') })}
            disabled={field.disabled || busy}
            onChange={(event) => {
              void onPick(event.target.files)
              event.target.value = ''
            }}
          />
        </div>
      )}

      {files.length === 0 && removed.length === 0 ? null : (
        <ul data-formancy-part="file-list">
          {files.map((file) => (
            <li key={file.id} data-formancy-part="file-item">
              <span>{file.name}</span>
              <button
                type="button"
                disabled={field.disabled}
                onClick={() => {
                  // Out of the answer immediately, so a submit in between is
                  // correct, and remembered so it can come back.
                  setRemoved((before) => [
                    ...before,
                    { at: files.findIndex((other) => other.id === file.id), file },
                  ])
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
              <span>{file.name}</span>
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

      {/* One polite region per field for the upload's own progress: the form's
          error region belongs to validation, and an upload failure is not a
          validation error. */}
      <p role="status" data-formancy-part="file-status">
        {busy ? 'Uploading…' : (failure ?? '')}
      </p>
    </FieldShell>
  )
}
