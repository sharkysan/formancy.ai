import { describe, expect, test } from 'vitest'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import {
  CHALLENGE_TTL_SECONDS,
  mintChallenge,
  solveChallenge,
  verifySolution,
} from './challenge.js'
import type { Solution } from './challenge.js'

/**
 * The challenge, and the four ways past it somebody would try.
 *
 * The happy path is one test. The rest is the point: a forged challenge, a
 * stale one, a solution to a different challenge, and a number that is simply
 * wrong. Each is a way to submit without paying, and each has to be refused
 * for its own reason rather than by accident.
 */
const SECRET = 'a-signing-key-long-enough-to-be-real'
const NOW = 1_800_000_000

/** Deterministic bytes, so a test can assert the same challenge twice. */
const bytesFrom = (seed: number) => (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, at) => (seed + at * 31) % 256)

// A small ceiling: the search is exhaustive here, and a hundred thousand
// hashes per test would make the suite slow to prove nothing extra.
const mint = (seed = 7, maxNumber = 500) =>
  mintChallenge({
    secret: SECRET,
    randomBytes: bytesFrom(seed),
    nowSeconds: () => NOW,
    maxNumber,
  })

describe('solving one', () => {
  test('the browser finds the number, and the server accepts it', () => {
    const challenge = mint()

    const number = solveChallenge(challenge)
    expect(number).toBeTypeOf('number')

    const outcome = verifySolution(
      SECRET,
      { ...challenge, number: number as number },
      NOW,
    )
    expect(outcome).toMatchObject({ ok: true })
  })

  test('the solver and the verifier agree, because there is one definition', () => {
    // A solver that disagreed with the verifier would produce submissions the
    // server rejects, and the bug would look like an attack.
    for (const seed of [1, 42, 99]) {
      const challenge = mint(seed)
      const number = solveChallenge(challenge)
      expect(verifySolution(SECRET, { ...challenge, number: number as number }, NOW).ok).toBe(true)
    }
  })

  test('the number is below the ceiling it was promised', () => {
    const challenge = mint(3, 250)

    expect(solveChallenge(challenge)).toBeLessThanOrEqual(250)
  })
})

describe('the ways past it', () => {
  const valid = (): Solution => {
    const challenge = mint()
    return { ...challenge, number: solveChallenge(challenge) as number }
  }

  test('a challenge nobody minted cannot be solved into a valid one', () => {
    // The check that matters. Without the signature, anybody could invent a
    // salt, hash a number of their choosing and present the pair.
    const invented = { salt: `deadbeef.${String(NOW + 600)}`, number: 4 }
    const forged: Solution = {
      ...invented,
      // Honestly computed: the arithmetic is right, only the provenance is not.
      challenge: verifySolution(SECRET, { ...invented, challenge: 'x', signature: 'y' }, NOW).ok
        ? 'unreachable'
        : hashByHand(invented.salt, invented.number),
      signature: 'f'.repeat(64),
    }

    expect(verifySolution(SECRET, forged, NOW)).toMatchObject({ ok: false, reason: 'forged' })
  })

  test('a solution signed with the wrong key is refused', () => {
    const solution = valid()

    expect(verifySolution('a-different-key', solution, NOW)).toMatchObject({
      ok: false,
      reason: 'forged',
    })
  })

  test('the wrong number is refused before the signature is even looked at', () => {
    const solution = valid()

    const outcome = verifySolution(SECRET, { ...solution, number: solution.number + 1 }, NOW)

    // `wrong`, not `forged`: there is no reason to do the key's work for a
    // submission that was never going to be accepted.
    expect(outcome).toMatchObject({ ok: false, reason: 'wrong' })
  })

  test('a challenge that has gone stale is refused without a lookup', () => {
    const solution = valid()

    const outcome = verifySolution(SECRET, solution, NOW + CHALLENGE_TTL_SECONDS + 1)

    // The expiry rides in the salt, so an old one costs nothing to reject.
    expect(outcome).toMatchObject({ ok: false, reason: 'expired' })
  })

  test('and is still good a second before it is not', () => {
    const solution = valid()

    expect(verifySolution(SECRET, solution, NOW + CHALLENGE_TTL_SECONDS).ok).toBe(true)
  })

  test('rubbish is malformed rather than a crash', () => {
    const cases: unknown[] = [
      { salt: 'no-expiry', number: 1, challenge: 'x', signature: 'y' },
      { salt: `x.${String(NOW + 60)}`, number: -1, challenge: 'x', signature: 'y' },
      { salt: `x.${String(NOW + 60)}`, number: 1.5, challenge: 'x', signature: 'y' },
      { salt: 7, number: 1, challenge: 'x', signature: 'y' },
    ]

    for (const candidate of cases) {
      expect(verifySolution(SECRET, candidate as Solution, NOW).ok).toBe(false)
    }
  })
})

describe('minting', () => {
  test('two challenges are not the same challenge', () => {
    // The salt is random. Two visitors solving one puzzle between them would
    // make the work a one-off rather than per submission.
    expect(mint(1).salt).not.toBe(mint(2).salt)
  })

  test('the expiry rides in the salt', () => {
    const challenge = mint()

    expect(challenge.salt.endsWith(`.${String(NOW + CHALLENGE_TTL_SECONDS)}`)).toBe(true)
  })

  test('the secret number is never in what is published', () => {
    const challenge = mint()
    const number = solveChallenge(challenge)

    // Publishing it would make the search free, which is the whole cost.
    expect(JSON.stringify(challenge)).not.toContain(`:${String(number)}`)
    expect(challenge.signature).not.toContain(String(number))
  })
})

/**
 * The hash, spelled out rather than borrowed from the module under test.
 *
 * A forged solution has to be arithmetically CORRECT — otherwise the test
 * would pass for the wrong reason, refusing it as `wrong` when what is being
 * proved is that it is refused as `forged`.
 */
function hashByHand(salt: string, number: number): string {
  return bytesToHex(sha256(utf8ToBytes(`${salt}${String(number)}`)))
}
