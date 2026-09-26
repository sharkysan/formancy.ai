import { describe, expect, test } from 'vitest'
import {
  CHALLENGE_TTL_SECONDS,
  decodeSolution,
  encodeSolution,
  hashOf,
  mintChallenge,
  solveChallenge,
  verifySolution,
} from './index.js'
import type { Solution } from './index.js'

/**
 * The scheme, and the four ways past it somebody would try.
 *
 * The happy path is one test. The rest is the point: a forged challenge, a
 * stale one, a solution to a different challenge, and a number that is simply
 * wrong. Each is a way to submit without paying, and each is refused for its
 * own reason rather than by accident — a test that could not tell the reasons
 * apart would pass on a bug that refused everything.
 */
const SECRET = 'a-signing-key-long-enough-to-be-real'
const NOW = 1_800_000_000

/** Deterministic bytes, so a test can mint the same challenge twice. */
const bytesFrom = (seed: number) => (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, at) => (seed + at * 31) % 256)

// A small ceiling: the search here is exhaustive, and a hundred thousand
// hashes per test would make the suite slow to prove nothing extra.
const mint = (seed = 7, maxNumber = 400) =>
  mintChallenge({ secret: SECRET, nowSeconds: NOW, maxNumber, randomBytes: bytesFrom(seed) })

describe('solving one', () => {
  test('the browser finds the number and the server accepts it', async () => {
    const challenge = await mint()

    const number = await solveChallenge(challenge)
    expect(number).toBeTypeOf('number')

    expect(verifySolution(SECRET, { ...challenge, number: number as number }, NOW)).toMatchObject(
      { ok: true },
    )
  })

  test('the solver and the verifier agree, because there is one definition', async () => {
    // The reason this is a package. A solver written separately would drift,
    // and the symptom would be submissions the server rejects for no visible
    // reason.
    for (const seed of [1, 42, 99]) {
      const challenge = await mint(seed)
      const number = await solveChallenge(challenge)
      expect((verifySolution(SECRET, { ...challenge, number: number as number }, NOW)).ok).toBe(
        true,
      )
    }
  })

  test('progress is reported, so a page can stay responsive', async () => {
    const seen: number[] = []
    // A challenge with no answer, so the loop runs to the end, and a small
    // interval so proving the callback fires costs fifty hashes rather than
    // six thousand. The previous version did the six thousand and timed out
    // on a loaded machine.
    await solveChallenge(
      { salt: 'x.1', challenge: 'no-answer-here', maxNumber: 50 },
      { onProgress: (tried) => void seen.push(tried), progressEvery: 10 },
    )

    // A caller that ignores this gets a busy loop, which is why the advice is
    // a Web Worker — but it has to be offered.
    expect(seen.length).toBeGreaterThan(0)
  })

  test('a challenge from another scheme is answered, not thrown at', async () => {
    expect(
      await solveChallenge({ salt: 'x.1', challenge: 'not-a-hash-of-anything', maxNumber: 50 }),
    ).toBeUndefined()
  })
})

describe('the ways past it', () => {
  const valid = async (): Promise<Solution> => {
    const challenge = await mint()
    return { ...challenge, number: (await solveChallenge(challenge)) as number }
  }

  test('a challenge nobody minted cannot be solved into a valid one', async () => {
    const salt = `deadbeef.${String(NOW + 600)}`
    const forged: Solution = {
      salt,
      number: 4,
      // Arithmetically correct on purpose: only the provenance is wrong, so
      // the test proves the signature check and not the hash check.
      challenge: hashOf(salt, 4),
      signature: 'f'.repeat(64),
    }

    expect(verifySolution(SECRET, forged, NOW)).toMatchObject({ ok: false, reason: 'forged' })
  })

  test('a solution signed with another key is refused', async () => {
    expect(verifySolution('a-different-key', await valid(), NOW)).toMatchObject({
      ok: false,
      reason: 'forged',
    })
  })

  test('the wrong number is refused before the key is consulted', async () => {
    const solution = await valid()

    const outcome = verifySolution(SECRET, { ...solution, number: solution.number + 1 }, NOW)

    // `wrong`, not `forged`: no reason to do the key's work for a submission
    // that was never going to be accepted.
    expect(outcome).toMatchObject({ ok: false, reason: 'wrong' })
  })

  test('a stale challenge is refused without a lookup', async () => {
    const outcome = verifySolution(SECRET, await valid(), NOW + CHALLENGE_TTL_SECONDS + 1)

    // The expiry rides in the salt, so an old one costs nothing to reject.
    expect(outcome).toMatchObject({ ok: false, reason: 'expired' })
  })

  test('and is still good a second before it is not', async () => {
    expect((verifySolution(SECRET, await valid(), NOW + CHALLENGE_TTL_SECONDS)).ok).toBe(true)
  })

  test('rubbish is malformed rather than a crash', async () => {
    const cases: unknown[] = [
      { salt: 'no-expiry', number: 1, challenge: 'x', signature: 'y' },
      { salt: `x.${String(NOW + 60)}`, number: -1, challenge: 'x', signature: 'y' },
      { salt: `x.${String(NOW + 60)}`, number: 1.5, challenge: 'x', signature: 'y' },
      { salt: 7, number: 1, challenge: 'x', signature: 'y' },
    ]

    for (const candidate of cases) {
      expect((verifySolution(SECRET, candidate as Solution, NOW)).ok).toBe(false)
    }
  })
})

describe('minting', () => {
  test('two challenges are not the same challenge', async () => {
    // Two visitors solving one puzzle between them would make the work a
    // one-off rather than per submission.
    expect((await mint(1)).salt).not.toBe((await mint(2)).salt)
  })

  test('the expiry rides in the salt, and comes back from verification', async () => {
    const challenge = await mint()
    const number = (await solveChallenge(challenge)) as number

    const outcome = verifySolution(SECRET, { ...challenge, number }, NOW)

    // Handed back so the caller can store the spend with the right lifetime
    // rather than inventing one.
    expect(outcome).toMatchObject({ ok: true, expiresAtSeconds: NOW + CHALLENGE_TTL_SECONDS })
  })

  test('the secret number is not in what is published', async () => {
    const challenge = await mint()
    const number = await solveChallenge(challenge)

    // Publishing it would make the search free, which is the whole cost.
    expect(challenge.signature).not.toContain(String(number))
  })
})

describe('the header', () => {
  test('survives the round trip', async () => {
    const challenge = await mint()
    const solution: Solution = { ...challenge, number: (await solveChallenge(challenge)) as number }

    expect(decodeSolution(encodeSolution(solution))).toEqual(solution)
  })

  test('a header that is not base64 JSON decodes to nothing rather than throwing', () => {
    // It arrives from a stranger. Throwing would turn a malformed header into
    // a 500 on a public endpoint.
    expect(decodeSolution('not base64 at all !!')).toBeUndefined()
    expect(decodeSolution(btoa('still not json'))).toBeUndefined()
  })
})
