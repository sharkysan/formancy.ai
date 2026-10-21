/**
 * Types for `sbom.mjs`, which is plain JavaScript because the release workflow runs it
 * with `node` and nothing builds `scripts/`.
 *
 * Hand-written, like `release-notes.d.mts`, and for the same reason: the surface is
 * small enough to stay honest. What it cannot drift on is behaviour —
 * `apps/docs/src/sbom.test.ts` calls the implementation, not a stub of it.
 */

/** The expression evaluator, which decides whether a submission is valid. */
export const EVALUATOR: string

/** A package a release publishes, and the names its manifest declares as dependencies. */
export interface Released {
  readonly name: string
  readonly dependencies: readonly string[]
}

/** A package URL's npm name and version, whichever way its scope's `@` is spelled. */
export function npmPurl(purl: unknown): { name: string; version: string } | undefined

/** Every package a release publishes, as `scripts/pack.mjs` finds them. */
export function released(): Released[]

/**
 * What is wrong with `sbom` as the SBOM of the release at `version`, a sentence each;
 * none when it names every package at that version and its dependency graph gives each
 * one what its manifest declares, the CEL evaluator among them.
 */
export function sbomProblems(
  sbom: unknown,
  options: { readonly version: string; readonly packages: readonly Released[] },
): string[]
