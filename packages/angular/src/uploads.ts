import { InjectionToken, inject } from '@angular/core'
import type { StoredFile } from '@formancy/spec'

/**
 * What the submission remembers about a file: the format's own declaration, since it is
 * part of the answer a `file` field stores and the server checks it (0189).
 */
export type { StoredFile } from '@formancy/spec'

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
  onProgress(this: void, sent: number, total: number): void
}

/**
 * Uploads one file and reports what was stored.
 *
 * This package has no opinion about the destination: the same field works against local
 * disk, S3 or a customer's own service, and none of them is a dependency of a renderer.
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
