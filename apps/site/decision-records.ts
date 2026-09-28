import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * How many decision records the repository holds, counted when the site is
 * built rather than written into the page.
 *
 * The landing page shows the number, and a literal went stale three times:
 * every branch that adds a record changes the count, and the branch that
 * shows it is never the same one. Counted here, a new record is on the page
 * the moment it is merged.
 */
export function countDecisionRecords(): number {
  const directory = fileURLToPath(new URL('../../docs/decisions/', import.meta.url))
  return readdirSync(directory).filter((name) => /^\d{4}-.*\.md$/.test(name)).length
}

/**
 * How many field types the spec defines, counted when the site is built.
 *
 * The page carried a literal `15`, and a test caught it going stale the first time a
 * type was added — which is the test working and also the wrong shape. Counted from
 * the spec's own list, adding a type puts the number on the page and nobody has to
 * remember. The same argument as the record count above, reached the same way.
 *
 * Read from the source text rather than by importing `@formancy/spec`, because this
 * file runs inside the Vite config before the workspace packages are built, and a
 * config that needs a build to run is a config that breaks a clean checkout.
 */
export function countFieldTypes(): number {
  const source = readFileSync(
    fileURLToPath(new URL('../../packages/spec/src/types.ts', import.meta.url)),
    'utf8',
  )
  const block = /export const FIELD_TYPES = \[([\s\S]*?)\] as const/.exec(source)?.[1]
  if (block === undefined) {
    // Loudly, not zero. A silent 0 on the landing page reads as a deliberate claim.
    throw new Error('Could not find FIELD_TYPES in packages/spec/src/types.ts')
  }
  return [...block.matchAll(/'[a-z]+'/g)].length
}

/**
 * The version every package carries, read when the site is built.
 *
 * The footer said `packages 0.1.0, pre-alpha` as a literal, and a release is exactly the
 * branch that changes it while the page is never the branch that shows it -- the same
 * argument as the two counts above, and the same mistake they were written for. One
 * number across every manifest is what makes reading one of them enough
 * (0009-independent-spec-version).
 *
 * From the root manifest rather than by importing anything, because this runs inside the
 * Vite config before the workspace is built.
 */
export function packageVersion(): string {
  const manifest = readFileSync(
    fileURLToPath(new URL('../../package.json', import.meta.url)),
    'utf8',
  )
  const version = (JSON.parse(manifest) as { version?: unknown }).version
  if (typeof version !== 'string') {
    // Loudly, not a placeholder. A footer claiming a version nobody released is worse
    // than a build that failed.
    throw new Error('The root package.json has no version to put on the page')
  }
  return version
}
