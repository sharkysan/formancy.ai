/**
 * The paid modules' product pages and the landing page's section on them, in a real browser
 * (0242): what jsdom cannot see.
 *
 * Each page is opened at a phone's width and at the four widths the playground is measured
 * at, down to 320 CSS pixels, which WCAG's reflow criterion names:
 *
 * - **It cannot be scrolled sideways, and every control is inside the viewport.** Measured by
 *   trying to scroll, not by `scrollWidth`: the site hides overflow on the body so its
 *   backdrop can be wider than the screen, and `scrollWidth` then reports overflow on a page
 *   that cannot move. A control parked off the side that comes back when focused is the skip
 *   link, which is the right pattern.
 * - **Nothing in an example is cut off, and none of its words is under 10 pixels.** Each
 *   module's sketch lays itself out by the room its stage gives it, and the stage clips what
 *   overflows, so a table that pushed past its edge would be cut off without the page moving
 *   at all. So every box in a figure that clips, and every sheet of paper, has to hold no more
 *   than it shows, across and down. Report's A4 page set its words by its width and was about
 *   5 pixels on a phone, and clipped what text zoom made larger; 10 pixels is the floor its
 *   stylesheet now keeps, measured from the computed size of every element with words of its
 *   own, in every figure.
 * - **Report's Swiss QR Code reads as one, and can be read** (0244). Every module of it is at
 *   least 1.5 CSS pixels at every width, where a smaller one is grey texture rather than a
 *   code, and a whole number of them, where a fraction draws some modules a pixel wider than
 *   their neighbours; and nothing on the paper, a word or a part's dashed edge, comes within
 *   SIX's 5 mm of white around its 46 (IG 3.5.2), nor does the paper's edge, which a reader
 *   needs clear to find the code. Measured on the landing page's card and on Report's page.
 * - **The landing page's cards are three in a row or one to a row**, never two with Health
 *   alone under them, which they were from 820 to 1280 pixels; and three in a row at the
 *   widest width measured.
 * - **No part of a product page stands alone in half a row** (0245). Two short parts share a
 *   row from 60rem; a part narrower than the row with no part beside it is one half of a pair
 *   whose other half has gone, as *Status* was when *What it does not do yet* left the pages.
 *   Measured from every part's box, so a part left alone anywhere fails, whatever it is.
 * - **A product page's words are in the HTML the server sent**, and the page the browser drew
 *   over it raised no error. The build renders each page into its root (`prerender.mjs`); a
 *   page whose markup React had to correct logs it as an error, and a crawler would have read
 *   the uncorrected one.
 * - **The bar's "Paid modules" link** is shown from 64rem and hidden below it, where the bar
 *   has no room for it; it is never hidden at every width.
 *
 * The landing page is rendered into its root by the same build (0243), so it is held to the
 * same rule at every width here: nothing raised, React's correction of its markup among it.
 * `static-pages-browser-test.mjs` asks of every page the build renders whether the browser
 * took its markup over or drew it again.
 */

/** The product pages the site builds, in the order the footer links the modules. */
export const PRODUCT_PAGES = ['/products/data/', '/products/report/', '/products/health/']

/** 320 for reflow, then a phone, and the playground's tablet portrait, tablet landscape and laptop. */
const WIDTHS = [320, 390, 820, 1180, 1440]

/** The width from which the bar shows "Paid modules": 64rem, at the root's 16px. */
const ROOMY_FROM = 64 * 16

