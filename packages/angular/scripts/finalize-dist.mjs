// ng-packagr copies workspace:* protocols verbatim into dist/package.json,
// which nothing outside this workspace can resolve. pnpm rewrites them on
// publish from the SOURCE dir, but dist is what Angular packages ship — so
// rewrite here, pinning to the sibling packages’ actual versions.
import { readFileSync, writeFileSync } from 'node:fs'

const dist = new URL('../dist/package.json', import.meta.url)
const manifest = JSON.parse(readFileSync(dist, 'utf8'))
for (const section of [manifest.dependencies, manifest.peerDependencies]) {
  if (section === undefined) continue
  for (const [name, range] of Object.entries(section)) {
    if (typeof range === 'string' && range.startsWith('workspace:')) {
      const sibling = new URL(`../../${name.split('/')[1]}/package.json`, import.meta.url)
      section[name] = JSON.parse(readFileSync(sibling, 'utf8')).version
    }
  }
}
// The source manifest's `types` points into dist, because that is what makes the
// package resolvable from inside the workspace — nothing here had ever imported
// it until `@formancy/builder-angular` rendered a preview with it. Copied into
// dist the path is `./dist/types/...` relative to dist itself, which resolves to
// nothing, and `publint` says so. ng-packagr writes the right `exports` for dist
// on its own; this is the one field it carries over.
delete manifest.types

// The source manifest's publishConfig redirects publishing INTO dist; copied
// into dist itself it would redirect again, to dist/dist. It has done its job.
delete manifest.publishConfig
writeFileSync(dist, JSON.stringify(manifest, null, 2))
