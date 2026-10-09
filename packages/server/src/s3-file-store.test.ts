import { createServer } from 'node:http'
import type { IncomingMessage, RequestListener, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Writable } from 'node:stream'
import type { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { FileStore } from './file-store.js'
import { createS3FileStore } from './s3-file-store.js'

/**
 * The S3 store's request shape, against a server that only records.
 *
 * Deliberately not a fake S3. What this checks is the part a real S3 cannot
 * tell us about without being ambiguous: which URL was built, which method,
 * which headers, and what happens on each status code. A 404 from Garage and a
 * 404 from a typo in the path look identical from the outside, so the path is
 * asserted here and the signature is asserted against Garage itself in
 * `s3-file-store.integration.test.ts`.
 *
 * Every case that matters is a mapping a caller depends on:
 *
 * - `open` and `sizeOf` return `undefined` for a missing object rather than
 *   throwing, because the collector must be able to ask about bytes that may
 *   already be gone.
 * - `remove` treats a missing object as success, for the same reason: a
 *   collector that crashed between deleting bytes and deleting the row has to be
 *   safe to re-run.
 * - Everything else throws, because a 500 from the store silently treated as
 *   "no such file" is how a submission loses an attachment that still exists.
 */
let server: Server
let base: string
const seen: Array<{ method: string; url: string; headers: Record<string, string> }> = []
/** What the recording server answers next, per path. */
const answers = new Map<string, { status: number; body?: string; headers?: Record<string, string> }>()

beforeAll(async () => {
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    seen.push({
      method: request.method ?? '',
      url: request.url ?? '',
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([name, value]) => [name, String(value)]),
      ),
    })
    // Drain the body so a PUT completes rather than stalling on backpressure.
    request.resume()
    request.on('end', () => {
      const answer = answers.get(request.url ?? '') ?? { status: 200 }
      response.writeHead(answer.status, answer.headers ?? {})
      response.end(answer.body ?? '')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

function store() {
  return createS3FileStore({
    endpoint: base,
    bucket: 'formancy',
    region: 'garage',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  })
}

describe('createS3FileStore', () => {
  test('puts the object at bucket-then-key, path style', () => {
    // Path style rather than virtual host style, because that is what Garage and
    // every other self-hostable implementation speak, and it needs no DNS.
    seen.length = 0
    return store()
      .put('forms/abc/file-1', Buffer.from('hello'))
      .then(() => {
        expect(seen).toHaveLength(1)
        expect(seen[0]?.method).toBe('PUT')
        expect(seen[0]?.url).toBe('/formancy/forms/abc/file-1')
      })
  })

  test('signs every request, and declares the body hash S3 requires', async () => {
    seen.length = 0
    await store().put('k', Buffer.from('hello'))
    const headers = seen[0]?.headers ?? {}
    expect(headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//)
    // The hash of "hello", so the header is about the body and not a constant.
    expect(headers['x-amz-content-sha256']).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
    // The body reached the wire with a length. Asserted at the wire rather than
    // as a header the store sets, because the store deliberately sets neither:
    // undici rejects a manual `content-length` and computes its own.
    expect(headers['content-length']).toBe('5')
  })

  test('does not encode the slashes in a key, and does encode a space', async () => {
    // A key's slashes are path separators in the object name; encoding them
    // makes a different object. A space is the opposite: unencoded it is an
    // invalid request line, and `+` is a different key again.
    seen.length = 0
    await store().put('forms/a b/c', Buffer.from(''))
    expect(seen[0]?.url).toBe('/formancy/forms/a%20b/c')
  })

  test('returns undefined rather than throwing for an object that is not there', async () => {
    answers.set('/formancy/gone', { status: 404 })
    await expect(store().open('gone')).resolves.toBeUndefined()
    await expect(store().sizeOf('gone')).resolves.toBeUndefined()
    answers.delete('/formancy/gone')
  })

  test('treats a missing object as a successful delete', async () => {
    // A collector must be safe to re-run. S3 answers 204 for a delete of
    // something absent, but a proxy or another implementation may answer 404,
    // and both mean the bytes are gone.
    answers.set('/formancy/already-gone', { status: 404 })
    await expect(store().remove('already-gone')).resolves.toBeUndefined()
    answers.delete('/formancy/already-gone')
  })

  test('throws on a server error rather than reporting no such file', async () => {
    // The dangerous conflation. A 500 read as "absent" makes the collector
    // delete the database row for bytes that are still there, and makes a
    // download return empty for a file the person can see in the list.
    answers.set('/formancy/unlucky', { status: 500, body: '<Error/>' })
    await expect(store().open('unlucky')).rejects.toThrow(/500/)
    await expect(store().sizeOf('unlucky')).rejects.toThrow(/500/)
    await expect(store().remove('unlucky')).rejects.toThrow(/500/)
    answers.delete('/formancy/unlucky')
  })

  test('throws on a rejected signature rather than reporting no such file', async () => {
    // The one that would have shipped. An earlier version of the store treated
    // 403 as absence, on the reasoning that S3 answers 403 for an object a caller
    // may not list -- true, and about a restricted caller. This caller owns the
    // bucket, so a 403 means the credentials are wrong, and calling that absence
    // makes a misconfigured deployment indistinguishable from one where every
    // file has vanished. The collector would delete every row while every object
    // was still there.
    answers.set('/formancy/forbidden', { status: 403, body: '<Error/>' })
    await expect(store().open('forbidden')).rejects.toThrow(/403/)
    await expect(store().sizeOf('forbidden')).rejects.toThrow(/403/)
    await expect(store().remove('forbidden')).rejects.toThrow(/403/)
    answers.delete('/formancy/forbidden')
  })

  test('reads the size from the HEAD response', async () => {
    answers.set('/formancy/sized', { status: 200, headers: { 'content-length': '4096' } })
    await expect(store().sizeOf('sized')).resolves.toBe(4096)
    answers.delete('/formancy/sized')
  })

  test('refuses a key that would climb out of the bucket prefix', async () => {
    // Keys are minted by the server, so this cannot happen today. It is checked
    // anyway for the reason the local store checks it: a path check that only
    // runs while the input is trusted stops running the day somebody adds a
    // caller.
    await expect(store().put('../other-bucket/k', Buffer.from(''))).rejects.toThrow(/key/i)
    await expect(store().open('a/../../b')).rejects.toThrow(/key/i)
  })
})

/**
 * How long the store is waited on, against stores that are slow in each of the
 * ways that matter.
 *
 * Each case gets a server of its own rather than an answer from the recording one
 * above, because these hold connections open on purpose and the recording server
 * must not be left waiting on them.
 *
 * The timeouts are short so the suite stays quick, and every case carries its own
 * test timeout far below the file's two minutes: a bound that has gone missing
 * shows up as a hang, and a hang should fail in seconds.
 */
describe('how long the store is waited on', () => {
  const TIMEOUT_MS = 400

  test('lets a download finish that is still arriving after the timeout', async () => {
    // The defect this was written for. The timeout used to bound the whole
    // request, body included, so a file still streaming when it ran out was cut
    // off mid-download -- however steadily its bytes were arriving. Here the body
    // takes two and a half timeouts to arrive and no gap is longer than a quarter
    // of one, so a bound on silence lets it through and a bound on the total
    // does not.
    const CHUNKS = 10
    const GAP_MS = 100
    await withStore(
      (request, response) => {
        request.resume()
        response.writeHead(200, { 'content-type': 'application/octet-stream' })
        let sent = 0
        const tick = setInterval(() => {
          response.write(Buffer.alloc(16, sent))
          sent += 1
          if (sent === CHUNKS) {
            clearInterval(tick)
            response.end()
          }
        }, GAP_MS)
        response.on('close', () => clearInterval(tick))
      },
      async (store) => {
        const stream = await store.open('trickled')
        expect(stream).toBeDefined()
        // A byte stream, like the local store's and like this one before the
        // clock. The body is read through a generator now, and a stream made from
        // one is in object mode unless told otherwise -- which hands a caller
        // `Uint8Array`s where the local store hands it `Buffer`s, and buffers by
        // the chunk rather than by the byte.
        expect(stream!.readableObjectMode).toBe(false)
        const chunks: unknown[] = []
        for await (const chunk of stream!) chunks.push(chunk)
        expect(chunks.every((chunk) => Buffer.isBuffer(chunk))).toBe(true)
        const bytes = Buffer.concat(chunks as Buffer[])
        expect(bytes.length).toBe(16 * CHUNKS)
        expect(bytes.subarray(-16).equals(Buffer.alloc(16, CHUNKS - 1))).toBe(true)
      },
    )
  }, 10_000)

  test('lets a download finish whose reader is slower than the timeout', async () => {
    // The same defect from the other end, and the commoner one: what usually
    // makes a download slow is the person downloading it, and backpressure carries
    // their connection's pace all the way back to the store's socket. Here the
    // store sends everything at once and the reader pauses for twice the timeout
    // after its first chunk. The body is far larger than every buffer between the
    // two, so it cannot have arrived during the pause -- a clock running while
    // the reader holds a chunk cuts it off, one running only while the store is
    // waited on does not.
    const SIZE = 32 * 1024 * 1024
    await withStore(
      (request, response) => {
        request.resume()
        response.writeHead(200, { 'content-length': String(SIZE) })
        response.end(Buffer.alloc(SIZE, 1))
      },
      async (store) => {
        const stream = await store.open('large')
        expect(stream).toBeDefined()
        const chunks = stream![Symbol.asyncIterator]()
        const first = await chunks.next()
        let received = (first.value as Buffer).length
        await delay(TIMEOUT_MS * 2)
        for (let next = await chunks.next(); next.done !== true; next = await chunks.next()) {
          received += (next.value as Buffer).length
        }
        expect(received).toBe(SIZE)
      },
    )
  }, 10_000)

  test('abandons a store that never answers', async () => {
    // The guarantee the old timeout gave, which moving the clock must keep: an
    // object store that stops answering must not become a server that stops
    // answering. Every operation is asked, because each one waits on the store.
    await withStore(
      (request) => request.resume(),
      async (store) => {
        const unanswered = new RegExp(`no answer within ${String(TIMEOUT_MS)} ms`)
        await expect(store.open('silent')).rejects.toThrow(unanswered)
        await expect(store.put('silent', Buffer.from('x'))).rejects.toThrow(unanswered)
        await expect(store.sizeOf('silent')).rejects.toThrow(unanswered)
        await expect(store.remove('silent')).rejects.toThrow(unanswered)
      },
    )
  }, 10_000)

  test('abandons a store that stops sending halfway through a body', async () => {
    // The other half of that guarantee. Once the headers are in, the clock has to
    // start again for the body, or a store that answers and then goes quiet holds
    // a download -- and a connection -- open for ever. And the stream must end in
    // an error rather than simply end: a download that stops early and looks
    // complete is a truncated file handed over as the whole one.
    await withStore(
      (request, response) => {
        request.resume()
        response.writeHead(200, { 'content-length': '1024' })
        response.write(Buffer.alloc(16))
      },
      async (store) => {
        const stalled = new RegExp(`no data within ${String(TIMEOUT_MS)} ms`)
        const stream = await store.open('stalled')
        expect(stream).toBeDefined()
        await expect(readAll(stream!)).rejects.toThrow(stalled)
        // A PUT and a DELETE read their answer's body too, to hand the connection
        // back, and that read is waited on like any other.
        await expect(store.put('stalled', Buffer.from('x'))).rejects.toThrow(stalled)
        await expect(store.remove('stalled')).rejects.toThrow(stalled)
      },
    )
  }, 10_000)

  // Two bodies, because the client sees them differently. A few bytes leave it
  // waiting on the store. More than every buffer between the two leaves it waiting
  // on a reader that never comes, and paused -- the state in which undici's own
  // `bodyTimeout` does not fire, which is why it was not the bound used (0155).
  test.each([
    ['a few bytes', 16],
    ['more than every buffer', 4 * 1024 * 1024],
  ])('lets go of the connection under a body nobody reads: %s', async (_, sent) => {
    // A path that throws on the status never reads the error document behind it,
    // and an unread body holds its connection for as long as the store keeps it
    // open. The clock starts again when the headers arrive rather than when
    // somebody first reads, so the store's silence still ends it -- as the old
    // whole-request timeout did, which is the part of it worth keeping.
    //
    // Raced against a few timeouts rather than left to the case's own limit:
    // without the clock the connection was still closed eventually, by nothing in
    // the store, about eight seconds later when measured -- inside that limit.
    let markClosed!: () => void
    const closed = new Promise<'closed'>((resolve) => {
      markClosed = () => resolve('closed')
    })
    await withStore(
      (request, response) => {
        request.resume()
        response.on('close', markClosed)
        response.writeHead(500, { 'content-length': String(sent * 2) })
        response.write(Buffer.alloc(sent))
      },
      async (store) => {
        await expect(store.open('erroring')).rejects.toThrow(/500/)
        const still = delay(TIMEOUT_MS * 3).then(() => 'still open' as const)
        expect(await Promise.race([closed, still])).toBe('closed')
      },
    )
  }, 10_000)

  test('leaves no clock behind that keeps the process alive', async () => {
    // A clock is a deadline, not work, and a deadline must not be what keeps a
    // process up. One is left running whenever a body goes unread -- here a 500's
    // error document, complete on arrival, which `open` throws on without reading
    // -- until it runs out, thirty seconds in a deployment. `AbortSignal.timeout`,
    // which the clock replaced, was unref'd; an ordinary timer holds whatever
    // process the store lives in until it fires. The server's own entry point
    // exits explicitly and would not notice. Anything else would wait.
    const deadlines = (): number =>
      process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length
    await withStore(
      (request, response) => {
        request.resume()
        response.writeHead(500, { 'content-length': '8' })
        response.end('<Error/>')
      },
      async (store) => {
        const before = deadlines()
        await expect(store.open('erroring')).rejects.toThrow(/500/)
        expect(deadlines()).toBe(before)
      },
    )
  }, 10_000)

  test('still abandons an upload slower than the timeout: the gap this leaves', async () => {
    // Not a property anybody wants: the record of one this change does not fix,
    // so that fixing it has to be deliberate. A store answers a PUT once it has
    // the whole body, so sending the body falls inside the wait for the headers,
    // and an upload still going steadily is abandoned at the timeout exactly as a
    // download used to be. Here the store takes the body in small sips that last
    // well past it. arc42 section 11 carries this as debt.
    await withStore(
      (request, response) => {
        const sip = new Writable({
          highWaterMark: 1024,
          write: (_chunk, _encoding, next) => void setTimeout(next, 20),
        })
        request.pipe(sip).on('finish', () => {
          response.writeHead(200)
          response.end()
        })
      },
      async (store) => {
        await expect(store.put('large', Buffer.alloc(8 * 1024 * 1024))).rejects.toThrow(
          new RegExp(`no answer within ${String(TIMEOUT_MS)} ms`),
        )
      },
    )
  }, 10_000)

  /** Runs `use` against a store served by `answer`, and closes it whatever happens. */
  async function withStore(
    answer: RequestListener,
    use: (store: FileStore) => Promise<void>,
  ): Promise<void> {
    const stub = createServer(answer)
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
    try {
      await use(
        createS3FileStore({
          endpoint: `http://127.0.0.1:${String((stub.address() as AddressInfo).port)}`,
          bucket: 'formancy',
          region: 'garage',
          accessKeyId: 'AKIDEXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
          timeoutMs: TIMEOUT_MS,
        }),
      )
    } finally {
      // These servers hold requests open on purpose, and `close` alone waits
      // for every one of them to finish.
      stub.closeAllConnections()
      await new Promise<void>((resolve) => stub.close(() => resolve()))
    }
  }
})

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks)
}
