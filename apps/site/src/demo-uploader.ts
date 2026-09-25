import type { StoredFile, Uploader } from '@formancy/react'

/**
 * The landing page's uploader. Nothing leaves the browser.
 *
 * The file field needs somewhere to put bytes, and this page has no server —
 * it is a static site, deliberately, because a landing page that needs a
 * database to render is a landing page that goes down. So the demo records
 * what a file *is* and admits in the storage key that the bytes went nowhere.
 *
 * Honest rather than convincing: a visitor who attaches a file here has not
 * sent us anything, the page says so beside the field, and `storageKey` says
 * so again to anyone who opens the submission panel. Minting a plausible-
 * looking key would make the demo read better and make the product look like
 * it silently drops files.
 */
let minted = 0

export const demoUploader: Uploader = (file: File): Promise<StoredFile> => {
  minted += 1
  return Promise.resolve({
    id: `demo-${String(minted)}`,
    name: file.name,
    size: file.size,
    // Browsers leave this empty for a type they do not recognise, and a
    // submission that says nothing about what was attached is worse than one
    // that says it could not tell.
    contentType: file.type === '' ? 'application/octet-stream' : file.type,
    storageKey: 'demo:nothing-was-uploaded',
  })
}
