import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * The public plane's keys: a draft's and a submission's, each an HMAC under the deployment's
 * signing key over what it opens.
 *
 * Stateless, the shape the proof-of-work challenge uses
 * ([0059](../../../docs/decisions/0059-proof-of-work-not-a-captcha.md)): handing one out is
 * public and unauthenticated, so it must not be a write — a key kept in a table is a table an
 * attacker fills by asking for keys they never use. One file, so the two keys share one HMAC
 * and one comparison rather than each carrying its own copy of both.
 */
export function signed(secret: string, message: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(message)))
}

/**
 * Compared in constant time.
 *
 * A byte-at-a-time comparison that returns early leaks how much of a guess was
 * right, and a token is guessed one byte at a time by exactly that signal.
 */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let differences = 0
  for (let at = 0; at < a.length; at += 1) {
    differences |= a.charCodeAt(at) ^ b.charCodeAt(at)
  }
  return differences === 0
}