export async function checkProductPages(browser, origin, check) {
  console.log('\nthe paid modules: the product pages and the landing page’s section')

  for (const path of PRODUCT_PAGES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      const response = await page.goto(`${origin}${path}`, { waitUntil: 'load' })
      const sent = response === null ? '' : await response.text()
      const opened = sent.indexOf('<div id="root"')
      const root = opened === -1 ? '' : sent.slice(opened)
      check(
        `${path} is sent with its page in its root, a heading and the module's terms`,
        /<main\b/.test(root) && /<h1\b/.test(root) && root.includes('Not free · paid in production') ? null : 'the root the server sent holds no page',
      )
    } finally {
      await page.close()
    }
  }

  for (const width of WIDTHS) {
    for (const path of ['/', ...PRODUCT_PAGES]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      // React says a markup it had to correct as a console error, on the landing page as on a
      // product page, since the build renders both (0243).
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      try {
        await page.goto(`${origin}${path}`, { waitUntil: 'load' })
        await page.waitForSelector(path === '/' ? '#modules figure' : 'main h1', { timeout: 30_000 })
        const found = await page.evaluate((roomyFrom) => {
          const root = document.scrollingElement ?? document.documentElement
          root.scrollLeft = 9999
          const slid = root.scrollLeft
          root.scrollLeft = 0

          const edge = document.documentElement.clientWidth
          const past = []
          for (const control of document.querySelectorAll('a, button, input, select, textarea, summary')) {
            const box = control.getBoundingClientRect()
            if (box.width === 0 || box.height === 0) continue
            if (box.right <= edge + 1 && box.left >= -1) continue
            control.focus({ preventScroll: true })
            const focused = control.getBoundingClientRect()
            if (focused.right <= edge + 1 && focused.left >= -1) continue
            past.push(`${control.tagName} ${(control.textContent ?? '').trim().slice(0, 32)}`)
          }
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()

          // A box that clips, or a sheet of paper, holding more than it shows. Asked of the
          // computed overflow rather than of a list of classes, so a box that starts clipping
          // tomorrow is measured too.
          const cut = []
          const small = []
          for (const figure of document.querySelectorAll('figure.mx')) {
            for (const element of figure.querySelectorAll('*')) {
              // Words read to assistive technology and not drawn are clipped on purpose.
              if (element.closest('.visually-hidden') !== null) continue
              const style = getComputedStyle(element)
              const clips = style.overflowX !== 'visible' || style.overflowY !== 'visible'
              if ((clips || element.classList.contains('mx-paper')) && element.clientHeight > 0) {
                const across = element.scrollWidth - element.clientWidth
                const down = element.scrollHeight - element.clientHeight
                if (across > 1 || down > 1) cut.push(`${String(element.className)}: ${String(across)}px across, ${String(down)}px down`)
              }
              const words = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '')
              if (words && parseFloat(style.fontSize) < 10) {
                small.push(`${String(element.className) || element.tagName} at ${style.fontSize}`)
              }
            }
          }

          // Each Swiss QR Code (0244): what a module measures, and anything on its paper that
          // is not the code, holds it or is held by it, within SIX's 5 mm of its 46, or the
          // paper's edge there. Half a pixel is allowed for a box that only touches it.
          const codes = []
          for (const svg of document.querySelectorAll('figure.mx svg.mx-qr')) {
            const box = svg.getBoundingClientRect()
            const quiet = (box.width * 5) / 46
            const zone = { left: box.left - quiet, right: box.right + quiet, top: box.top - quiet, bottom: box.bottom + quiet }
            const paper = svg.closest('.mx-paper')
            const edge = paper?.getBoundingClientRect()
            const near = []
            if (
              edge === undefined ||
              zone.left < edge.left - 0.5 ||
              zone.right > edge.right + 0.5 ||
              zone.top < edge.top - 0.5 ||
              zone.bottom > edge.bottom + 0.5
            ) {
              near.push('the paper’s edge')
            }
            for (const element of paper?.querySelectorAll('*') ?? []) {
              if (element.contains(svg) || svg.contains(element)) continue
              const other = element.getBoundingClientRect()
              if (other.width === 0 || other.height === 0) continue
              if (other.left < zone.right - 0.5 && other.right > zone.left + 0.5 && other.top < zone.bottom - 0.5 && other.bottom > zone.top + 0.5) {
                near.push(String(element.getAttribute('class') ?? element.tagName))
              }
            }
            codes.push({ module: box.width / svg.viewBox.baseVal.width, near: [...new Set(near)].slice(0, 3) })
          }

          // A product page's parts narrower than the row `<main>` gives them, with no other part
          // starting beside them (0245). A quarter of the row is allowed for, since a part in
          // a row of two is under half of it and a part across the page is all of it.
          const main = document.querySelector('main')
          const padding = main === null ? null : getComputedStyle(main)
          const row = main === null || padding === null ? 0 : main.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight)
          const parts = [...document.querySelectorAll('main .product-section')].map((part) => ({ id: part.id, box: part.getBoundingClientRect() }))
          const alone = parts
            .filter(({ box }) => box.width < row * 0.75)
            .filter(({ id, box }) => !parts.some((other) => other.id !== id && Math.abs(other.box.top - box.top) < 1))
            .map(({ id }) => id)

          // The cards' rows, by where each card starts: one row of three, or one row each.
          const rows = new Set([...document.querySelectorAll('.module-card')].map((card) => Math.round(card.getBoundingClientRect().top)))
          const cards = document.querySelectorAll('.module-card').length

          const modules = [...document.querySelectorAll('.bar nav a')].find((link) => link.getAttribute('href')?.endsWith('#modules'))
          const shown = modules === undefined ? null : getComputedStyle(modules).display !== 'none'
          // `max-width: 64rem` hides it at 64rem itself, so it is shown only past it.
          return {
            slid,
            past: [...new Set(past)].slice(0, 6),
            cut: cut.slice(0, 4),
            small: [...new Set(small)].slice(0, 4),
            rows: rows.size,
            cards,
            shown,
            roomy: window.innerWidth > roomyFrom,
            figures: document.querySelectorAll('figure.mx').length,
            codes,
            parts: parts.length,
            alone,
          }
        }, ROOMY_FROM)

        check(`${path} at ${String(width)}px cannot be scrolled sideways`, found.slid === 0 ? null : `it slid ${String(found.slid)}px`)
        check(`and every control on it is inside the viewport`, found.past.length === 0 ? null : `off the edge: ${found.past.join(', ')}`)
        check(
          `and nothing in a module's example is cut off`,
          found.figures === 0 ? 'no example on the page, so nothing was measured' : found.cut.length === 0 ? null : `cut off: ${found.cut.join('; ')}`,
        )
        check(`and no word in one is under 10px`, found.small.length === 0 ? null : `too small: ${found.small.join('; ')}`)
        if (path === '/' || path === '/products/report/') {
          const fine = found.codes.filter((code) => code.module < 1.5).map((code) => `${code.module.toFixed(2)}px`)
          check(
            `and every module of Report's Swiss QR Code is at least 1.5px`,
            found.codes.length === 0 ? 'no Swiss QR Code on the page' : fine.length === 0 ? null : `a module of ${fine.join(', ')}`,
          )
          const split = found.codes.filter((code) => Math.abs(code.module - Math.round(code.module)) > 0.01).map((code) => `${code.module.toFixed(3)}px`)
          check(
            `and a whole number of pixels`,
            found.codes.length === 0 ? 'no Swiss QR Code on the page' : split.length === 0 ? null : `a module of ${split.join(', ')}`,
          )
          const crowded = found.codes.filter((code) => code.near.length > 0).map((code) => code.near.join(', '))
          check(
            `and nothing comes within its quiet zone`,
            found.codes.length === 0 ? 'no Swiss QR Code on the page' : crowded.length === 0 ? null : `within 5 mm of it: ${crowded.join('; ')}`,
          )
        }
        if (path !== '/') {
          check(
            `and no part of it stands alone in half a row`,
            found.parts === 0
              ? 'no part on the page, so nothing was measured'
              : found.alone.length === 0
                ? null
                : `alone in half a row: ${found.alone.join(', ')}`,
          )
        }
        if (path === '/') {
          const widest = width === WIDTHS[WIDTHS.length - 1]
          check(
            `and the modules' cards are ${widest ? 'three in a row' : 'three in a row or one to a row'}`,
            found.cards !== 3
              ? `${String(found.cards)} cards on the page`
              : found.rows === 1 || (!widest && found.rows === 3)
                ? null
                : `they are on ${String(found.rows)} rows`,
          )
        }
        check(
          `and the bar's "Paid modules" is ${found.roomy ? 'shown' : 'hidden'} at this width`,
          found.shown === null ? 'no "Paid modules" link in the bar' : found.shown === found.roomy ? null : `it is ${found.shown ? 'shown' : 'hidden'}`,
        )
        check(`and nothing went wrong drawing it`, errors.length === 0 ? null : errors.join('; ').slice(0, 400))
      } finally {
        await page.close()
      }
    }
  }
}
