/**
 * Where the row a keyboard person arrows to lands in a typeahead's list, in either renderer.
 *
 * A typeahead keeps DOM focus in its text box and names the row arrowed to with
 * `aria-activedescendant`, so the browser scrolls nothing on its own, and a theme draws the list
 * shorter than its options: Blueprint's is 14rem, and the starter's card language has twelve. A
 * person who arrowed past the last row it showed went on hearing rows they could not find on the
 * screen (0072). jsdom lays nothing out and has no `scrollIntoView`, so the renderers' suites can
 * hold only that the call is made; whether the row is then on the screen is measured here.
 *
 * So, on the starter, for the card language in each renderer: after End the last row, and after
 * Home the first, is the one the box names, and lies inside the list's visible box.
 */
const NAME = 'Language on the gift card'

/**
 * What is wrong with the row the box names, or null: that it is not the row `key` goes to, or
 * how far it lies outside the list's visible box. Runs in the page.
 */
function problem(combobox, key) {
  const list = document.getElementById(combobox.getAttribute('aria-controls') ?? '')
  const row = document.getElementById(combobox.getAttribute('aria-activedescendant') ?? '')
  if (list === null || row === null) return 'the box names no row'
  const expected = key === 'End' ? list.lastElementChild : list.firstElementChild
  if (row !== expected) return `the box names “${row.textContent}”, not the row ${key} goes to`
  const shown = list.getBoundingClientRect()
  const top = shown.top + list.clientTop
  const { top: rowTop, bottom: rowBottom } = row.getBoundingClientRect()
  const off = Math.max(0, top - rowTop, rowBottom - (top + list.clientHeight))
  return off < 1 ? null : `“${row.textContent}” is ${String(Math.round(off))}px outside it`
}

/** `read` again until it finds nothing wrong or two seconds pass: each renderer draws on its own schedule. */
async function settled(read) {
  const started = Date.now()
  for (;;) {
    const found = await read()
    if (found === null || Date.now() - started > 2000) return found
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

export async function checkActiveOptionInView(browser, url, check) {
  console.log('\nthe row a typeahead’s list is arrowed to — 1440×1000')
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    const boxes = page.getByRole('combobox', { name: NAME, exact: true })
    await boxes.nth(1).waitFor({ timeout: 30_000 })
    const count = await boxes.count()
    check('both renderers draw the card language as a typeahead', count === 2 ? null : `${String(count)} boxes named “${NAME}”, expected one per renderer`)

    for (const [at, renderer] of ['React', 'Angular'].entries()) {
      const box = boxes.nth(at)
      await box.scrollIntoViewIfNeeded()
      await box.focus()
      await box.press('ArrowDown')
      check(
        `${renderer}: the list opens shorter than its options, so there is somewhere to scroll`,
        await settled(() =>
          box.evaluate((combobox) => {
            const list = document.getElementById(combobox.getAttribute('aria-controls') ?? '')
            if (list === null || combobox.getAttribute('aria-expanded') !== 'true') return 'the list did not open'
            return list.scrollHeight > list.clientHeight ? null : 'every option fits, so this measures nothing'
          }),
        ),
      )

      for (const key of ['End', 'Home']) {
        await box.press(key)
        check(`${renderer}: after ${key}, the row the box names is inside the list’s visible box`, await settled(() => box.evaluate(problem, key)))
      }
      await box.press('Escape')
    }
  } finally {
    await page.close()
  }
}
