/**
 * On a phone, what the browser scrolls into view is not put under the playground's pane switch.
 *
 * Below the breakpoint the switch sticks to the top of the window, over whatever has scrolled under
 * it, and the browser cannot tell: by the window's own measure what lies under the switch is in
 * view. So a box given the keyboard by Tab while its top lay under the switch stayed there, hidden
 * whole, and a typeahead's list scrolled into view stayed with its first rows under the switch's
 * buttons, which `field-beside-browser-test.mjs` failed on now and then: the starter shuffles the
 * options of *Add to your order*, and in one order they took a line more, which left the pickup
 * point's list there (seen 2026-11-16). The playground's `scroll-padding-top` gives that band
 * to the switch. jsdom scrolls nothing and stacks nothing, so only a browser can say where a box
 * lands under it.
 *
 * So, at 390×844: React's *Pickup time* is placed with its top under the switch, the keyboard put
 * in the box before it, *Dispatched at*, and Tab pressed. The box the keyboard reaches lies below the
 * switch, and is what the browser hits at its centre. Found by role and accessible name (0034).
 */
export async function checkPaneSwitchClear(browser, url, check) {
  console.log('\nwhat the browser scrolls into view lies below the pane switch — phone, 390×844')
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    const before = page.getByRole('textbox', { name: 'Dispatched at', exact: true }).first()
    const target = page.getByRole('textbox', { name: 'Pickup time', exact: true }).first()
    await target.waitFor({ timeout: 30_000 })
    const pane = page.getByRole('navigation', { name: 'Pane', exact: true })

    // The box's top 8px below where the switch sticks, its own `top`: until the page has scrolled
    // it sits lower, under the title bar. Then the keyboard in the box before it, without the
    // scroll a focus would make.
    const stuck = await pane.evaluate(
      (switcher, box) => {
        window.scrollBy(0, box.getBoundingClientRect().top - (parseFloat(getComputedStyle(switcher).top) + 8))
        return box.getBoundingClientRect().top < switcher.getBoundingClientRect().bottom
      },
      await target.elementHandle(),
    )
    check('the box is placed under the switch, so there is something for Tab to move', stuck ? null : 'the box lay clear of the switch before Tab')
    await before.evaluate((box) => box.focus({ preventScroll: true }))
    await page.keyboard.press('Tab')

    const seen = await target.evaluate(
      (box, switcher) => {
        const { top, bottom, left, right } = box.getBoundingClientRect()
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
        return {
          focused: document.activeElement === box,
          top,
          bottom,
          under: switcher.getBoundingClientRect().bottom,
          hit: hit === box ? null : hit === null ? 'nothing' : `${hit.tagName.toLowerCase()}${switcher.contains(hit) ? ', in the switch,' : ''}`,
        }
      },
      await pane.elementHandle(),
    )
    check('Tab from Dispatched at gives the keyboard to Pickup time', seen.focused ? null : 'the keyboard went elsewhere')
    check(
      'the box the keyboard reached lies below the switch, inside the window',
      seen.top >= seen.under && seen.bottom <= 844
        ? null
        : `the box runs ${seen.top.toFixed(1)}–${seen.bottom.toFixed(1)}px and the switch ends at ${seen.under.toFixed(1)}px`,
    )
    check('and is what the browser hits at its centre', seen.hit === null ? null : `${seen.hit} is drawn over it`)
  } finally {
    await page.close()
  }
}
