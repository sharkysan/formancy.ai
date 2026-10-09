/**
 * formancy.ai asks no other site for anything (0154).
 *
 * Every page of the site loaded its type from Google Fonts, and the playground loaded its
 * editor from jsDelivr, so opening any of them told two companies the visitor's address
 * before they had read a word. Nothing could say so: every other gate resolves a page
 * without a network, and a request that fails is a page that still renders, in a fallback
 * face and with an editor that never arrives.
 *
 * So each page is opened with every request routed through here, and anything addressed
 * to an origin other than the test server's is **aborted and recorded** — never let
 * through. That keeps the answer the same on a machine with no network, in CI and behind
 * a proxy: a recorder that let requests out would pass wherever the third party happened
 * to be unreachable, which is the network deciding the result.
 *
 * Routed on the context rather than the page, so the Angular page's frame is covered —
 * and the case checks that it saw the frame's own requests, because a recorder that
 * silently missed a frame would report a clean page.
 *
 * Two things a route never sees are read from the document instead: a `preconnect` or
 * `dns-prefetch` hint opens a connection to its host without making a request, and that
 * connection carries the visitor's address just the same.
 *
 * And because a page that simply stopped loading its fonts, or its editor, would pass all
 * of that, each page is also asked whether what it used to fetch elsewhere arrived from
 * here: its text is drawn in a face the document loaded, and the playground's schema
 * editor is Monaco.
 */

/**
 * The pages, and what each one has to have finished before its requests are counted.
 *
 * One of each kind the composed site serves: the landing page, the two pages beside it,
 * the playground and one page of the documentation, which is a different build (Astro)
 * with its own head.
 */
const PAGES = [
  { path: '/', settle: scrollThrough, ownFaces: true },
  { path: '/templates/', settle: (page) => page.getByRole('heading', { level: 1 }).waitFor(), ownFaces: true },
  { path: '/angular-form-builder/', settle: openTheStarter, ownFaces: true, frame: '/angular-form-builder/demo/' },
  { path: '/playground/', settle: openTheSchemaEditor, ownFaces: true, editor: true },
  // A page with code on it, which is where a documentation theme reaches for a highlighter.
  { path: '/docs/start/react/', settle: scrollThrough, ownFaces: false },
]

/** Down the page and back, so whatever loads lazily near the viewport has been asked for. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
    for (let at = 0; at < document.documentElement.scrollHeight; at += step) {
      window.scrollTo(0, at)
      await new Promise((done) => setTimeout(done, 60))
    }
    window.scrollTo(0, 0)
  })
}

/** The starter is in a lazy frame: brought into view, and waited for until it has rendered. */
async function openTheStarter(page) {
  const frame = page.locator('iframe[src*="/angular-form-builder/demo/"]')
  await frame.scrollIntoViewIfNeeded()
  await page
    .frameLocator('iframe[src*="/angular-form-builder/demo/"]')
    .getByRole('tree')
    .first()
    .waitFor({ timeout: 30_000 })
}

/**
 * The playground with its schema editor open.
 *
 * The editor is only drawn in Schema mode, but Monaco is asked for when the page mounts —
 * so the request happens either way, and opening the mode is what lets the case below see
 * whether the editor arrived. Bounded: on a page whose editor was refused, the wait ends
 * and the case says so rather than hanging the gate.
 */
async function openTheSchemaEditor(page) {
  await page.waitForSelector('[data-formancy-part="signature-surface"]', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Schema', exact: true }).click()
  await page.waitForSelector('.monaco-editor', { timeout: 15_000 }).catch(() => undefined)
}

export async function checkNoForeignRequests(browser, origin, check) {
  console.log('\nrequests to other sites')
  for (const { path, settle, ownFaces, frame, editor } of PAGES) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const foreign = new Set()
    const own = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin === origin) {
        own.push(url.pathname)
        return route.continue()
      }
      foreign.add(url.origin)
      return route.abort('blockedbyclient')
    })

    const page = await context.newPage()
    try {
      await page.goto(`${origin}${path}`, { waitUntil: 'load' })
      await settle(page)
      await page.waitForLoadState('networkidle')

      // Hints, from every frame: a connection opened is an address disclosed.
      for (const each of page.frames()) {
        const hinted = await each.evaluate(() =>
          [...document.querySelectorAll('link[rel~="preconnect"], link[rel~="dns-prefetch"]')].map(
            (link) => ({ href: link.href, rel: link.rel }),
          ),
        )
        for (const { href, rel } of hinted) {
          const at = new URL(href, origin)
          if (at.origin !== origin) foreign.add(`${at.origin} (a ${rel} hint)`)
        }
      }

      check(
        `${path} asks no other site for anything`,
        foreign.size === 0 ? null : `it asked ${[...foreign].sort().join(', ')}`,
      )
      check(
        `and the recorder saw ${path} ask this one, so it was listening`,
        own.length > 0 ? null : 'no request reached the route at all',
      )
      if (frame !== undefined) {
        check(
          'and it saw the embedded starter’s own requests, so a frame is covered',
          own.some((pathname) => pathname.startsWith(frame) && pathname !== frame)
            ? null
            : `nothing under ${frame} was routed besides the frame itself`,
        )
      }

      if (ownFaces) {
        /*
         * The text is drawn in a face this page loaded.
         *
         * The family is read from the cascade — the first one the heading and the body ask
         * for — and looked for among the document's loaded faces, so the case follows
         * whatever the stylesheet names rather than a list written here.
         */
        const faces = await page.evaluate(async () => {
          await document.fonts.ready
          const first = (element) =>
            element === null
              ? null
              : getComputedStyle(element).fontFamily.split(',')[0].replace(/["']/g, '').trim()
          const asked = [...new Set([first(document.querySelector('h1')), first(document.body)])].filter(
            (family) => family !== null,
          )
          const loaded = new Set(
            [...document.fonts]
              .filter((face) => face.status === 'loaded')
              .map((face) => face.family.replace(/["']/g, '')),
          )
          return { asked, missing: asked.filter((family) => !loaded.has(family)) }
        })
        check(
          `and ${path} draws its text in faces the document loaded: ${faces.asked.join(', ')}`,
          faces.missing.length === 0 ? null : `no loaded face for ${faces.missing.join(', ')}`,
        )
      }

      if (editor) {
        const drawn = await page.locator('.monaco-editor').count()
        check(
          'and the playground’s schema editor is Monaco, which arrived rather than being dropped',
          drawn > 0 ? null : 'no Monaco editor on the page in Schema mode',
        )
      }
    } finally {
      await context.close()
    }
  }
}
