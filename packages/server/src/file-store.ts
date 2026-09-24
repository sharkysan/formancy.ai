import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'

/**
 * Where uploaded bytes live.
 *
 * An interface with one implementation, because the second one is the point:
 * S3 or a customer's own service replaces this file and nothing else. The
 * use-cases in `@formancy/server-core` never see it at all — they decide what
 * is rubbish, and the host deletes it.
 *
 * Local disk is the default because `docker compose up` has to produce
 * something that works, and a self-hoster with one container and one volume is
 * the deployment this product is for. It is genuinely the weakest option: it
 * does not survive more than one replica, and the section below says so rather
 * than leaving somebody to find out.
 */
export interface FileStore {
  /** Write the bytes. The key was minted by the server, never by a client. */
  put(key: string, bytes: Buffer): Promise<void>
  /** Read them back, as a stream, so a large file is not held in memory. */
  open(key: string): Promise<Readable | undefined>
  /** Remove them. Missing is success: a collector must be safe to re-run. */
  remove(key: string): Promise<void>
  /** The size on disk, for checking the bytes match what was promised. */
  sizeOf(key: string): Promise<number | undefined>
}

/**
 * Bytes under one directory, one file per key.
 *
 * **Keys are checked, not trusted.** A key is minted by the server from a form
 * id and a file id, so it cannot contain a traversal — but this resolves it
 * and refuses anything landing outside the root regardless. A path check that
 * only runs when the input is untrusted is a path check that stops running the
 * day somebody adds a caller.
 */
export function createLocalFileStore(root: string): FileStore {
  const base = resolve(root)

  const pathFor = (key: string): string => {
    // Keys use forward slashes on every platform. Reject Windows separators
    // before native path resolution: POSIX treats them as filename characters.
    if (key.includes('\\')) {
      throw new Error(`Refusing a storage key that could resolve outside the store: ${key}`)
    }
    const full = resolve(join(base, key))
    // `startsWith(base)` alone matches `/data/formancy-evil` against
    // `/data/formancy`, so the separator is part of the test.
    if (full !== base && !full.startsWith(base + sep)) {
      throw new Error(`Refusing a storage key that resolves outside the store: ${key}`)
    }
    return full
  }

  return {
    async put(key, bytes) {
      const full = pathFor(key)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, bytes)
    },

    async open(key) {
      const full = pathFor(key)
      try {
        await stat(full)
      } catch {
        return undefined
      }
      return createReadStream(full)
    },

    async remove(key) {
      // `force` so a collector that ran twice, or crashed after deleting the
      // bytes and before deleting the row, is not an error the second time.
      await rm(pathFor(key), { force: true })
    },

    async sizeOf(key) {
      try {
        return (await stat(pathFor(key))).size
      } catch {
        return undefined
      }
    },
  }
}

/**
 * The checksum a receiver can compare against.
 *
 * Returned when the bytes are stored and never asked of the client: a checksum
 * the uploader computed is a checksum the uploader can lie about, so this one
 * is only useful for telling a *later* reader that the bytes have not changed.
 */
export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
