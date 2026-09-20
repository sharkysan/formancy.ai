// Refuse to publish a tarball that does not carry its licence.
//
// scripts/sync-licenses.mjs puts LICENSE and NOTICE where each package packs
// from. This checks that it worked, because the failure is silent otherwise:
// `npm publish` is perfectly happy to ship a tarball with neither, and the
// first person to notice is whoever audits the dependency months later.
//
// Apache-2.0 section 4(a) requires the licence to travel with the work, and
// 4(d) the NOTICE file. The `license` field in package.json is a claim about
// the terms, not the terms.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const required = ['LICENSE', 'NOTICE']

const problems = []
let checked = 0

for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const dir = join(root, 'packages', entry.name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.private === true) continue

  // Wherever the tarball is actually made from — Angular packs its dist.
  const packRoot = manifest.publishConfig?.directory
    ? join(dir, manifest.publishConfig.directory)
    : dir

  checked += 1

  if (manifest.license !== 'Apache-2.0') {
    problems.push(`${manifest.name}: license is ${String(manifest.license)}, expected Apache-2.0`)
  }

  for (const file of required) {
    if (!existsSync(join(packRoot, file))) {
      problems.push(`${manifest.name}: no ${file} where it packs from`)
    }
  }

  // npm always includes LICENSE whatever `files` says. It does not do that for
  // NOTICE, so a `files` array that omits it would drop it from the tarball
  // even though the file is sitting right there.
  if (Array.isArray(manifest.files) && !manifest.files.includes('NOTICE')) {
    problems.push(`${manifest.name}: "files" does not list NOTICE, so it will not be packed`)
  }
}

if (problems.length > 0) {
  console.error('Licence check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`licences: ${String(checked)} publishable packages carry LICENSE and NOTICE`)
