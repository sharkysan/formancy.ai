import { createContext, useContext } from 'react'
import type { StoredFile } from '@formancy/spec'

/**
 * What the submission remembers about a file: the format's own declaration, since it is
 * part of the answer a `file` field stores and the server checks it (0189).
 */
export type { StoredFile } from '@formancy/spec'

/**
 * What the field tells an uploader about the file it is sending.
 *
 * An uploader that reads none of it still works — a function of the file alone is an
 * `Uploader` — and the field then shows the file as uploading with no figure, and a
 * cancel that stops waiting for it rather than stopping the transfer
 * ([0130](../../../docs/decisions/0130-each-file-is-its-own-upload.md)).
 */
export interface UploadOptions {
  /**
   * The field the file is for, at the data path a server reads — `items[].receipt` for
   * a file field in a repeater row, whichever row it is.
   */
  field: string
  /** Aborted when the person cancels this file. Hand it to `fetch` and the transfer stops. */
  signal: AbortSignal
  /** Bytes sent so far, of how many. `fetch` cannot report an upload's progress; XHR can. */
  onProgress: (sent: number, total: number) => void
}

/**
 * Uploads one file and reports what was stored.
 *
 * This package has no opinion about the destination: the same field works against local
 * disk, S3 or a customer's own service, and none of them is a dependency of a renderer.
 *
 * **Rejecting is a real answer**: the field says so out loud rather than dropping the
 * file, because a submission somebody believes carries their evidence and does not is
 * the worst outcome available here.
 */
export type Uploader = (file: File, options: UploadOptions) => Promise<StoredFile>

const UploaderContext = createContext<Uploader | undefined>(undefined)

export const UploaderProvider = UploaderContext.Provider

/**
 * The host's uploader, or undefined when there is none.
 *
 * Undefined is a supported state, not a misconfiguration: a form with no file
 * fields needs no uploader, and a file field without one renders read-only and
 * says why. The alternative — throwing — would turn a form that mostly works
 * into a blank page.
 */
export function useUploader(): Uploader | undefined {
  return useContext(UploaderContext)
}
