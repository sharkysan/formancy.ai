/**
 * The challenge scheme lives in `@formancy/challenge`, not here.
 *
 * It is used in two places that cannot share server code: this package mints
 * and verifies, and a BROWSER solves. A solver written separately would be a
 * second description of one protocol, and the day the two disagreed the
 * symptom would be submissions the server rejects for no visible reason —
 * which reads as an attack rather than as a bug.
 *
 * So the scheme is one isomorphic module and this file only says where it
 * went. Re-exported rather than removed so that a consumer of
 * `@formancy/server-core` does not have to learn about a second package to
 * verify a solution.
 */
export {
  CHALLENGE_TTL_SECONDS,
  DEFAULT_MAX_NUMBER,
  decodeSolution,
  encodeSolution,
  hashOf,
  mintChallenge,
  solveChallenge,
  verifySolution,
} from '@formancy/challenge'
export type { Challenge, Solution, VerifyOutcome } from '@formancy/challenge'
