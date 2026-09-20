// Put LICENSE and NOTICE inside every publishable package.
//
// Apache-2.0 section 4(a) requires a copy of the licence to travel with the
// work, and 4(d) requires the NOTICE file to travel with it too. A `license`
// field in package.json is a declaration about the terms, not the terms —
// shipping a tarball without them is a licence violation by the project that
// chose Apache-2.0 partly FOR its attribution clause (see
// docs/decisions/0002-apache-2-0.md), which would be a poor look.
//
// They are copied rather than committed so there is one source of truth: a
// change to the root LICENSE reaches every package on the next build instead
// of leaving nine stale copies behind. The copies are gitignored.
//
// npm always includes a LICENSE file in a tarball whatever `files` says; it
// does NOT do that for NOTICE, which is why NOTICE is listed in `files`.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sources = ['LICENSE', 'NOTICE']

for (const file of sources) {
  if (!existsSync(join(root, file))) throw new Error(`No ${file} at the repository root`)
}

const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, 'packages', entry.name))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .filter((dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).private !== true)

let written = 0
for (const dir of packages) {
  // Angular publishes from dist/ (publishConfig.directory), so the files have
  // to land where the tarball is actually made from.
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const target = manifest.publishConfig?.directory
    ? join(dir, manifest.publishConfig.directory)
    : dir

  if (!existsSync(target)) {
    // The dist has not been built yet. Not an error: the build will call this
    // again, and packing an unbuilt package fails for its own reasons.
    continue
  }

  mkdirSync(target, { recursive: true })
  for (const file of sources) {
    copyFileSync(join(root, file), join(target, file))
    written += 1
  }
}

console.log(`licences: wrote ${String(written)} files across ${String(packages.length)} packages`)
