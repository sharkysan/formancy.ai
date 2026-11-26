/**
 * Every page of the site's own build as the server sends it, and as the browser takes it over
 * (0243): what neither jsdom nor the build can see.
 *
 * The build renders each page into its root (`apps/site/prerender.mjs`), in Node, and the
 * page's script takes that markup over in the browser with `hydrateRoot`
 * (`apps/site/src/mount.tsx`). That only works when the browser's first render is the one
 * the server made. A page that read the address, the clock, the window or a media query while
 * rendering draws something else in the browser, and React then throws the server's markup
 * away and draws its own: the page looks right, every check of the HTML passes, and the one
 * sign in a production build is a minified error in the console. So, for each page:
 *
 * - **Its words are in the HTML the server sent**: the root of the response holds `<main>` and
 *   one `<h1>`, as `build-web.mjs` requires of the file.
 * - **The elements React owns are the ones the server sent**: every element at the top of the
 *   root, and the `<main>` among them. Held before any script runs, at the moment the document
 *   is parsed, and compared once React owns every element at the top of the root. React marks
 *   each element it owns with a property of its own, which is read here because nothing public
 *   says that hydration has finished, and waiting a while instead would pass a page that was
 *   slow to be drawn again. React finishes an element after everything in it and after the
 *   elements before it, so it owns the last of them only once it has taken all of the page
 *   over, or thrown it away to draw its own; waiting for the `<main>` alone would compare it
 *   before a footer React was still to find different. This is the check that does not depend
 *   on what React chooses to log.
 * - **Nothing went wrong drawing it**: no error thrown and none logged, React's for markup it
 *   had to correct among them (its errors 418 to 425).
 *
 * And on the landing page, that what the page does still works over markup it did not draw:
 * a tab of the examples changes the example, and reading to the end of the page sends the
 * submission the journey filled in. `?og` on the landing page and on each product page still
 * draws the share card in the page's place, since the root it draws into holds the page.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCT_PAGES } from './product-pages-browser-test.mjs'

/**
 * Every page the site's build rendered to static HTML, read from the built site at `site`:
 * each `index.html` whose root holds a `<main>`, as its address, the landing page first. Read
 * rather than listed, so a page `render.tsx` gains is checked here without anybody adding it.
 * The other apps composed into the site are not among them: the playground's root is empty,
 * and the documentation's pages and the Angular starter have none.
 */
export function staticPages(site) {
  return readdirSync(site, { recursive: true })
    .map((file) => String(file).split(/[\\/]/))
    .filter((parts) => parts.at(-1) === 'index.html')
    .filter((parts) => {
      const html = readFileSync(join(site, ...parts), 'utf8')
      const opened = html.indexOf('<div id="root"')
      return opened !== -1 && /<main\b/.test(html.slice(opened, html.lastIndexOf('</body>')))
    })
    .map((parts) => (parts.length === 1 ? '/' : `/${parts.slice(0, -1).join('/')}/`))
    .sort()
}

/** Whether React owns every element at the top of the root: an own property it sets on each element it renders or hydrates. */
const OWNED = () => {
  const top = [...(document.getElementById('root')?.children ?? [])]
  return top.length > 0 && top.every((element) => Object.keys(element).some((key) => key.startsWith('__reactFiber$')))
}

/**
 * A page opened with what it throws and logs as an error collected, and the elements at the
 * top of its root and its `<main>`, as parsed, held as `window.__served`.
 */
async function open(browser, origin, path) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  // `interactive` is when parsing has finished and before any deferred or module script runs,
  // so what is held is the markup the server sent, before React has seen it.
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return
      window.__served = { top: [...(document.getElementById('root')?.children ?? [])], main: document.querySelector('#root main') }
    })
  })
  const response = await page.goto(`${origin}${path}`, { waitUntil: 'load' })
  return { page, errors, sent: response === null ? '' : await response.text() }
}

