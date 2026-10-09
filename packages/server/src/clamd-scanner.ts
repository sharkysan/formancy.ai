import { connect } from 'node:net'
import type { Scanner, ScanVerdict } from '@formancy/server-core'

/** How much is sent per INSTREAM chunk. clamd takes chunks of any size up to its stream limit. */
const CHUNK = 64 * 1024

/**
 * clamd's own default `StreamMaxLength`, 100 MiB — as the `clamd.conf` ClamAV 1.5.4 ships
 * says, and as measured against it: a 90 MiB stream was answered, a 110 MiB one refused.
 */
export const CLAMD_DEFAULT_MAX_BYTES = 100 * 1024 * 1024

/**
 * ClamAV's daemon, asked over its INSTREAM command
 * ([0131](../../../docs/decisions/0131-an-upload-is-scanned-before-it-is-kept.md)).
 *
 * The protocol is clamd's own and small enough to speak directly — the command, the bytes in
 * length-prefixed chunks, a zero-length chunk to end them, and one line back — so this adds
 * no dependency to the server. Its tests run against a stand-in that speaks the protocol as
 * clamd's manual describes it; it was run once against ClamAV 1.5.4 itself, and the
 * documentation says what that showed and what it did not.
 *
 * **Only `stream: OK` is clean.** A finding is refused by its name. A file over clamd's size
 * limit is refused too, because sending it again changes nothing. Anything else — an answer
 * this does not understand, no answer, no daemon — rejects, which the use-case reads as a
 * scanner that cannot be asked, and refuses the file for.
 *
 * **`maxBytes` is clamd's `StreamMaxLength`, and is checked before a byte is sent.** Past
 * it, clamd says so and closes the connection while bytes may still be arriving. Against the
 * stand-in the bytes in flight reset it and the answer was lost to `ECONNRESET`, which reads
 * as a scanner that is down and would tell the person to try again forever; the real clamd
 * measured here answered intact. Checked first, the outcome does not depend on which.
 * Set it to what clamd is configured with.
 *
 * **`timeoutMs` is for silence, not for the whole scan.** It is the socket's idle timeout,
 * restarted by any traffic on the connection, so it abandons a clamd that has stopped
 * answering and not a scan that is still moving. Nothing here bounds how long a scan takes,
 * which is why the lease a request holds a file under can be outlasted (0153).
 */
export function createClamdScanner({
  host,
  port,
  maxBytes = CLAMD_DEFAULT_MAX_BYTES,
  timeoutMs = 30_000,
}: {
  host: string
  port: number
  maxBytes?: number
  timeoutMs?: number
}): Scanner {
  return {
    scan: (_file, bytes) =>
      new Promise<ScanVerdict>((resolve, reject) => {
        if (bytes.byteLength > maxBytes) {
          resolve({
            clean: false,
            finding: `could not be scanned: larger than the scanner accepts (${String(maxBytes)} bytes)`,
          })
          return
        }
        const socket = connect({ host, port })
        const answer: Buffer[] = []
        let failure: Error | undefined

        socket.setTimeout(timeoutMs, () =>
          socket.destroy(
            new Error(
              `clamd at ${host}:${String(port)} did not answer within ${String(timeoutMs)} ms`,
            ),
          ),
        )
        socket.on('connect', () => {
          socket.write('zINSTREAM\0')
          for (let at = 0; at < bytes.byteLength; at += CHUNK) {
            const piece = bytes.subarray(at, at + CHUNK)
            const length = Buffer.alloc(4)
            length.writeUInt32BE(piece.byteLength)
            socket.write(length)
            socket.write(piece)
          }
          // The zero-length chunk that ends the stream. Written, not `end()`ed: clamd
          // answers on the same connection and closes it itself.
          socket.write(Buffer.alloc(4))
        })
        socket.on('data', (data) => answer.push(data))
        // Kept rather than rejected on: clamd past its size limit answers and hangs up
        // while bytes are still being written, and the answer is what counts.
        socket.on('error', (error) => {
          failure = error
        })
        socket.on('close', () => {
          const reply = Buffer.concat(answer).toString('utf8').replace(/\0+$/, '').trim()
          if (reply === '') {
            reject(
              failure ?? new Error(`clamd at ${host}:${String(port)} closed without answering`),
            )
            return
          }
          const verdict = verdictOf(reply)
          if (verdict === undefined)
            reject(new Error(`clamd answered something unexpected: ${reply}`))
          else resolve(verdict)
        })
      }),
  }
}

function verdictOf(reply: string): ScanVerdict | undefined {
  if (reply === 'stream: OK') return { clean: true }
  const found = /^stream: (.+) FOUND$/.exec(reply)
  if (found !== null) return { clean: false, finding: found[1]! }
  if (/size limit exceeded/i.test(reply)) {
    return { clean: false, finding: `could not be scanned: ${reply.replace(/\.?\s*ERROR$/, '')}` }
  }
  return undefined
}
