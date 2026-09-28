// The body of a GitHub release: the section of CHANGELOG.md for one version.
//
// The workflow used to hand GitHub the whole changelog. At 0.2.0 that was 164,422
// characters against a documented limit of 125,000, so the release step would have
// answered 422 -- and it is the LAST step, after the packages are on npm and the
// signed image is in the registry. Neither can be taken back and a version number
// cannot be reused, so the failure would have left a release that exists on npm and
// not on GitHub, without the SBOM a manufacturer is told to fetch.
//
// Used by `.github/workflows/release.yml` and by
// `packages/server/src/release-image.test.ts` -- one extractor, checked before the
// tag rather than during it.

import { readFileSync, writeFileSync } from 'node:fs'

/** Does this `## ` heading announce `version`? Both spellings the changelog uses. */
function announces(line, version) {
  if (!line.startsWith('## ')) return false
  const rest = line.slice(3).trim()
  // `## [0.1.0] — 2026-09-20` and `## 0.2.0 — 2026-09-28`, and nothing else: a
  // heading that merely starts with the digits ("0.2.0-rc1") is a different release.
  const named = rest.startsWith('[') ? rest.slice(1) : rest
  const after = named.slice(version.length)
  return named.startsWith(version) && (after === '' || after.startsWith(']') || after.startsWith(' '))
}

/**
 * The section for `version`, from its heading to the next top-level heading.
 *
 * **Throws** when the version has no section rather than returning an empty body: a
 * release whose notes are blank is the failure this exists to prevent, arriving
 * quietly instead of loudly.
 */
export function releaseNotes(changelog, version) {
  const lines = changelog.split('\n')
  const from = lines.findIndex((line) => announces(line, version))
  if (from === -1) {
    throw new Error(`CHANGELOG.md has no section for ${version}`)
  }

  const after = lines.slice(from + 1).findIndex((line) => line.startsWith('## '))
  const to = after === -1 ? lines.length : from + 1 + after

  return lines.slice(from, to).join('\n').trimEnd()
}

// `node scripts/release-notes.mjs 0.2.0 RELEASE_NOTES.md`
if (process.argv[1]?.endsWith('release-notes.mjs')) {
  const [version, out] = process.argv.slice(2)
  if (version === undefined || out === undefined) {
    throw new Error('usage: release-notes.mjs <version> <output file>')
  }
  const notes = releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version)
  writeFileSync(out, `${notes}\n`, 'utf8')
  console.log(`release notes: ${String(notes.length)} characters for ${version} -> ${out}`)
}
