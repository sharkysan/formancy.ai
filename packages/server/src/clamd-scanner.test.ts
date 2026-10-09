import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'
import { createClamdScanner } from './clamd-scanner.js'

/**
 * The ClamAV adapter (0131), against a stand-in for clamd.
 *
 * **Not a real clamd**: CI runs none, and one takes minutes to load its signatures. The
 * stand-in reads one INSTREAM as clamd's manual describes it — the command, chunks each
 * preceded by its length as a four-byte big-endian integer, a zero-length chunk to end
 * them — and answers as clamd does. What it proves is that the bytes are framed so they
 * arrive intact, and that every answer is read the way the decision needs: only `OK` is
 * clean.
 */
const closers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

const file = { name: 'a.pdf', contentType: 'application/pdf', size: 0 }

/**
 * Starts the stand-in; `answer` sees the bytes it received, and may say nothing at all.
 * `limit` is its stream limit; `paceMs` sends the answer a byte at a time, that far apart.
 */
async function clamd(
  answer: (bytes: Buffer) => string | undefined,
  { limit = Infinity, paceMs }: { limit?: number; paceMs?: number } = {},
) {
  const received: Buffer[] = []
  const server = createServer((socket) => {
    let pending = Buffer.alloc(0)
    let commanded = false
    const pieces: Buffer[] = []
    socket.on('error', () => undefined)
    socket.on('data', (data) => {
      pending = Buffer.concat([pending, data])
      if (!commanded) {
        const end = pending.indexOf(0)
        if (end < 0) return
        if (pending.subarray(0, end).toString() !== 'zINSTREAM') {
          socket.end('UNKNOWN COMMAND\0')
          return
        }
        commanded = true
        pending = pending.subarray(end + 1)
      }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0)
        if (length === 0) {
          const bytes = Buffer.concat(pieces)
          received.push(bytes)
          const reply = answer(bytes)
          if (reply === undefined) return
          if (paceMs === undefined) {
            socket.end(`${reply}\0`)
            return
          }
          const trickle = (at: number): void => {
            if (at === reply.length) {
              socket.end('\0')
              return
            }
            socket.write(reply[at]!)
            setTimeout(() => trickle(at + 1), paceMs)
          }
          trickle(0)
          return
        }
        if (pending.length < 4 + length) return
        pieces.push(pending.subarray(4, 4 + length))
        pending = pending.subarray(4 + length)
        if (pieces.reduce((sum, piece) => sum + piece.length, 0) > limit) {
          // What clamd does past its StreamMaxLength: says so, and hangs up mid-stream.
          socket.end('INSTREAM size limit exceeded. ERROR\0')
          return
        }
      }
    })
  })
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
  closers.push(() => new Promise((closed) => server.close(() => closed())))
  return { port: (server.address() as AddressInfo).port, received }
}

describe('the ClamAV scanner', () => {
  test('sends the bytes so they arrive as they were, across many chunks, and OK is clean', async () => {
    const daemon = await clamd(() => 'stream: OK')
    const bytes = Buffer.from(Array.from({ length: 200_000 }, (_, at) => at % 251))

    const verdict = await createClamdScanner({ host: '127.0.0.1', port: daemon.port }).scan(
      file,
      bytes,
    )

    expect(verdict).toEqual({ clean: true })
    expect(daemon.received[0]?.equals(bytes)).toBe(true)
  })

  test('a finding is refused, by the name clamd gives it', async () => {
    const daemon = await clamd(() => 'stream: Eicar-Test-Signature FOUND')

    const verdict = await createClamdScanner({ host: '127.0.0.1', port: daemon.port }).scan(
      file,
      Buffer.from('anything'),
    )

    expect(verdict).toEqual({ clean: false, finding: 'Eicar-Test-Signature' })
  })

  test('a file over the scanner’s limit is refused without being sent', async () => {
    // Measured against the stand-in, which does what clamd's manual says it does past its
    // stream limit — answers and closes mid-stream: the bytes still in flight reset the
    // connection, and the answer was lost to ECONNRESET. Read as a scanner that is down,
    // the person would be told to try again, forever. So the limit is known here, and
    // checked first.
    const daemon = await clamd(() => 'stream: OK', { limit: 1000 })

    const verdict = await createClamdScanner({
      host: '127.0.0.1',
      port: daemon.port,
      maxBytes: 1000,
    }).scan(file, Buffer.alloc(200_000))

    expect(verdict).toEqual({
      clean: false,
      finding: 'could not be scanned: larger than the scanner accepts (1000 bytes)',
    })
    expect(daemon.received).toEqual([])
  })

  test('and clamd saying its limit was exceeded is a refusal too, when the answer arrives', async () => {
    const daemon = await clamd(() => 'INSTREAM size limit exceeded. ERROR')

    const verdict = await createClamdScanner({ host: '127.0.0.1', port: daemon.port }).scan(
      file,
      Buffer.from('x'),
    )

    expect(verdict).toEqual({
      clean: false,
      finding: 'could not be scanned: INSTREAM size limit exceeded',
    })
  })

  test('an answer it does not understand is never taken for clean', async () => {
    const daemon = await clamd(() => 'PONG')

    await expect(
      createClamdScanner({ host: '127.0.0.1', port: daemon.port }).scan(file, Buffer.from('x')),
    ).rejects.toThrow(/PONG/)
  })

  test('no daemon listening is a scanner that cannot be asked', async () => {
    const daemon = await clamd(() => 'stream: OK')
    await closers.splice(0)[0]!()

    await expect(
      createClamdScanner({ host: '127.0.0.1', port: daemon.port }).scan(file, Buffer.from('x')),
    ).rejects.toThrow()
  })

  test('and neither is one that never answers, after the time it is given', async () => {
    const daemon = await clamd(() => undefined)

    await expect(
      createClamdScanner({ host: '127.0.0.1', port: daemon.port, timeoutMs: 200 }).scan(
        file,
        Buffer.from('x'),
      ),
    ).rejects.toThrow(/did not answer within 200 ms/)
  })

  test('its time limit is for silence, not for the whole scan', async () => {
    // An answer a byte at a time: each gap well inside the limit, the whole well past it.
    // 0153 and hazard B10 rest on this — the adapter abandons a clamd that has gone quiet,
    // not a scan that is still moving, so nothing supplied keeps a scan inside the two
    // minutes a request holds a file for. Made a deadline, this fails, and those documents
    // are wrong in the other direction.
    const daemon = await clamd(() => 'stream: OK', { paceMs: 40 })
    const started = Date.now()

    const verdict = await createClamdScanner({
      host: '127.0.0.1',
      port: daemon.port,
      timeoutMs: 150,
    }).scan(file, Buffer.from('x'))

    expect(verdict).toEqual({ clean: true })
    expect(Date.now() - started).toBeGreaterThan(150)
  })
})
