import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * @formancy/challenge — the proof-of-work challenge, in one place.
 *
 * ── WHY THIS IS ITS OWN PACKAGE ─────────────────────────────────────────────
 *
 * The scheme is used in two places that could not otherwise share code: the
 * server mints and verifies, and a browser solves. Putting the solver in a
 * renderer and the verifier in `server-core` would be two descriptions of one
 * protocol, and the day they disagreed the symptom would be submissions the
 * server rejects for no visible reason — which reads as an attack rather than
 * as a bug.
 *
 * So there is one description, one implementation of the hash, and it runs in
 * both places. That is the same argument the engine makes about validation,
 * applied to a smaller thing.
 *
 * ── WHY NOT WEB CRYPTO ──────────────────────────────────────────────────────
 *
 * It was `crypto.subtle` first, which needs nothing from npm and is in every
 * browser. Measuring it killed the idea: **100,000 hashes take 269ms
 * synchronously and about 4,800ms through `crypto.subtle`**, because every
 * candidate pays an await and a call boundary rather than the hash itself.
 *
 * That is not merely slow, it is the wrong way round. The cost is supposed to
 * fall on somebody submitting a thousand forms; an attacker writes the fast
 * synchronous loop, so the only person paying the 18x overhead is the visitor
 * using the solver we published. **A proof of work where the defender pays
 * more than the attacker is worse than none**, because it buys nothing and
 * charges the wrong person for it.
 *
 * So the hash is `@noble/hashes`: audited, no dependencies of its own, works
 * in a browser, and already in this repository's tree. `solveChallenge` stays
 * asynchronous, but only so it can yield — the hashing inside it does not
 * wait for anything.
 *
 * ── WHAT THE SCHEME IS ──────────────────────────────────────────────────────
 *
 * The server picks a secret number below a ceiling, publishes
 * `sha256(salt + number)` and the salt, and signs that hash with a key only it
 * has. A browser searches upwards from zero until the hash matches. The server
 * recomputes and checks its own signature.
 *
 * Verification is therefore stateless: **a challenge nobody minted cannot be
 * solved into a valid one**. The expiry rides in the salt, so a stale one is
 * refused without a lookup. Replay is the one thing this cannot decide — a
 * correct solution stays correct — and is the caller's to handle with storage.
 */

export interface Challenge {
  /** Named so a future scheme can be told apart from this one. */
  readonly algorithm: 'SHA-256'
  /** Random, and carrying the expiry as `<hex>.<epochSeconds>`. */
  readonly salt: string
  /** `sha256(salt + number)`, hex. What the browser is searching for. */
  readonly challenge: string
  /** The ceiling the secret number was drawn below. */
  readonly maxNumber: number
  /** HMAC of `challenge` under the server's key. Proves we minted it. */
  readonly signature: string
}

/** What a browser sends back. */
export interface Solution {
  readonly algorithm?: string
  readonly salt: string
  readonly number: number
  readonly challenge: string
  readonly signature: string
}

/**
 * How hard the puzzle is.
 *
 * A hundred thousand hashes, measured at 269ms rather than guessed at. That is
 * unnoticeable beside the time somebody spent filling the form in, and it is
 * only true of the synchronous hash — the same ceiling took about 4,800ms
 * through `crypto.subtle`, which is why that went. Raising it punishes the
 * slowest device far more than the attacker, who has the fastest one — the
 * trap every difficulty knob in this category falls into.
 */
export const DEFAULT_MAX_NUMBER = 100_000

/** How long a minted challenge stays solvable. */
export const CHALLENGE_TTL_SECONDS = 600

/** `sha256(salt + number)` as hex. The one definition of the scheme's hash. */
export function hashOf(salt: string, number: number): string {
  return bytesToHex(sha256(utf8ToBytes(`${salt}${String(number)}`)))
}

export interface MintOptions {
  /** The signing key. */
  readonly secret: string
  readonly nowSeconds: number
  readonly maxNumber?: number
  /** Injected only so a test can be deterministic; defaults to real entropy. */
  readonly randomBytes?: (length: number) => Uint8Array
}

export function mintChallenge(options: MintOptions): Challenge {
  const maxNumber = options.maxNumber ?? DEFAULT_MAX_NUMBER
  const random = options.randomBytes ?? realRandomBytes
  const expires = options.nowSeconds + CHALLENGE_TTL_SECONDS
  const salt = `${bytesToHex(random(16))}.${String(expires)}`

  // From real entropy rather than `Math.random`, for the same reason the salt
  // is: a predictable secret number is a challenge already solved.
  const number = numberFrom(random(8), maxNumber)
  const challenge = hashOf(salt, number)

  return {
    algorithm: 'SHA-256',
    salt,
    challenge,
    maxNumber,
    signature: sign(options.secret, challenge),
  }
}

