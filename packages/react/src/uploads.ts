import { createContext, useContext } from 'react'

/**
 * Where a file goes, and what the submission remembers about it.
 *
 * This package has no opinion about the destination, which is the point: the
 * same field works against local disk, S3, or a customer's own service, and
 * none of them has to be a dependency of a renderer. A host supplies one
 * function; everything else is the form's business.
 *
 * The bytes never pass through the submission. What is stored is what the file
 * *is* and where it went, so a submission read back years later is small,
 * readable on its own, and says what was attached even if the object store has
 * since been emptied.
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
 * Uploads one file and reports what was stored.
 *
 * Rejecting is a real answer: the field says so out loud rather than dropping
 * the file, because a submission somebody believes carries their evidence and
 * does not is the worst outcome available here.
 */
export type Uploader = (file: File) => Promise<StoredFile>

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
