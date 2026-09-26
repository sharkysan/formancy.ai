// Build formancy.ai as one static deployment: the site at `/`, the playground
// at `/playground/`, the documentation at `/docs/`.
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
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteDist = join(root, 'apps', 'site', 'dist')

/**
 * Each app, where it is served from, and where its build lands.
 *
 * The base is not decoration: every one of these writes absolute asset URLs,
 * so an app built at the wrong base asks for files that belong to a different
 * app — and the page loads, the script 404s, and the deployment is blank
 * while the build log says everything succeeded.
 */
const NESTED = [
  { name: 'playground', pkg: '@formancy/playground', base: '/playground/' },
  { name: 'docs', pkg: '@formancy/docs', base: '/docs/' },
]

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
  ...NESTED.map((app) => `--filter=${app.pkg}`),
])

if (!existsSync(join(siteDist, 'index.html'))) {
  throw new Error(`The site build produced no index.html at ${siteDist}.`)
}

for (const app of NESTED) {
  const built = join(root, 'apps', app.name, 'dist')
  const into = join(siteDist, app.name)

  if (!existsSync(join(built, 'index.html'))) {
    throw new Error(`The ${app.name} build produced no index.html at ${built}.`)
  }

  // Removed first: a stale copy would otherwise leave orphaned chunks behind,
  // and a deployment serving two versions of the same app is worse than one
  // that fails.
  rmSync(into, { recursive: true, force: true })
  cpSync(built, into, { recursive: true })

  const html = readFileSync(join(into, 'index.html'), 'utf8')
  const wrong = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)]
    .map((match) => match[1])
    .filter((url) => !url.startsWith(app.base))

  if (wrong.length > 0) {
    throw new Error(
      `The ${app.name} build was made for the wrong place. Its index.html asks for ` +
        `${wrong.join(', ')}, which resolves against the SITE at the root rather than ` +
        `against ${app.base}. Nothing there will 404 loudly — the page would deploy and ` +
        `render blank. Check its base.`,
    )
  }
}

/**
 * Links written by hand in the documentation.
 *
 * Astro rewrites its own navigation for `base`, and nothing at all for a link
 * somebody typed into a Markdown file. `](/concepts/x/)` looks right, builds
 * without complaint, and 404s in production against the landing page. Checked
 * at the source rather than in the output, because Starlight legitimately
 * links out to `/` and telling the two apart afterwards is guesswork.
 */
const docsContent = join(root, 'apps', 'docs', 'src', 'content', 'docs')
const stray = []
for (const file of readdirSync(docsContent, { recursive: true, encoding: 'utf8' })) {
  if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue
  const text = readFileSync(join(docsContent, file), 'utf8')
  for (const match of text.matchAll(/\]\((\/[^)]*)\)/g)) {
    const href = match[1]
    if (!href.startsWith('/docs/')) stray.push(`${file} -> ${href}`)
  }
}

if (stray.length > 0) {
  throw new Error(
    `Documentation links that leave the docs: ${stray.join(', ')}. These are served under ` +
      `/docs/, and a root-absolute link resolves against the landing page instead — it builds ` +
      `cleanly and 404s in production. Prefix them with /docs/.`,
  )
}

/**
 * The sitemap, checked rather than written.
 *
 * `/sitemap.xml` and `/sitemap-pages.xml` are static files in
 * `apps/site/public`, so they ship with any build of the site. They were
 * written here at first, and the deployment never ran this script: the site
 * went live with `robots.txt` pointing at a sitemap that was not there. So the
 * files live where every build copies them, and this checks that what they say
 * is still true: the pages are the landing page and each app nested under it
 * except the documentation, and the documentation's entries are exactly the
 * sitemaps Astro wrote. The index names Astro's children rather than its
 * index, because a sitemap index may not list another index.
 *
 * Astro skips its sitemap without a word when `site` is missing from its
 * config, so an absent one fails the build too.
 */
const ORIGIN = 'https://formancy.ai'
const locs = (file) =>
  [...readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])

const docsIndex = join(siteDist, 'docs', 'sitemap-index.xml')
if (!existsSync(docsIndex)) {
  throw new Error(
    `The documentation built no sitemap at ${docsIndex}. Astro skips it silently when ` +
      `\`site\` is not set in apps/docs/astro.config.mjs.`,
  )
}

const expectedPages = [
  `${ORIGIN}/`,
  ...NESTED.filter((app) => app.name !== 'docs').map((app) => `${ORIGIN}${app.base}`),
]
const expectedIndex = [`${ORIGIN}/sitemap-pages.xml`, ...locs(docsIndex)]

for (const [file, expected] of [
  ['sitemap-pages.xml', expectedPages],
  ['sitemap.xml', expectedIndex],
]) {
  const actual = locs(join(siteDist, file))
  if (actual.join('\n') !== expected.join('\n')) {
    throw new Error(
      `apps/site/public/${file} lists ${actual.join(', ') || 'nothing'}, and the build says it ` +
        `should list ${expected.join(', ')}. Update the file: it is served as it is.`,
    )
  }
}

console.log(
  `formancy.ai built: apps/site/dist, with ${NESTED.map((app) => app.base).join(' and ')}, ` +
    `and a sitemap that matches them`,
)
