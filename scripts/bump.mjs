// Set one version across every workspace project.
//
// One number for all packages is the point (see
// docs/decisions/0009-independent-spec-version.md): any two formancy packages
// at the same version are known to work together, which makes the support
// matrix size one. That only holds if bumping is a single operation rather
// than fourteen edits, one of which is eventually forgotten.
//
// The spec version is NOT touched. It lives inside form documents, moves on its
// own line, and a package release must never quietly change it.
//
//   node scripts/bump.mjs 0.2.0

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (version === undefined || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/bump.mjs <version>   e.g. 0.2.0, 0.2.0-rc.1')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const manifests = [join(root, 'package.json')]
for (const group of ['packages', 'apps']) {
  for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
    if (entry.isDirectory()) manifests.push(join(root, group, entry.name, 'package.json'))
  }
}

let changed = 0
for (const path of manifests) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    continue // a directory without a manifest is not an error
  }

  const manifest = JSON.parse(raw)
  if (manifest.version === version) continue

  const previous = manifest.version
  manifest.version = version
  // Two spaces and a trailing newline: what every manifest here already uses,
  // so the diff is one line rather than the whole file.
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`${String(previous)} -> ${version}  ${manifest.name ?? '(root)'}`)
  changed += 1
}

console.log(`\n${String(changed)} of ${String(manifests.length)} manifests updated.`)
console.log('Cross-package dependencies use workspace:*, so nothing else needs touching.')
console.log('Next: write the CHANGELOG entry, then see RELEASING.md.')
