import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

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
