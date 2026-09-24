// Build formancy.ai as one static deployment: the site at `/`, the playground
// at `/playground/`.
//
// They are two Vite apps rather than one because they are two products — a
// landing page and a tool — and building them together would mean one bundle,
// one theme and one set of dependencies for both. Serving them together is
// a copy.
//
// A script rather than four lines in a hosting provider's build-command field.
// Three reasons: the shell one-liner used `rm -rf` and `cp -R`, which do not
// exist on the Windows machines this repo is developed on; a command that
// lives in a dashboard is a command nobody can review, test or bisect; and the
// last step below cannot be expressed as a copy at all.
//
// That last step is the point. Vite writes ABSOLUTE asset URLs, so a
// playground built with the default base asks for `/assets/index-<hash>.js` —
// the SITE's asset directory, holding the site's chunks under different
// hashes. The page loads, the script 404s, and the visitor gets a blank screen
// while the build log says every task succeeded. `apps/playground/vite.config.ts`
// sets the base; this asserts the artefact actually has it, because the cost
// of being wrong is a silently broken deployment and the check is one regex.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteDist = join(root, 'apps', 'site', 'dist')
const playgroundDist = join(root, 'apps', 'playground', 'dist')
const nested = join(siteDist, 'playground')

/** The base the playground must be built at, and the directory it is copied to. */
const BASE = '/playground/'

function run(command, args) {
  // `shell: true` on Windows, where pnpm is a .cmd and spawn cannot exec it.
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

run('pnpm', [
  'exec',
  'turbo',
  'run',
  'build',
  '--filter=@formancy/site',
  '--filter=@formancy/playground',
])

for (const [name, path] of [
  ['site', siteDist],
  ['playground', playgroundDist],
]) {
  if (!existsSync(join(path, 'index.html'))) {
    throw new Error(`The ${name} build produced no index.html at ${path}.`)
  }
}

// Removed first: a stale playground from a previous build would otherwise
// leave orphaned chunks behind, and a deployment that serves two versions of
// the same app is worse than one that fails.
rmSync(nested, { recursive: true, force: true })
cpSync(playgroundDist, nested, { recursive: true })

const html = readFileSync(join(nested, 'index.html'), 'utf8')
const wrong = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)]
  .map((match) => match[1])
  .filter((url) => !url.startsWith(BASE))

if (wrong.length > 0) {
  throw new Error(
    `The playground was built for the wrong place. Its index.html asks for ${wrong.join(', ')}, ` +
      `which resolves against the SITE at the root rather than against ${BASE}. ` +
      `Nothing there will 404 loudly — the page would deploy and render blank. ` +
      `Check \`base\` in apps/playground/vite.config.ts.`,
  )
}

console.log(`formancy.ai built: apps/site/dist, with the playground at ${BASE}`)
