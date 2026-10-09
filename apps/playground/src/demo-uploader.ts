import type { Uploader } from '@formancy/react'

/**
 * The playground's uploader. The bytes stay in this tab.
 *
 * A file field renders read-only without one and says there is nowhere to put a file,
 * which is correct and is also why the playground's file field did nothing: the app
 * provided a rich-text editor and no uploader, so the one field a visitor most wants to
 * try was the one they could not.
 *
 * This differs from the landing page's uploader on purpose. That one is a pitch and
 * records that the bytes went nowhere, because minting a plausible storage key would make
 * the demo read better and make the product look like it silently drops files. The
 * playground is a tool: somebody is here to find out what the format does, so the bytes
 * are kept for the session and the key says exactly where they are.
 *
 * **They are gone on reload, and the key says so.** `playground:in-this-tab/…` is not a
 * location any server would recognise, which is the honest thing to write in a submission
 * a visitor is about to read in the panel beside the form.
 *
 * What is NOT here is validation. `accept` and `maxFileSize` are the field's own, checked
 * by the engine before this is ever called, and a host uploader that re-checked them would
 * be a second opinion able to disagree with the first.
 */
const bytesInThisTab = new Map<string, Blob>()

let minted = 0

/** How much is copied at a time, which is how often progress is reported. */
const PIECE = 256 * 1024

/**
 * **The bytes are copied into the tab, in pieces, and the progress shown is the copy's.**
 * A picked `File` is a handle on a file on disk, not its bytes: keeping the handle would
 * keep nothing if the file changed or moved, so "kept for the session" was not true until
 * this read them. Reporting each piece makes the field's progress bar the progress of
 * real work rather than an animation, and the cancel button stops the copy (0130).
 */
export const playgroundUploader: Uploader = async (file, { signal, onProgress }) => {
  const pieces: ArrayBuffer[] = []
  for (let at = 0; at < file.size; at += PIECE) {
    if (signal.aborted) throw new Error('Cancelled.')
    pieces.push(await file.slice(at, at + PIECE).arrayBuffer())
    onProgress(Math.min(at + PIECE, file.size), file.size)
  }
  if (signal.aborted) throw new Error('Cancelled.')

  minted += 1
  const id = `tab-${String(minted)}`
  // Browsers leave this empty for a type they do not recognise, and a submission that
  // says nothing about what was attached is worse than one saying it could not tell.
  const contentType = file.type === '' ? 'application/octet-stream' : file.type
  bytesInThisTab.set(id, new Blob(pieces, { type: contentType }))

  return {
    id,
    name: file.name,
    size: file.size,
    contentType,
    storageKey: `playground:in-this-tab/${id}`,
  }
}
