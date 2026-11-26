// The paid modules' product pages, written into the HTML the build made (0242).
//
// Every other page of the site is an empty root a script draws into, so a crawler that
// runs no script reads nothing on it. The product pages exist to be found, so their words
// have to be in the HTML the server sends. The build is plain Vite, which prerenders
// nothing, and this is the smallest step that does: `pnpm build` runs `vite build` for the
// pages, then `vite build --ssr src/product-render.tsx --outDir dist/.prerender` for a
// module Node can run, with the same plugins and defines, and then this, which renders
// each page into its root and removes that module again, so nothing but the pages ships.
//
// It refuses a page whose root is not the one it looks for, since writing nothing into it
// would leave the empty root this exists to fill, and the build would still succeed.

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), 'dist')
const bundle = join(dist, '.prerender')

// React picks its production build by this when it is first imported, which is below.
process.env.NODE_ENV ??= 'production'

const entry = existsSync(bundle) ? readdirSync(bundle).find((name) => /^product-render\.m?js$/.test(name)) : undefined
if (entry === undefined) {
  throw new Error(`No product-render module in ${bundle}: run \`vite build --ssr src/product-render.tsx --outDir dist/.prerender\` first.`)
}

const { PRODUCT_IDS, renderProduct } = await import(pathToFileURL(join(bundle, entry)).href)

for (const id of PRODUCT_IDS) {
  const file = join(dist, 'products', id, 'index.html')
  const root = `<div id="root" data-product="${id}"></div>`
  const html = readFileSync(file, 'utf8')
  if (!html.includes(root)) {
    throw new Error(`${file} has no ${root} to render the page into, so it would ship with an empty root.`)
  }
  // A function, not a string: a replacement string reads `$&` and `$1` as patterns, and the
  // page is text nobody here has checked for a dollar sign.
  const page = renderProduct(id)
  writeFileSync(
    file,
    html.replace(root, () => `<div id="root" data-product="${id}">${page}</div>`),
  )
}

rmSync(bundle, { recursive: true, force: true })

console.log(`prerendered ${PRODUCT_IDS.map((id) => `/products/${id}/`).join(', ')}`)
