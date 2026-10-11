/**
 * The same document, laid out the same in either builder.
 *
 * The two builders share their markup and their stylesheet: every part is named by
 * `data-formancy-part`, and the workbench theme places it by that name. What the React builder
 * has and the Angular one does not is the element a component is drawn in. Placed by a grid or
 * a flex row, such an element is a box of its own whether it draws anything or not, and the
 * rules written for the part inside it no longer reach the row. That has shipped twice.
 * `formancy-playground-suggestions` put 14px above the prompt box where nothing was drawn,
 * which `suggestions-browser-test.mjs` measures. Then `formancy-translation-review`, empty on
 * the default language, took the first cell of the translations pane's two columns. The table
 * a translator works in moved to the narrow one, and the preview moved down under it.
 *
 * jsdom measures every box at zero, and the suite compares the two builders by role and
 * accessible name, which an empty box has neither of. So a browser opens each tab of the
 * starter in either builder and reads every part's box relative to the builder pane. The same
 * part in the same place in both, to the pixel, is the whole check. It is not a pixel
 * comparison, because the parts are found by name and only their geometry is compared.
 *
 * It stops at the form a translation preview holds. That form is a renderer's, drawn by the
 * React renderer in one builder and the Angular renderer in the other, and the renderers are
 * compared by their own suite. Their boxes differ there for a reason that is no layout rule:
 * in Chromium, a React select whose options were re-worded in place keeps the width of its
 * longest old one until something lays it out again. That is 8px on the starter in French,
 * enough to wrap the country under its label. So the preview's place and width are compared,
 * because they are the builder's, and its height and everything in it are not, because they
 * are the form's.
 */

/** A builder part that holds a renderer's form. */
const HOLDS_A_FORM = "[data-formancy-part='translations-preview']"

/** Each view the builder draws, and what makes it show more than its empty state. */
const VIEWS = [
  {
    // A choice field, so the property panel draws its options editor as well.
    view: 'Fields, a choice field selected',
    tab: 'Fields',
    open: (pane) => pane.getByRole('treeitem', { name: /^Country/ }).first().click(),
  },
  {
    view: 'Arrangement, a row selected',
    tab: 'Arrangement',
    open: (pane) => pane.getByRole('treeitem', { name: /Row with First name/ }).first().click(),
  },
  { view: 'Rules', tab: 'Rules', open: async () => {} },
  { view: 'Translations, the default language', tab: 'Translations', open: async () => {} },
  {
    // French is half-finished in the starter on purpose, so the model's review is drawn.
    view: 'Translations, French',
    tab: 'Translations',
    open: (pane) => pane.getByRole('combobox', { name: 'Language', exact: true }).selectOption('fr'),
  },
]

/** Every part's box, relative to the builder pane, read until two readings agree. */
async function parts(page) {
  const read = () =>
    page.locator('.builder-pane').evaluate((pane, holdsAForm) => {
      const origin = pane.getBoundingClientRect()
      const seen = new Map()
      return [...pane.querySelectorAll('[data-formancy-part]')]
        .filter((element) => element.parentElement?.closest(holdsAForm) === null)
        .map((element) => {
          const name = element.getAttribute('data-formancy-part')
          seen.set(name, (seen.get(name) ?? 0) + 1)
          const box = element.getBoundingClientRect()
          return {
            part: `${name} ${String(seen.get(name))}`,
            x: box.x - origin.x,
            y: box.y - origin.y,
            width: box.width,
            // The form's, not the builder's: see the top of this file.
            height: element.matches(holdsAForm) ? null : box.height,
          }
        })
    }, HOLDS_A_FORM)
  const started = Date.now()
  let last = JSON.stringify(await read())
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const now = JSON.stringify(await read())
    if (now === last || Date.now() - started > 8000) return JSON.parse(now)
    last = now
  }
}

/** Where the Angular builder put a part somewhere else than the React one, in words. */
function differences(react, angular) {
  if (react.length !== angular.length) {
    const names = (list) => new Set(list.map(({ part }) => part))
    const inAngular = names(angular)
    const inReact = names(react)
    return [
      `${String(react.length)} parts in React, ${String(angular.length)} in Angular`,
      ...[...inReact].filter((part) => !inAngular.has(part)).map((part) => `${part} only in React`),
      ...[...inAngular].filter((part) => !inReact.has(part)).map((part) => `${part} only in Angular`),
    ]
  }
  const round = (n) => String(Math.round(n))
  const at = ({ x, y, width, height }) =>
    `${round(x)},${round(y)} ${round(width)}×${height === null ? 'its form' : round(height)}`
  return react.flatMap((box, index) => {
    const other = angular[index]
    if (other.part !== box.part) return [`${box.part} in React where Angular has ${other.part}`]
    const moved = ['x', 'y', 'width', 'height'].some(
      (side) => box[side] !== null && Math.abs(box[side] - other[side]) > 1,
    )
    return moved ? [`${box.part} at ${at(box)} in React, ${at(other)} in Angular`] : []
  })
}

export async function checkBuildersLayAlike(browser, url, check) {
  console.log('\nevery part of the builder, in either builder — 1440×1000')
  for (const { view, tab, open } of VIEWS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    try {
      await page.goto(url, { waitUntil: 'load' })
      await page.getByRole('button', { name: 'Build', exact: true }).click()
      await page.getByRole('combobox', { name: 'Demo' }).selectOption('starter')
      await page.evaluate(() => document.fonts.ready)

      // The tabs are the playground's, above whichever builder is drawn under them.
      const show = async () => {
        await page.locator('.builder-pane').getByRole('button', { name: tab, exact: true }).click()
        await open(page.locator('.builder-pane'))
        return parts(page)
      }
      const react = await show()
      await page.getByRole('combobox', { name: 'Builder' }).selectOption('angular')
      await page.locator('formancy-playground-angular-builder [data-formancy-part]').first().waitFor({ timeout: 15_000 })
      const angular = await show()

      const found = differences(react, angular)
      check(
        `${view}: every part sits where the React builder puts it, ${String(react.length)} of them`,
        found.length === 0 ? null : `${found.slice(0, 4).join('; ')}${found.length > 4 ? `; and ${String(found.length - 4)} more` : ''}`,
      )
    } finally {
      await page.close()
    }
  }
}
