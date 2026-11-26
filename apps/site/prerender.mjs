// Every page of the site's own build, written into the HTML the build made: the paid
// modules' product pages first (0242), and the landing page, the templates gallery and the
// Angular page with them (0243).
//
// A page that is an empty root a script draws into reads as nothing to a crawler or a link
// preview that runs no script, so each page's words have to be in the HTML the server sends.
// The build is plain Vite, which prerenders nothing, and this is the smallest step that does:
// `pnpm build` runs `vite build` for the pages, then `vite build --ssr src/render.tsx --outDir
// dist/.prerender` for a module Node can run, with the same plugins and defines, and then
// this, which renders each page into its root and removes that module again, so nothing but
// the pages ships. In the browser each page's entry takes the markup over (`src/mount.tsx`).
//
// It refuses a page whose root is not the one it looks for, or is there twice, since writing
// nothing into it would leave the empty root this exists to fill, and the build would still
// succeed. `scripts/build-web.mjs` reads each built page back as well.

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), 'dist')
const bundle = join(dist, '.prerender')

// React picks its production build by this when it is first imported, which is below.
process.env.NODE_ENV ??= 'production'

const entry = existsSync(bundle) ? readdirSync(bundle).find((name) => /^render\.m?js$/.test(name)) : undefined
if (entry === undefined) {
  throw new Error(`No render module in ${bundle}: run \`vite build --ssr src/render.tsx --outDir dist/.prerender\` first.`)
}

const { STATIC_PAGES, renderPage } = await import(pathToFileURL(join(bundle, entry)).href)

for (const page of STATIC_PAGES) {
  const file = join(dist, ...page.page.split('/').filter((part) => part !== ''), 'index.html')
  const html = readFileSync(file, 'utf8')
  const at = html.indexOf(page.root)
  if (at === -1 || html.includes(page.root, at + 1)) {
    throw new Error(`${file} has ${at === -1 ? 'no' : 'more than one'} ${page.root} to render the page into, so it would ship with an empty root.`)
  }
  // A function, not a string: a replacement string reads `$&` and `$1` as patterns, and the
  // page is text nobody here has checked for a dollar sign.
  const markup = renderPage(page)
  const open = page.root.slice(0, -'</div>'.length)
  writeFileSync(
    file,
    html.replace(page.root, () => `${open}${markup}</div>`),
  )
}

rmSync(bundle, { recursive: true, force: true })

console.log(`prerendered ${STATIC_PAGES.map((page) => `/${page.page}${page.page === '' ? '' : '/'}`).join(', ')}`)
