/**
 * A time with a precision is typed with real key presses, and Backspace takes back the digit
 * before the separator it crosses.
 *
 * The control keeps the shape `HH:MM:SS` around the digits typed, and every decision about it
 * lives in `@formancy/spec`. What jsdom cannot show is the caret: `fireEvent.change` sets a whole
 * value and moves nothing, so a caret that landed after a colon, or a Backspace that deleted the
 * colon and left the digit, passes every suite and fails the first person to use it. So the
 * starter's `Pickup time` (a `time` with `precision: 0`) is typed into key by key in both
 * renderers, the controls found by role and accessible name only (0034).
 */

/** The renderers draw the one schema in this order, as the signature and select cases read them. */
const RENDERERS = ['React', 'Angular']

export async function checkTemporalEntry(browser, url, check) {
  console.log('\na time with a precision, typed key by key — 1180×820')
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    const controls = page.getByRole('textbox', { name: 'Pickup time' })
    await controls.first().waitFor({ timeout: 30_000 })
    check(
      'both renderers draw the precision time as a text box',
      (await controls.count()) === 2 ? null : `${String(await controls.count())} text boxes, expected one per renderer`,
    )

    for (const [at, renderer] of RENDERERS.entries()) {
      const control = controls.nth(at)
      await control.scrollIntoViewIfNeeded()
      await control.click()
      await page.keyboard.type('080327')
      const typed = await control.inputValue()
      check(`${renderer}: the digits 080327 are shown as 08:03:27`, typed === '08:03:27' ? null : `the control shows “${typed}”`)

      // Two presses left of the end puts the caret just after the second colon, in front of the 2.
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('Backspace')
      const taken = await control.inputValue()
      // The 3 goes, not the colon: the digits that follow slide up into its place.
      check(
        `${renderer}: Backspace across the colon removes the digit before it`,
        taken.startsWith('08:02:7') ? null : `after Backspace the control shows “${taken}”, expected it to start 08:02:7`,
      )
    }
  } finally {
    await page.close()
  }
}
