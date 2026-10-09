import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

import type { FileStore } from './file-store.js'
import { EMPTY_PAYLOAD_SHA256, signRequest } from './sigv4.js'

/**
 * Uploaded bytes in an S3-compatible object store.
 *
 * The second implementation of `FileStore`. The local one is right for a single
 * container with a volume and is the ceiling on everything above it: two replicas with
 * two volumes each accept uploads the other cannot serve, so any deployment past one
 * server needs this.
 *
 * **Not tied to Amazon.** The design calls for Garage, which is what the
 * integration test runs and what belongs in the compose file; the same code path
 * serves MinIO, Backblaze, Cloudflare R2 and real S3, because the only thing they
 * need in common is SigV4 and path-style addressing.
 *
 * **Bytes still pass through the server**, so the request body cap is the ceiling on a
 * file. A presigned PUT straight from the browser is the roadmap item that removes the
 * server from the data path; this replaces where the bytes land without touching how
 * they arrive.
 *
 * **No multipart.** A single PUT is one request, so the practical ceiling is whatever
 * the store accepts in one -- 5 GB for S3, and far above `FORMANCY_MAX_FILE_BYTES`.
 *
 * **The timeout bounds silence, not duration** -- for a download. It runs while the
 * store is being waited on, for the response headers and then for each chunk of the
 * body, and not while a chunk is in the caller's hands. A store that stops answering
 * is abandoned; a download that is still arriving is not, however long it takes.
 * `send` has the reasoning.
 *
 * **An upload is still bounded as a whole.** The store answers a PUT once it has the
 * entire body, so sending it falls inside the wait for the headers, and a PUT that
 * takes longer than the timeout is abandoned however steadily it is going. arc42
 * section 11 carries it as debt, and a test asserts the gap is still there, so that
 * closing it is deliberate.
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
   * How long the store may keep a request waiting before it is abandoned, in
   * milliseconds: for the response headers, and then for each chunk of the body.
   * A PUT's own body is sent inside the first of those, so it bounds an upload's
   * whole length.
   *
   * An object store that stops answering must not become a server that stops
   * answering. A bound on silence rather than on the whole request, because how
   * long a download takes is set by whoever is downloading it. Defaults to thirty
   * seconds, which is generous for a store that is working and still bounded for
   * one that is not.
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

  /**
   * One request, and the clock that abandons it.
   *
   * **The clock measures how long the store keeps us waiting.** It starts when the
   * request is sent and stops when the headers arrive -- which, for a PUT, is after
   * the whole body has gone. It starts again at once, because the store now owes the
   * body, stops when a chunk arrives, and starts again only when the caller asks for
   * the next one -- so a chunk the caller is still holding costs the store nothing.
   *
   * **Not `AbortSignal.timeout`, which is what this replaced.** That bounds the whole
   * exchange, body included, so a download still streaming when it ran out was cut
   * off mid-file however steadily it was arriving. And how long a download streams
   * is set by the person downloading it more than by the store: backpressure carries
   * a slow connection all the way back to this socket, so a bound on the whole
   * request was a bound on the downloader's bandwidth.
   *
   * The clock restarts at the headers rather than at the first read so that a body
   * nobody reads -- the error document on a path that throws -- is still abandoned
   * after `timeoutMs`, rather than holding its connection for however long something
   * else takes to close it.
   */
  const send = async (
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    key: string,
    body?: Buffer,
  ): Promise<Answer> => {
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

    const waiting = clock(timeoutMs, `S3 ${method} of ${key}`)
    waiting.start('no answer')
    const response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: new Uint8Array(body) }),
      signal: waiting.signal,
    }).finally(waiting.stop)

    const { ok, status, statusText } = response
    const answer = { ok, status, statusText, headers: response.headers }
    if (response.body === null) return { ...answer, body: null }
    waiting.start('no data')
    return { ...answer, body: timed(response.body, waiting) }
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
   * **404 only, and 403 deliberately not.** S3 answers 403 for an object a caller may
   * not list, but this caller owns the bucket -- so 403 means the credentials are
   * wrong, and reading that as absence would make a misconfigured deployment look like
   * one where every file has vanished and have the collector delete every row.
   */
  const isAbsent = (response: Answer): boolean => response.status === 404

  const failed = (method: string, key: string, response: Answer): Error =>
    new Error(`S3 ${method} of ${key} failed: ${String(response.status)} ${response.statusText}`)

  return {
    async put(key, bytes) {
      const response = await send('PUT', key, bytes)
      if (!response.ok) throw failed('PUT', key, response)
      // The body is an error document or nothing. Reading it releases the
      // connection back to the pool, which an undrained response does not.
      await discard(response.body)
    },

    async open(key) {
      const response = await send('GET', key)
      if (isAbsent(response)) {
        await discard(response.body)
        return undefined
      }
      if (!response.ok || response.body === null) throw failed('GET', key, response)
      // Streamed rather than buffered: a large attachment should not be held in
      // memory on its way to one downloader. A byte stream, as the local store's
      // is: in object mode it would hand out bare `Uint8Array`s rather than
      // `Buffer`s, and count what it buffers in chunks rather than in bytes.
      return Readable.from(response.body, { objectMode: false })
    },

    async remove(key) {
      const response = await send('DELETE', key)
      // Absent is success. A collector that crashed between deleting the bytes
      // and deleting the row has to be safe to run again.
      if (response.ok || isAbsent(response)) {
        await discard(response.body)
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
 * What the store answered.
 *
 * The status and headers of the `Response`, and its body only as `send` hands it
 * out. Read through the `Response` itself, a body is read without the clock
 * stopping between chunks -- which is the whole-request bound again, and the defect
 * `send` exists to avoid -- so the `Response` is not handed out at all.
 */
type Answer = Pick<Response, 'ok' | 'status' | 'statusText' | 'headers'> & {
  readonly body: AsyncIterable<Uint8Array> | null
}

/**
 * A clock for one request: started while the store owes something, stopped while it
 * does not, and aborting the request if it ever runs out. `owed` names what the
 * store failed to send, for the error that says so.
 */
function clock(timeoutMs: number, request: string) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = (): void => clearTimeout(timer)
  const start = (owed: string): void => {
    stop()
    timer = setTimeout(() => {
      controller.abort(new Error(`${request}: ${owed} within ${String(timeoutMs)} ms`))
    }, timeoutMs)
  }
  return { signal: controller.signal, start, stop }
}

/**
 * A body chunk by chunk, with the clock running only while the next chunk is awaited.
 *
 * An abort after the headers errors the body with the clock's reason, so a body the
 * clock ran out on fails rather than ending early and looking complete.
 */
async function* timed(
  stream: ReadableStream<Uint8Array>,
  waiting: ReturnType<typeof clock>,
): AsyncGenerator<Uint8Array> {
  try {
    for await (const chunk of stream) {
      waiting.stop()
      yield chunk
      waiting.start('no data')
    }
  } finally {
    waiting.stop()
  }
}

/** Reads a body to its end and drops it, which hands the connection back to the pool. */
async function discard(body: Answer['body']): Promise<void> {
  if (body === null) return
  for await (const _chunk of body) {
    // Nothing to keep: reaching the end is the point.
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
