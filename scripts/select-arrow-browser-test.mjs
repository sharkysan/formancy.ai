import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A select draws its arrow inside the room it keeps for it, in every shipped theme and in both
 * reading orders.
 *
 * Each theme takes the platform's arrow off a select (`appearance: none`) and draws its own as a
 * background image, with room kept for it at the end of the line. The rule every control shares,
 * `:is(input, select, textarea, [data-formancy-part='richtext-surface'])`, weighs as much as its
 * heaviest branch, an attribute, so it outweighed the select's own rule wherever the two set one
 * property. Blueprint's `background` shorthand took the drawn arrow away, and every theme's `padding`
 * gave the text back the room kept for it. A select read as a text box with nothing to say it opens
 * (measured on 0.13.0, 2026-11-15, #345). And the arrow sits at a named side, because CSS has no
 * logical `background-position`, while the room is logical: right to left, the two part company
 * unless the side is named again. jsdom applies no CSS, so the question is asked here.
 *
 * So, on the playground's form, with each theme in turn on both renderers' sheets, left to right
 * and then right to left: every enabled single select has a background image, and each of its
 * layers lies inside the padding at the select's end. Where a layer lies is resolved by the
 * browser, not read from the stylesheet's wording.
 */
const repo = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The form themes, by the name each scopes itself to: a stylesheet that says
 * `[data-formancy-theme='…']` is one a host can choose, as `apps/docs/src/themes.test.ts` tells
 * them apart. A new theme is held here the moment it exists.
 */
function themeNames() {
  const directory = join(repo, 'packages', 'themes')
  return readdirSync(directory)
    .filter((name) => name.endsWith('.css'))
    .map((name) => /\[data-formancy-theme='([a-z-]+)'\]/.exec(readFileSync(join(directory, name), 'utf8'))?.[1])
    .filter((name) => name !== undefined)
}

/** Each theme put on every sheet in turn, in each reading order, and where each select's arrow lies. Runs in the page. */
function measure(themes) {
  const selects = [...document.querySelectorAll('[data-formancy-theme] [data-formancy-part="field"] select:not([multiple], :disabled)')]
  const sheets = [...new Set(selects.map((select) => select.closest('[data-formancy-theme]')))]
  const was = sheets.map((sheet) => sheet.getAttribute('data-formancy-theme'))

  /*
   * A layer's horizontal position, resolved as the browser resolves it: a percentage of the box
   * less the tile, plus or minus a length. `left` on a child of a box that wide resolves the
   * computed `calc(100% - 18px)` the same way, so nothing here parses one.
   */
  const box = document.createElement('div')
  box.style.cssText = 'position: absolute; top: 0; left: 0; height: 0; visibility: hidden'
  const pin = document.createElement('div')
  pin.style.cssText = 'position: absolute; top: 0'
  box.append(pin)
  document.body.append(box)
  const resolve = (position, width) => {
    box.style.width = `${String(width)}px`
    pin.style.left = position
    return pin.getBoundingClientRect().left - box.getBoundingClientRect().left
  }

  const measured = []
  for (const direction of ['ltr', 'rtl']) {
    document.documentElement.setAttribute('dir', direction)
    for (const theme of themes) {
      for (const sheet of sheets) sheet.setAttribute('data-formancy-theme', theme)
      for (const select of selects) {
        const style = getComputedStyle(select)
        // The padding box, where a background is placed.
        const width = select.clientWidth
        const end = parseFloat(style.paddingInlineEnd)
        const room = direction === 'rtl' ? [0, end] : [width - end, width]
        const tiles = style.backgroundSize.split(',').map((size) => parseFloat(size))
        const layers = style.backgroundPositionX.split(',').map((position, at) => {
          const tile = tiles[at % tiles.length] ?? Number.NaN
          const from = resolve(position.trim(), width - tile)
          return [from, from + tile]
        })
        measured.push({
          direction,
          theme,
          sheet: sheets.indexOf(select.closest('[data-formancy-theme]')),
          label: select.labels?.[0]?.textContent?.trim() ?? select.name,
          image: style.backgroundImage,
          room,
          layers,
        })
      }
    }
  }

  document.documentElement.removeAttribute('dir')
  sheets.forEach((sheet, at) => sheet.setAttribute('data-formancy-theme', was[at] ?? ''))
  box.remove()
  return { sheets: sheets.length, measured }
}

/** Half a pixel either way: a resolved position is fractional, and the comparison is not about rounding. */
const SLACK = 0.5

export async function checkSelectArrow(browser, url, check) {
  console.log('\na select’s arrow in every theme, both reading orders — 1180×820')
  const themes = themeNames()
  check('the themes are found, so there is something to put on the form', themes.length > 1 ? null : `${String(themes.length)} themes found`)
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForSelector('[data-formancy-part="field"] select', { timeout: 30_000 })
    const { sheets, measured } = await page.evaluate(measure, themes)
    // One sheet per renderer, in the order the page draws them, as the signature case reads them.
    check('both renderers draw a select on the playground', sheets === 2 ? null : `${String(sheets)} sheets hold a select, expected one per renderer`)
    for (const { direction, theme, sheet, label, image, room, layers } of measured) {
      const where = `${theme}, ${direction}, ${sheet === 0 ? 'React' : 'Angular'}’s “${label}”`
      if (image === 'none') {
        check(`${where} draws its arrow`, 'background-image is none, and the platform’s arrow is off')
        continue
      }
      const [from, to] = room
      const outside = layers.filter(([left, right]) => !(left >= from - SLACK && right <= to + SLACK))
      check(
        `${where} draws its arrow inside the room it keeps for it`,
        outside.length === 0
          ? null
          : `the room is ${from.toFixed(1)}–${to.toFixed(1)}px and the arrow lies at ${outside.map(([left, right]) => `${left.toFixed(1)}–${right.toFixed(1)}px`).join(' and ')}`,
      )
    }
  } finally {
    await page.close()
  }
}
