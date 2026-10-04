// Make an ng-packagr `dist` into something publishable.
//
// One script for both Angular packages. It was two identical copies, which is
// one decision in two places: the next change would have landed in one of them
// and nobody would have found out, because each package only ever runs its own.
//
// Called from a package's build with the package directory:
//
//   node ../../scripts/finalize-angular-dist.mjs .
//
// Three jobs, and the third is the one that was missing.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = resolve(process.argv[2] ?? process.cwd())
const dist = join(packageDir, 'dist')

if (!existsSync(join(dist, 'package.json'))) {
  throw new Error(`No dist/package.json in ${packageDir}; ng-packagr has not run`)
}

const manifestPath = join(dist, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// 1. ng-packagr copies `workspace:*` protocols verbatim into dist/package.json,
//    which nothing outside this workspace can resolve. pnpm rewrites them on
//    publish from the SOURCE directory, but dist is what Angular packages ship —
//    so rewrite here, pinning to the sibling packages' actual versions.
for (const section of [manifest.dependencies, manifest.peerDependencies]) {
  if (section === undefined) continue
  for (const [name, range] of Object.entries(section)) {
    if (typeof range === 'string' && range.startsWith('workspace:')) {
      const sibling = join(root, 'packages', name.split('/')[1], 'package.json')
      section[name] = JSON.parse(readFileSync(sibling, 'utf8')).version
    }
  }
}

// 2. The source manifest's `types` points into dist, because that is what makes
//    the package resolvable from inside the workspace — nothing imported
//    `@formancy/builder-angular` until the playground mounted it, and it had no
//    `exports` at all until then either. Copied into dist the path becomes
//    `./dist/types/...` relative to dist itself, which resolves to nothing, and
//    `publint` says so. ng-packagr writes the right `exports` for dist on its
//    own; these two are the fields it carries over.
delete manifest.types
// The source `publishConfig` redirects publishing INTO dist; copied into dist it
// would redirect again, to dist/dist. It has done its job.
delete manifest.publishConfig

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

/*
 * 3. The licence and the notice, which the root `sync-licenses.mjs` cannot keep
 *    here.
 *
 * That script writes LICENSE and NOTICE wherever a package packs from, and for
 * these two that is `dist` — which is also `turbo.json`'s cached output for
 * `build`. So the files were written *after* the build task finished, were never
 * part of its cached outputs, and **any later execution or restore of that task
 * removed them again**. Measured: two files in `packages/angular/dist` after
 * `pnpm build`, zero after `turbo run check:pkg --force`, because `check:pkg`
 * depends on its own `build`.
 *
 * That is not academic. The release workflow runs `check:pkg` at step 89 and the
 * licence gate at step 93, so the gate failed and the release stopped — every
 * time, which is a release that cannot be cut. The alternative, had the gate not
 * been there, is publishing an Apache-2.0 package without the licence text that
 * section 4(a) requires to travel with it.
 *
 * Copied HERE, as part of the build, so they are a build output: cached with
 * everything else and restored with it. The root script still handles the
 * fourteen packages that pack from their own directory, which turbo never
 * touches.
 */
for (const file of ['LICENSE', 'NOTICE']) {
  const source = join(root, file)
  if (!existsSync(source)) throw new Error(`No ${file} at the repository root`)
  copyFileSync(source, join(dist, file))
}
