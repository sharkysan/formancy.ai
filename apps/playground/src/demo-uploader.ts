import type { StoredFile, Uploader } from '@formancy/react'

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
const bytesInThisTab = new Map<string, File>()

let minted = 0

export const playgroundUploader: Uploader = (file: File): Promise<StoredFile> => {
  minted += 1
  const id = `tab-${String(minted)}`
  bytesInThisTab.set(id, file)

  return Promise.resolve({
    id,
    name: file.name,
    size: file.size,
    // Browsers leave this empty for a type they do not recognise, and a submission that
    // says nothing about what was attached is worse than one saying it could not tell.
    contentType: file.type === '' ? 'application/octet-stream' : file.type,
    storageKey: `playground:in-this-tab/${id}`,
  })
}

/** The bytes of a file this session accepted, while the tab is open. */
export function fileInThisTab(id: string): File | undefined {
  return bytesInThisTab.get(id)
}
