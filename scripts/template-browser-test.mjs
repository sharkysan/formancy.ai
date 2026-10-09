import { readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync(new URL('../templates/catalog.json', import.meta.url), 'utf8'))

/** The gallery is a built HTML entry point, not a development-server fallback. */
export async function checkTemplateGallery(browser, origin, check) {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(`${origin}/templates/`)
      await page.getByRole('heading', { name: /A head start/ }).waitFor()
      const count = await page.getByRole('article').count()
      check(`templates at ${width}px: every catalogue entry is discoverable`, count === catalog.templates.length ? null : `${count} cards`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      check(`templates at ${width}px: no horizontal overflow`, overflow ? 'page overflows' : null)

      await page.getByRole('button', { name: 'Sales', exact: true }).click()
      await page.getByRole('combobox', { name: 'Template language' }).selectOption('de')
      const opener = page.getByRole('button', { name: 'Preview Verkaufsanfrage' })
      await opener.click()
      const dialog = page.getByRole('dialog', { name: 'Verkaufsanfrage' })
      await dialog.waitFor({ state: 'visible' })
      await dialog.getByRole('radio', { name: 'Telefon', exact: true }).click()
      await dialog.getByRole('textbox', { name: 'Telefonnummer' }).fill('+41 00 000 00 00')
      await dialog.getByRole('radio', { name: 'E-Mail', exact: true }).click()
      check(`templates at ${width}px: the preview executes conditional logic`, await dialog.getByRole('textbox', { name: 'Telefonnummer' }).count() === 0 ? null : 'phone remains visible')
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      check(`templates at ${width}px: closing the modal restores focus`, await opener.evaluate((element) => element === document.activeElement) ? null : 'focus was not restored')

      const received = page.waitForEvent('download')
      await page.getByRole('link', { name: 'Download Verkaufsanfrage JSON' }).click()
      const download = await received
      const file = await download.path()
      const schema = file === null ? undefined : JSON.parse(readFileSync(file, 'utf8'))
      check(`templates at ${width}px: downloading returns the actual form JSON`, schema?.id === 'sales-lead-enquiry' && download.suggestedFilename() === 'lead-enquiry.form.json' ? null : 'wrong download')
      check(`templates at ${width}px: the gallery has no runtime errors`, errors.length === 0 ? null : errors.join('; '))

      // Whether Monaco arrives is the request gate's question (0154), not this
      // gallery's; the template and locale must initialise whether or not it has.
      await page.getByRole('link', { name: 'Edit Verkaufsanfrage in playground' }).click()
      await page.getByRole('region', { name: 'React', exact: true }).getByRole('textbox', { name: 'Vor- und Nachname' }).waitFor()
      check(`templates at ${width}px: edit opens the chosen document and language`, await page.getByRole('combobox', { name: 'Demo', exact: true }).inputValue() === 'sales-lead-enquiry' && await page.getByRole('combobox', { name: 'Language', exact: true }).inputValue() === 'de' ? null : 'wrong editor state')
    } finally {
      await page.close()
    }
  }
}
