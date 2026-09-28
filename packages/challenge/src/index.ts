/**
 * The public surface of `@formancy/challenge`.
 *
 * The scheme itself is in `challenge.ts`. It lived here, and `vitest.coverage.ts`
 * excludes every `src/index.ts` on the grounds that a barrel has no behaviour — so a
 * package with fifteen passing tests reported 0% statements, which reads as untested
 * rather than as unmeasured.
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
} from './challenge.js'
export type { Challenge, MintOptions, Solution, VerifyOutcome } from './challenge.js'
