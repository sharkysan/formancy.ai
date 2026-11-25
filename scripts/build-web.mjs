// Build formancy.ai as one static deployment: the site at `/`, the playground
// at `/playground/`, the documentation at `/docs/`, and the Angular starter at
// `/angular-form-builder/demo/`, which the site's Angular page embeds.
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
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_ORIGIN, headersFile, headersFor, inlineOf } from './site-headers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteDist = join(root, 'apps', 'site', 'dist')

/**
 * Each app, where it is served from, and where its build lands.
 *
 * The base is not decoration: an app writing absolute asset URLs and built at
 * the wrong base asks for files that belong to a different app — and the page
 * loads, the script 404s, and the deployment is blank while the build log says
 * everything succeeded. The starter is built with a relative base instead, so it
 * can be served from anywhere, a copy of it included; the check below accepts a
 * relative URL and nothing absolute outside the base.
 *
 * `listed` is whether the address is a page in the sitemap. The starter is not:
 * it is the demo inside `/angular-form-builder/`, which is.
 */
const NESTED = [
  { name: 'playground', pkg: '@formancy/playground', base: '/playground/', listed: true },
  { name: 'docs', pkg: '@formancy/docs', base: '/docs/', listed: false },
  {
    name: 'angular-starter',
    pkg: '@formancy/angular-starter',
    base: '/angular-form-builder/demo/',
    listed: false,
  },
]

/**
 * The site's own pages besides the landing page, each an `index.html` in its directory.
 * The last three are the paid modules' product pages (0242), in the order the footer
 * links the modules.
 */
const PAGES = ['templates', 'angular-form-builder', 'products/data', 'products/report', 'products/health']

/**
 * The pages whose words have to be in the HTML the server sends, because being found is
 * what they are for (0242): the product pages, which the site's build renders into their
 * roots. Every other page is an empty root a script draws into.
 */
const PRERENDERED = PAGES.filter((page) => page.startsWith('products/'))

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

run('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@formancy/site', ...NESTED.map((app) => `--filter=${app.pkg}`)])

if (!existsSync(join(siteDist, 'index.html'))) {
  throw new Error(`The site build produced no index.html at ${siteDist}.`)
}

for (const page of PAGES) {
  if (!existsSync(join(siteDist, ...page.split('/'), 'index.html'))) {
    throw new Error(`The site build produced no ${page}/index.html.`)
  }
}

/*
 * A product page whose root is empty builds and deploys and reads as nothing to a crawler
 * that runs no script, which is the one reader the page was rendered for. So the built page
 * is read back: its root holds markup, and the markup holds the page's one heading. The
 * module that rendered it is gone, so nothing but the pages ships.
 */
for (const page of PRERENDERED) {
  const html = readFileSync(join(siteDist, ...page.split('/'), 'index.html'), 'utf8')
  const opened = html.indexOf('<div id="root"')
  const body = opened === -1 ? '' : html.slice(opened, html.lastIndexOf('</body>'))
  if (!/<main\b/.test(body) || (body.match(/<h1\b/g) ?? []).length !== 1) {
    throw new Error(
      `${page}/index.html was built with ${opened === -1 ? 'no root' : 'no page in its root'}: apps/site's build renders it to static HTML ` +
        `(prerender.mjs), and without that its words reach no crawler that runs no script.`,
    )
  }
}
if (existsSync(join(siteDist, '.prerender'))) {
  throw new Error(`apps/site/dist/.prerender is still there: it is the module prerender.mjs renders the product pages with, and it would ship.`)
}

