/**
 * Types for `codecov-config.mjs`, which is plain JavaScript because nothing
 * builds `scripts/` and the generator has to run from a bare checkout.
 *
 * Hand-written, like `release-notes.d.mts` and `check-cla.d.mts`. What it cannot
 * drift on is behaviour — `apps/docs/src/codecov.test.ts` calls the generator and
 * compares its output to the committed file, so a change here that does not match
 * the implementation fails rather than merely misleading.
 */

/** A workspace package that produces coverage, and the component id it gets. */
export interface CoveredPackage {
  /** Repository-relative, e.g. `packages/core`. */
  path: string
  /** Unique across the workspace; apps are prefixed, because a name can collide. */
  id: string
}

/** Every workspace package with a `test:coverage` script, in path order. */
export function coveredPackages(repoRoot?: string): CoveredPackage[]

/** `codecov.yml` as it should be on disk, trailing newline included. */
export function codecovConfig(packages?: CoveredPackage[]): string
