/**
 * Where the panes beside the starter's suggestions sit, in either builder.
 *
 * The suggestions are the playground's own list, drawn by each builder beside the panes that
 * ask a model. In the React builder the list is a grid item of `.builder-pane`, spaced by its
 * gap, and on a demo without suggestions it is not drawn at all. In the Angular builder it is
 * a `formancy-playground-suggestions` element, which is in the document on every demo whether
 * it draws a list or not. The room around a list was first given to that element, so on every
 * demo but the starter the Angular builder put 14px above its prompt box and its language
 * chooser where nothing was drawn, and laid the same document out differently from the React
 * builder. jsdom measures every box at zero, and the suite compares the two builders' lists by
 * name, so only a browser can see it.
 *
 * So, on the starter, which has suggestions, and on the wizard, which has none: the prompt
 * box under Fields, and the language chooser under Translations, sit as far below the top of
 * the builder in the Angular builder as in the React one.
 */

/** What each tab's suggestions sit above, found by role and accessible name. */
const ANCHORS = [
  { tab: 'Fields', what: 'prompt box', find: (within) => within.getByRole('textbox', { name: /Describe the form/ }) },
  {
    tab: 'Translations',
    what: 'language chooser',
    find: (within) => within.getByRole('combobox', { name: 'Language', exact: true }),
  },
]

/** How far below the top of the builder `anchor` sits, read until two readings agree. */
async function offset(page, anchor) {
  const read = async () => {
    const builder = await page.locator('.builder-pane').boundingBox()
    const box = await anchor.boundingBox()
    return box.y - builder.y
  }
  const started = Date.now()
  let last = await read()
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const now = await read()
    if (Math.abs(now - last) < 0.5 || Date.now() - started > 5000) return now
    last = now
  }
}

export async function checkSuggestionsPlacement(browser, url, check) {
  console.log('\nthe panes beside the suggestions, in either builder — 1440×1000')
  for (const demo of ['starter', 'wizard']) {
    for (const { tab, what, find } of ANCHORS) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
      try {
        await page.goto(url, { waitUntil: 'load' })
        await page.getByRole('button', { name: 'Build', exact: true }).click()
        await page.getByRole('combobox', { name: 'Demo' }).selectOption(demo)
        await page.getByRole('button', { name: tab, exact: true }).click()
        await page.evaluate(() => document.fonts.ready)

        const react = find(page.locator('.builder-pane'))
        await react.waitFor({ timeout: 10_000 })
        const inReact = await offset(page, react)

        await page.getByRole('combobox', { name: 'Builder' }).selectOption('angular')
        const angular = find(page.locator('formancy-playground-angular-builder'))
        await angular.waitFor({ timeout: 15_000 })
        const inAngular = await offset(page, angular)

        check(
          `${demo}, ${tab}: the ${what} sits as far below the builder’s top in the Angular builder as in the React one`,
          Math.abs(inReact - inAngular) < 0.5
            ? null
            : `React ${String(inReact)}px, Angular ${String(inAngular)}px — ${String(inAngular - inReact)}px where nothing is drawn`,
        )
      } finally {
        await page.close()
      }
    }
  }
}