for (const app of NESTED) {
  const built = join(root, 'apps', app.name, 'dist')
  const into = join(siteDist, ...app.base.split('/').filter(Boolean))

  if (!existsSync(join(built, 'index.html'))) {
    throw new Error(`The ${app.name} build produced no index.html at ${built}.`)
  }

  // Removed first: a stale copy would otherwise leave orphaned chunks behind,
  // and a deployment serving two versions of the same app is worse than one
  // that fails.
  rmSync(into, { recursive: true, force: true })
  cpSync(built, into, { recursive: true })

  const html = readFileSync(join(into, 'index.html'), 'utf8')
  const wrong = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((match) => match[1]).filter((url) => !url.startsWith(app.base))
  // A page with no script of its own renders nothing, and passes the check above.
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1])

  if (scripts.length === 0) {
    throw new Error(`The ${app.name} build's index.html loads no script.`)
  }
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
 *
 * The paid modules are served under formancy.ai as well, each by a deployment
 * of its own repository, and a search engine finds them only if this site names
 * them (0241). So the pages each module makes indexable are listed after the
 * site's own, and a module that writes a sitemap of its own is listed in the
 * index after Astro's: Formancy Report's, which lists its product pages in each
 * language with their alternates and is not an index. Both come from
 * `apps/site/src/paid-modules.json`, the list the footer links the modules from,
 * so the sitemaps and the footer cannot name a module's place differently. None
 * of those pages is in this build, so what is held is the files against the
 * list, not the list against what those repositories deploy. Every address in
 * it has to be this site's, because a sitemap may list only its own host.
 *
 * Each module also has a product page that this site builds, `/products/<id>/`,
 * listed among the site's own pages, and the footer links each module to it
 * (0242). So the list's `product` for each module has to be one of those pages,
 * or the footer would link a page the build did not make.
 */
const locs = (file) => [...readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])

const docsIndex = join(siteDist, 'docs', 'sitemap-index.xml')
if (!existsSync(docsIndex)) {
  throw new Error(`The documentation built no sitemap at ${docsIndex}. Astro skips it silently when ` + `\`site\` is not set in apps/docs/astro.config.mjs.`)
}

const paidModules = JSON.parse(readFileSync(join(root, 'apps', 'site', 'src', 'paid-modules.json'), 'utf8'))
const elsewhere = paidModules.flatMap((module) => [...module.pages, ...module.sitemaps]).filter((url) => !url.startsWith(`${SITE_ORIGIN}/`))
if (elsewhere.length > 0) {
  throw new Error(
    `apps/site/src/paid-modules.json names ${elsewhere.join(', ')} for the sitemaps, which may list ` +
      `only addresses under ${SITE_ORIGIN}/. A search engine ignores the rest.`,
  )
}

const unbuilt = paidModules.filter((module) => !PRERENDERED.some((page) => module.product === `/${page}/`))
if (unbuilt.length > 0) {
  throw new Error(
    `apps/site/src/paid-modules.json has the footer link ${unbuilt.map((module) => `${module.name} to ${String(module.product)}`).join(', ')}, ` +
      `which is not a product page this build made: ${PRERENDERED.map((page) => `/${page}/`).join(', ')}.`,
  )
}

const expectedPages = [
  `${SITE_ORIGIN}/`,
  ...NESTED.filter((app) => app.listed).map((app) => `${SITE_ORIGIN}${app.base}`),
  ...PAGES.map((page) => `${SITE_ORIGIN}/${page}/`),
  ...paidModules.flatMap((module) => module.pages),
]
const expectedIndex = [`${SITE_ORIGIN}/sitemap-pages.xml`, ...locs(docsIndex), ...paidModules.flatMap((module) => module.sitemaps)]

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

/**
 * The headers formancy.ai is served with (0234), where Cloudflare's static assets read
 * them: `_headers`, at the root of the directory it serves. Written last, from the pages
 * as they were built, since the documentation's inline scripts are admitted by their
 * hashes; `inlineOf` refuses a page that no section of the site serves.
 */
writeFileSync(join(siteDist, '_headers'), headersFile(headersFor(SITE_ORIGIN, inlineOf(siteDist))))

console.log(
  `formancy.ai built: apps/site/dist, with ${NESTED.map((app) => app.base).join(' and ')}, ` + `a sitemap that matches them, and the headers it is served with`,
)
