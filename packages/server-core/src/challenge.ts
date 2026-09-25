import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * A proof-of-work challenge for the anonymous submission surface.
 *
 * ── WHY NOT A CAPTCHA SERVICE ───────────────────────────────────────────────
 *
 * Turnstile and reCAPTCHA both round-trip every visitor through a third party
 * before that visitor may speak to a form. For the European self-hosters this
 * product is aimed at, that turns a form on their own server into a data
 * transfer to somebody else's, on every visit, whether or not the visitor ever
 * submits. There is no override for a Tor or VPN user, who is served a puzzle
 * or a refusal on the strength of their address.
 *
 * So the default is arithmetic the browser does by itself. Nothing leaves the
 * deployment, there is no account to open, no key to rotate, and no visitor is
 * profiled to decide whether they look human.
 *
 * ── WHAT IT ACTUALLY BUYS ───────────────────────────────────────────────────
 *
 * Not "proof you are a person" — proof that a few hundred milliseconds of a
 * CPU were spent for this one submission. A determined attacker pays it. A
 * script pointed at a thousand forms does not, because the cost is per
 * submission and cannot be amortised, and that is the traffic a public form
 * actually gets. It is one of several layers and the record says so; treating
 * it as the defence would be the mistake.
 *
 * ── THE SCHEME ──────────────────────────────────────────────────────────────
 *
 * The server picks a secret number below a ceiling, publishes
 * `sha256(salt + number)` and the salt, and signs that hash with its own key.
 * The browser searches upwards from zero until it finds the number. It returns
 * the number and the signature it was given.
 *
 * Verification is therefore stateless: recompute the hash from the salt and
 * the number the browser found, and check the signature is ours. **A challenge
 * nobody minted cannot be solved into a valid one**, because the signature
 * covers the hash and only this server can produce it.
 *
 * The salt carries the expiry, so an old challenge is refused without looking
 * anything up. Replay is the one thing the signature cannot prevent — a
 * correct solution stays correct — so spending one is a separate, storage-
 * backed step. See `spendChallenge` on the storage port.
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

/** What a browser sends back. The shape ALTCHA clients already produce. */
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
 * A hundred thousand hashes: around a tenth of a second in a browser, and
 * unnoticeable next to the time somebody spent filling the form in. Raising it
 * punishes the slowest device far more than the attacker, who has the fastest
 * one — which is the trap every difficulty knob in this category falls into.
 */
export const DEFAULT_MAX_NUMBER = 100_000

/** How long a minted challenge stays solvable. */
export const CHALLENGE_TTL_SECONDS = 600

export interface MintDeps {
  /** The signing key. The same secret the rest of the server signs with. */
  readonly secret: string
  /** Injected, never ambient: a predictable number here is no challenge. */
  readonly randomBytes: (length: number) => Uint8Array
  readonly nowSeconds: () => number
  readonly maxNumber?: number
}

export function mintChallenge(deps: MintDeps): Challenge {
  const maxNumber = deps.maxNumber ?? DEFAULT_MAX_NUMBER
  const expires = deps.nowSeconds() + CHALLENGE_TTL_SECONDS
  const salt = `${bytesToHex(deps.randomBytes(16))}.${String(expires)}`

  // Drawn from real randomness rather than from `Math.random`, for the same
  // reason the salt is: a predictable secret number is a challenge already
  // solved.
  const number = numberFrom(deps.randomBytes(8), maxNumber)
  const challenge = hashOf(salt, number)

  return {
    algorithm: 'SHA-256',
    salt,
    challenge,
    maxNumber,
    signature: signChallenge(deps.secret, challenge),
  }
}

export type VerifyOutcome =
  | { readonly ok: true; readonly challenge: string }
  | { readonly ok: false; readonly reason: 'malformed' | 'expired' | 'wrong' | 'forged' }

/**
 * Check a solution, in the order that leaks least.
 *
 * Shape, then expiry, then the arithmetic, then the signature. The signature
 * is last because it is the only check that says anything about the server's
 * key, and there is no reason to perform it for a submission that was never
 * going to be accepted anyway.
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
  if (!timingSafeEqual(signChallenge(secret, solution.challenge), solution.signature)) {
    return { ok: false, reason: 'forged' }
  }

  return { ok: true, challenge: solution.challenge }
}

/**
 * The search a browser performs, and the reference the tests check against.
 *
 * Here rather than only in a client so that the scheme has exactly one
 * definition: a solver that disagreed with the verifier would produce
 * submissions this server rejects, and the bug would look like an attack.
 */
export function solveChallenge(challenge: Pick<Challenge, 'salt' | 'challenge' | 'maxNumber'>):
  | number
  | undefined {
  for (let candidate = 0; candidate <= challenge.maxNumber; candidate += 1) {
    if (hashOf(challenge.salt, candidate) === challenge.challenge) return candidate
  }
  // Unreachable for a challenge this server minted, and not an exception: a
  // caller handed a foreign challenge deserves an answer rather than a throw.
  return undefined
}

function hashOf(salt: string, number: number): string {
  return bytesToHex(sha256(utf8ToBytes(`${salt}${String(number)}`)))
}

function signChallenge(secret: string, challenge: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(challenge)))
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
