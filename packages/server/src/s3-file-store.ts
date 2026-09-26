import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

import type { FileStore } from './file-store.js'
import { EMPTY_PAYLOAD_SHA256, signRequest } from './sigv4.js'

/**
 * Uploaded bytes in an S3-compatible object store.
 *
 * The second implementation of `FileStore`, which is what that interface existed
 * for. The local one is right for a single container with a volume and is the
 * ceiling on everything above it: two replicas with two volumes each accept
 * uploads the other cannot serve, so *any* deployment that scales past one
 * server needs this, and until now the answer was "designed, not built".
 *
 * **Not tied to Amazon.** The design calls for Garage, which is what the
 * integration test runs and what belongs in the compose file; the same code path
 * serves MinIO, Backblaze, Cloudflare R2 and real S3, because the only thing they
 * need in common is SigV4 and path-style addressing.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * **Bytes still pass through the server.** The design's eventual shape is a
 * presigned PUT straight from the browser, with the server claiming the object
 * afterwards -- which removes the server from the data path entirely and is the
 * only way to accept a file larger than the request body cap. That is a change to
 * the upload flow end to end, including both renderers, and it is a separate
 * piece of work. This one replaces where the bytes land without touching how they
 * arrive, which is the smaller half and the one that unblocks a second replica.
 *
 * **No multipart.** A single PUT is one request, so the practical ceiling is
 * whatever the store accepts in one -- 5 GB for S3, and in any case far above
 * `FORMANCY_MAX_FILE_BYTES`. Resumability is the roadmap item, not this.
 */
export interface S3FileStoreConfig {
  /** Base URL of the endpoint, e.g. `http://garage:3900` or an S3 regional URL. */
  readonly endpoint: string
  readonly bucket: string
  /** Garage answers to any region name; real S3 does not. */
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  /**
   * How long one request may take before it is abandoned, in milliseconds.
   *
   * An object store that stops answering must not become a server that stops
   * answering. Defaults to thirty seconds, which is generous for one object and
   * still bounded.
   */
  readonly timeoutMs?: number
}

export function createS3FileStore(config: S3FileStoreConfig): FileStore {
  const endpoint = config.endpoint.replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs ?? 30_000

  /**
   * The object's URL, with the key's slashes kept and everything else encoded.
   *
   * A key is a path inside the bucket, so its separators are structural. Every
   * other character has to be encoded or the request line is invalid -- and a
   * space encoded as `+`, which is what form encoding would do, names a
   * different object.
   */
  const urlFor = (key: string): URL => {
    if (key === '' || key.includes('\\') || key.split('/').includes('..')) {
      // Keys are minted by the server today. Checked anyway, because the local
      // store checks it and the two must not disagree about what is legal.
      throw new Error(`Refusing a storage key that could address another bucket: ${key}`)
    }
    const path = key.split('/').map(encodeSegment).join('/')
    return new URL(`${endpoint}/${encodeSegment(config.bucket)}/${path}`)
  }

  const send = async (
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    key: string,
    body?: Buffer,
  ): Promise<Response> => {
    const url = urlFor(key)
    const payloadHash =
      body === undefined
        ? EMPTY_PAYLOAD_SHA256
        : createHash('sha256').update(body).digest('hex')

    // `content-length` is deliberately neither signed nor set. undici refuses a
    // manually supplied one -- `InvalidArgumentError: invalid content-length
    // header` -- and computes its own from the body, so setting it is both
    // impossible and unnecessary. Nothing is lost by not signing it: AWS requires
    // only `host` and the `x-amz-*` headers in the signature, and
    // `x-amz-content-sha256` is a hash of the exact bytes, which constrains the
    // length far more tightly than a signed length would.
    const headers = signRequest({
      method,
      url,
      headers: { host: url.host },
      payloadHash,
      service: 's3',
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      now: new Date(),
    })

    return fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: new Uint8Array(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  }

  /**
   * A status that means "there is no such object", as opposed to one that means
   * the store could not answer.
   *
   * The distinction is the whole reason this is a named function. Reading a
   * could-not-answer as absence makes the collector delete the row for bytes that
   * still exist and makes a download return nothing for a file the person can see
   * listed.
   *
   * **404 only, and 403 deliberately not.** The first version of this included
   * 403, because S3 answers 403 rather than 404 for an object a caller may not
   * list. That reasoning is about a restricted caller, and this caller owns the
   * bucket -- so in practice 403 means the credentials are wrong, and treating
   * that as absence makes a misconfigured deployment look like one where every
   * file has vanished. The collector would then delete every row while every
   * object was still there. A rare unhelpful error beats that, by a wide margin.
   */
  const isAbsent = (response: Response): boolean => response.status === 404

  const failed = (method: string, key: string, response: Response): Error =>
    new Error(`S3 ${method} of ${key} failed: ${String(response.status)} ${response.statusText}`)

  return {
    async put(key, bytes) {
      const response = await send('PUT', key, bytes)
      if (!response.ok) throw failed('PUT', key, response)
      // The body is an error document or nothing. Reading it releases the
      // connection back to the pool, which an undrained response does not.
      await response.arrayBuffer()
    },

    async open(key) {
      const response = await send('GET', key)
      if (isAbsent(response)) {
        await response.arrayBuffer()
        return undefined
      }
      if (!response.ok || response.body === null) throw failed('GET', key, response)
      // Streamed rather than buffered: a large attachment should not be held in
      // memory on its way to one downloader.
      return Readable.fromWeb(response.body)
    },

    async remove(key) {
      const response = await send('DELETE', key)
      // Absent is success. A collector that crashed between deleting the bytes
      // and deleting the row has to be safe to run again.
      if (response.ok || isAbsent(response)) {
        await response.arrayBuffer()
        return
      }
      throw failed('DELETE', key, response)
    },

    async sizeOf(key) {
      const response = await send('HEAD', key)
      if (isAbsent(response)) return undefined
      if (!response.ok) throw failed('HEAD', key, response)
      const length = response.headers.get('content-length')
      // A store that answered without a length cannot be used to check that the
      // bytes match what was promised, and pretending it said zero would fail
      // that check by declaring the file empty.
      if (length === null) throw new Error(`S3 HEAD of ${key} returned no content-length.`)
      return Number(length)
    },
  }
}

/**
 * AWS's `UriEncode` for one path segment.
 *
 * `encodeURIComponent` leaves `!'()*` alone and S3 wants them encoded, and its
 * hex digits are already uppercase. Duplicated from the signer rather than
 * shared, because the signer's copy is about hashing and this one is about the
 * request line: if they ever need to differ, they differ, and a shared helper
 * would make that a conversation instead of an edit.
 */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}
