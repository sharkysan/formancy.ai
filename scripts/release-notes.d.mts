/**
 * Types for `release-notes.mjs`, which is plain JavaScript because the release
 * workflow runs it with `node` and nothing builds `scripts/`.
 *
 * Hand-written, and the surface is one function of two strings so it can stay that
 * way. What it cannot drift on is behaviour: `packages/server/src/release-image.test.ts`
 * calls the implementation rather than a stub of it.
 */

/**
 * The section of a changelog for one version, from its heading to the next `## `.
 *
 * Throws when the version has no section — a release whose notes are blank is the
 * failure this exists to prevent.
 */
export function releaseNotes(changelog: string, version: string): string
