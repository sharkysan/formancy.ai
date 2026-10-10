import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * The keys the public plane hands out: a draft's and a response's, each an HMAC under the
 * deployment's signing key over what it opens.
 *
 * Stateless, the shape the proof-of-work challenge uses
 * ([0059](../../../docs/decisions/0059-proof-of-work-not-a-captcha.md)): handing one out is
 * public and unauthenticated, so it must not be a write — a key kept in a table is a table an
 * attacker fills by asking for keys they never use. Both in one file, so what each is signed
 * over can be read side by side, and nobody has to check two files to see that one cannot
 * stand in for the other.
 */
function signed(secret: string, message: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(message)))
}

/**
 * The key to a draft: HMAC over the form and the draft id
 * ([0062](../../../docs/decisions/0062-a-draft-carries-its-own-key.md)).
 *
 * Bound to the FORM as well as the id so a key cannot be carried to a draft of another form
 * that happens to share an id. The message is unchanged since 0.2.0, which is what keeps every
 * key handed out since then opening its draft.
 */
export function draftKey(secret: string, formId: string, draftId: string): string {
  return signed(secret, `${formId}:${draftId}`)
}

/**
 * The token a response is sent with: the id it will be stored under, and an HMAC over the form
 * and that id ([0169](../../../docs/decisions/0169-a-response-is-stored-once.md)).
 *
 * The id travels in the clear because the server has to read it back, and the signature is
 * what makes it the server's choice rather than the sender's. The message begins with a word a
 * form id never is, so a draft's key — signed over `form:draft` — is never also a valid
 * signature for a response with the same id, and the reverse.
 */
export function submissionToken(secret: string, formId: string, id: string): string {
  return `${id}.${signed(secret, `submission:${formId}:${id}`)}`
}

/**
 * The id a token names, when this server signed it for this form; otherwise undefined.
 *
 * Read from the LAST dot, since the signature is hex and the id is whatever `newId` minted. A
 * forged token, another form's, one signed under a key this server no longer has, and one that
 * is not a token at all are the same answer: no id.
 */
export function submissionTokenId(secret: string, formId: string, token: string): string | undefined {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return undefined
  const id = token.slice(0, dot)
  return sameToken(token, submissionToken(secret, formId, id)) ? id : undefined
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