export async function checkStaticPages(browser, origin, check, site) {
  console.log('\nthe pages the build renders: sent as HTML, taken over as sent')

  // Read from the build; the landing page and the product pages, which `build-web.mjs`
  // requires of it, being among them says that the reading found the pages at all.
  const pages = staticPages(site)
  const missing = ['/', ...PRODUCT_PAGES].filter((path) => !pages.includes(path))
  check(
    `the build rendered ${pages.join(', ')}, the landing page and each product page among them`,
    missing.length === 0 ? null : `no page rendered into its root at ${missing.join(', ')}`,
  )

  for (const path of pages) {
    const { page, errors, sent } = await open(browser, origin, path)
    try {
      const opened = sent.indexOf('<div id="root"')
      const root = opened === -1 ? '' : sent.slice(opened, sent.lastIndexOf('</body>'))
      check(
        `${path} is sent with its page in its root`,
        /<main\b/.test(root) && (root.match(/<h1\b/g) ?? []).length === 1 ? null : 'the root the server sent holds no page',
      )

      let owned = null
      try {
        await page.waitForFunction(OWNED, null, { timeout: 30_000 })
      } catch {
        owned = 'React never took the elements at the top of the root over'
      }
      const kept = await page.evaluate(() => {
        const now = [...(document.getElementById('root')?.children ?? [])]
        const { top = [], main = null } = window.__served ?? {}
        return {
          served: main instanceof HTMLElement,
          same: main === document.querySelector('#root main') && top.length === now.length && top.every((element, at) => element === now[at]),
        }
      })
      check(
        `and the browser takes it over rather than drawing it again`,
        owned ??
          (!kept.served
            ? 'there was no <main> in the root when the document was parsed'
            : kept.same
              ? null
              : 'the elements on the page are not the ones the server sent: React drew the page again'),
      )

      if (path === '/') {
        // A tab that worked before the markup was React's works over it.
        await page.getByRole('tab', { name: 'Bug report' }).click()
        const selected = await page.getByRole('tab', { name: 'Bug report' }).getAttribute('aria-selected')
        check(`and a tab of the examples changes the example`, selected === 'true' ? null : `the tab is aria-selected=${String(selected)}`)

        // Read to the end, a section at a time, as somebody scrolling would: the journey's
        // observer counts a section once it is in view, and the finale's stamp lands last.
        const ended = await page.evaluate(async () => {
          for (const section of document.querySelectorAll('[data-section]')) {
            section.scrollIntoView({ block: 'center' })
            await new Promise((done) => setTimeout(done, 150))
          }
          for (let waited = 0; waited < 3000 && document.querySelector('.stamp.landed') === null; waited += 100) {
            await new Promise((done) => setTimeout(done, 100))
          }
          return document.querySelector('.stamp.landed') !== null && document.querySelector('.panel .sent') !== null
        })
        check(`and reading to the end sends the submission the journey filled in`, ended ? null : 'the stamp never landed, or the panel never said sent')
      }

      check(`and nothing went wrong drawing it`, errors.length === 0 ? null : errors.join('; ').slice(0, 400))
    } finally {
      await page.close()
    }
  }

  for (const path of ['/', ...PRODUCT_PAGES]) {
    const { page, errors } = await open(browser, origin, `${path}?og`)
    try {
      let drawn = null
      try {
        await page.waitForSelector('#og-card', { timeout: 30_000 })
      } catch {
        drawn = 'no #og-card was drawn'
      }
      const left = await page.evaluate(() => document.querySelectorAll('#root main, #root .bar').length)
      check(
        `${path}?og draws the share card in the page's place`,
        drawn ?? (left === 0 ? null : 'the page the build wrote is still in the root beside the card'),
      )
      check(`and nothing went wrong drawing it`, errors.length === 0 ? null : errors.join('; ').slice(0, 400))
    } finally {
      await page.close()
    }
  }
}
