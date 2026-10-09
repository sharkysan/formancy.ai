import { InjectionToken, inject } from '@angular/core'

/**
 * Where a file goes, and what the submission remembers about it.
 *
 * The same contract the React binding uses, with the same reasoning: this
 * package has no opinion about the destination, so the one field works against
 * local disk, S3 or a customer's own service without any of them becoming a
 * dependency of a renderer.
 *
 * The bytes never pass through the submission. What is stored is what the file
 * *is* and where it went, so a submission read back years later is small and
 * says what was attached even if the object store has since been emptied.
 */
export interface StoredFile {
  /** Stable within the submission; how a row is keyed and removed. */
  id: string
  name: string
  size: number
  contentType: string
  /** Where the bytes are, in whatever the host's storage calls a location. */
  storageKey: string
}

/**
 * What the field tells an uploader about the file it is sending — the React
 * binding's contract, field for field.
 *
 * An uploader that reads none of it still works: the file is shown uploading with
 * no figure, and a cancel stops waiting for it rather than stopping the transfer
 * ([0130](../../../docs/decisions/0130-each-file-is-its-own-upload.md)).
 */
export interface UploadOptions {
  /** The field the file is for, at the data path a server reads: `items[].receipt` in a row. */
  field: string
  /** Aborted when the person cancels this file. Hand it to `fetch` and the transfer stops. */
  signal: AbortSignal
  /** Bytes sent so far, of how many. `fetch` cannot report an upload's progress; XHR can. */
  onProgress(sent: number, total: number): void
}

/**
 * Uploads one file and reports what was stored.
 *
 * Rejecting is a real answer: the field says so out loud rather than dropping
 * the file, because a submission somebody believes carries their evidence and
 * does not is the worst outcome available here.
 */
export type Uploader = (file: File, options: UploadOptions) => Promise<StoredFile>

/**
 * Optional by design. A form with no file fields needs no uploader, and a file
 * field without one renders read-only and says why — which beats turning a
 * form that mostly works into a failed injection.
 */
export const FORMANCY_UPLOADER = new InjectionToken<Uploader>('formancy.uploader')

export function injectUploader(): Uploader | null {
  return inject(FORMANCY_UPLOADER, { optional: true })
}

/** Providing one, for a host that has somewhere to put bytes. */
export function provideFormancyUploader(upload: Uploader) {
  return { provide: FORMANCY_UPLOADER, useValue: upload }
}
