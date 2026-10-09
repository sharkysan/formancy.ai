/**
 * The Angular starter's date field shows a calendar button (0149).
 *
 * Material's text field hides Chromium's own calendar button on every input, because its
 * datepicker brings a toggle of its own, and the Material adapter draws a date as the
 * platform's input rather than as Material's datepicker. So the button was gone in Chrome
 * and Edge, and nothing in the cascade can say so: the button is a pseudo-element, and
 * Chromium's `getComputedStyle` for it answers with the input's own values. What can be
 * asked is whether anything is drawn where the button goes — the end of the input, where
 * the field's text never reaches.
 */
export async function checkMaterialDateButton(browser, origin, check) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  // Decoded on a page of its own: the starter's content security policy is the starter's
  // business, and a picture of it is not.
  const blank = await browser.newPage()
  try {
    console.log('\nthe Angular starter’s date field — 1440×900')
    await page.goto(`${origin}/angular-form-builder/demo/`, { waitUntil: 'load' })
    const date = page.getByLabel('Date of travel')
    await date.waitFor({ timeout: 30_000 })
    await date.scrollIntoViewIfNeeded()
    const box = await date.boundingBox()
    const end = await page.screenshot({
      clip: { x: box.x + box.width - 28, y: box.y, width: 28, height: box.height },
    })

    const dark = await blank.evaluate(async (png) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, image.width, image.height)
      let count = 0
      // Darker than mid-grey in every channel: the button's glyph on Material's light
      // field, and nothing else drawn in the last 28 pixels of an empty date input.
      for (let at = 0; at < data.length; at += 4) {
        if (data[at] < 128 && data[at + 1] < 128 && data[at + 2] < 128) count += 1
      }
      return count
    }, end.toString('base64'))

    check(
      'the starter’s date field shows a calendar button, which Material’s stylesheet hides',
      dark >= 20 ? null : `${String(dark)} dark pixels at the end of the input, where the button is drawn`,
    )
  } finally {
    await blank.close()
    await page.close()
  }
}