export type VerifyOutcome =
  | { readonly ok: true; readonly challenge: string; readonly expiresAtSeconds: number }
  | { readonly ok: false; readonly reason: 'malformed' | 'expired' | 'wrong' | 'forged' }

/**
 * Check a solution, in the order that leaks least.
 *
 * Shape, then expiry, then the arithmetic, then the signature. The signature
 * is last because it is the only check that touches the server's key, and
 * there is no reason to do that work for a submission that was never going to
 * be accepted.
 */
export function verifySolution(
  secret: string,
  solution: Solution,
  nowSeconds: number,
): VerifyOutcome {
  if (
    typeof solution.salt !== 'string' ||
    typeof solution.challenge !== 'string' ||
    typeof solution.signature !== 'string' ||
    !Number.isSafeInteger(solution.number) ||
    solution.number < 0
  ) {
    return { ok: false, reason: 'malformed' }
  }

  const expires = Number(solution.salt.split('.')[1])
  if (!Number.isFinite(expires)) return { ok: false, reason: 'malformed' }
  if (nowSeconds > expires) return { ok: false, reason: 'expired' }

  if (hashOf(solution.salt, solution.number) !== solution.challenge) {
    return { ok: false, reason: 'wrong' }
  }

  // Last, and the one that matters: without it, anybody could invent a salt,
  // hash a number of their choosing and present the pair as a solution.
  if (!timingSafeEqual(sign(secret, solution.challenge), solution.signature)) {
    return { ok: false, reason: 'forged' }
  }

  return { ok: true, challenge: solution.challenge, expiresAtSeconds: expires }
}

/**
 * Find the number, which is the work.
 *
 * A plain loop rather than anything clever: the cost IS the point, and the
 * only thing worth optimising is not blocking the page. `onProgress` is called
 * every few thousand candidates so a caller can yield to the event loop or
 * show something moving; a caller that ignores it gets a busy loop, which is
 * why the recommendation is a Web Worker.
 */
export async function solveChallenge(
  challenge: Pick<Challenge, 'salt' | 'challenge' | 'maxNumber'>,
  options: {
    readonly onProgress?: (tried: number) => void | Promise<void>
    /**
     * How often to call back. Configurable rather than a constant because a
     * test should not have to do two thousand hashes to prove the callback
     * fires — which is how the tests here became slow enough to time out
     * under a loaded machine.
     */
    readonly progressEvery?: number
  } = {},
): Promise<number | undefined> {
  const every = options.progressEvery ?? 2_000
  for (let candidate = 0; candidate <= challenge.maxNumber; candidate += 1) {
    if (hashOf(challenge.salt, candidate) === challenge.challenge) return candidate
    // The hashing is synchronous; this await is the only thing that gives the
    // page back to the browser. Without it a hundred thousand hashes freeze
    // the tab for the whole quarter second.
    if (options.onProgress !== undefined && candidate % every === 0) {
      await options.onProgress(candidate)
    }
  }
  // Not an exception: a caller handed a challenge this scheme did not mint
  // deserves an answer rather than a throw.
  return undefined
}

/** The header a solved challenge travels in: base64 of the JSON. */
export function encodeSolution(solution: Solution): string {
  const json = JSON.stringify(solution)
  // `btoa` is in browsers and in Node, and avoids a Buffer import that would
  // make this file node-only.
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
}

export function decodeSolution(header: string): Solution | undefined {
  try {
    const bytes = Uint8Array.from(atob(header), (character) => character.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return parsed !== null && typeof parsed === 'object' ? (parsed as Solution) : undefined
  } catch {
    return undefined
  }
}

function sign(secret: string, challenge: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(challenge)))
}

function realRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

/** A number below `max`, drawn from bytes rather than from a float. */
function numberFrom(bytes: Uint8Array, max: number): number {
  let value = 0
  for (const byte of bytes.slice(0, 6)) value = value * 256 + byte
  return value % (max + 1)
}

/** Compare without leaking where the first difference is. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let different = 0
  for (let at = 0; at < a.length; at += 1) different |= a.charCodeAt(at) ^ b.charCodeAt(at)
  return different === 0
}
