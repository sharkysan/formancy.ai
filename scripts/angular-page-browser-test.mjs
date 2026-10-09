/**
 * `/angular-form-builder/` in a real browser: the page fits a phone, and the demo it embeds
 * is the Angular starter actually running — served from `/angular-form-builder/demo/` by
 * `build-web.mjs`. A starter built for the wrong place loads a blank frame, and every
 * other gate would pass: jsdom never loads an iframe, and the build log says it succeeded.
 */
const DEMO = 'The Angular starter: a form builder and the form it builds'

export async function checkAngularPage(browser, origin, check) {
  console.log('\nthe Angular page')
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(`${origin}/angular-form-builder/`, { waitUntil: 'load' })
      await page.getByRole('heading', { level: 1 }).waitFor()

      // Measured by trying to scroll, not by `scrollWidth`: the site hides overflow on the
      // body so its backdrop can be wider than the screen, and `scrollWidth` then reports
      // overflow on a page that cannot move.
      const slid = await page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement
        root.scrollLeft = 9999
        const moved = root.scrollLeft
        root.scrollLeft = 0
        return moved
      })
      check(
        `/angular-form-builder/ at ${width}px cannot be scrolled sideways`,
        slid === 0 ? null : `it slid ${String(slid)}px`,
      )

      // Lazy, so it loads only near the viewport: brought there as a reader scrolling would.
      const frame = page.locator(`iframe[title="${DEMO}"]`)
      await frame.scrollIntoViewIfNeeded()
      const demo = page.frameLocator(`iframe[title="${DEMO}"]`)
      let running = null
      try {
        await demo
          .getByRole('heading', { level: 1, name: 'Expense claim' })
          .waitFor({ timeout: 30_000 })
        await demo.getByRole('tree').first().waitFor({ timeout: 30_000 })
      } catch (error) {
        running = `the embedded starter did not render: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
      }
      check(`and at ${width}px the demo is the starter, running`, running)
      check(`and at ${width}px nothing threw`, errors.length === 0 ? null : errors.join('; '))
    } finally {
      await page.close()
    }
  }
}
