import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * What a host draws beside a field's box sits on the box's line, joined to it, in every shipped
 * theme and in both reading orders (0237).
 *
 * The renderers only wrap the box and the host's content in a row; that the two then read as one
 * field is the theme's. Each lays the row out as a line, the box taking what the button leaves and
 * shrinking on a narrow screen, the button stretched to the box's height, and the frame, the
 * underline, the fill or the shadow continued across both. jsdom applies no CSS and lays nothing
 * out, so a row that wrapped the button onto the next line, a button a few pixels short of the box,
 * a gap between them, or a row that pushed past its field on a phone would pass every other suite.
 * And the typeahead's list is placed against its box, inside the row: a list placed against the
 * row would open under the button too. A row that casts a shadow under the pair casts the one a
 * box alone casts in that theme: Pop's row first had its shadow named again for right to left, and
 * read right to left it fell left beside every other box's, which fell right (seen 2026-11-15).
 *
 * So, on the playground's form, which draws a button beside the pickup point's typeahead and beside
 * the country's select in both renderers, with each theme in turn on both sheets, left to right and
 * then right to left, at a desk's width and at a phone's: the button is the box's height, at least
 * 44px wide, and touches the box at the box's inline end; the row is as wide as its field, and
 * casts no shadow or a lone text box's; and the pickup point's list, opened from the keyboard,
 * lies within its box. Where each lies is the browser's layout, read from the boxes it drew. That
 * the pair *reads* as one field is a judgement of the eye, which no measurement here makes.
 */
const repo = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The form themes, by the name each scopes itself to, as `select-arrow-browser-test.mjs` finds them. */
function themeNames() {
  const directory = join(repo, 'packages', 'themes')
  return readdirSync(directory)
    .filter((name) => name.endsWith('.css'))
    .map((name) => /\[data-formancy-theme='([a-z-]+)'\]/.exec(readFileSync(join(directory, name), 'utf8'))?.[1])
    .filter((name) => name !== undefined)
}

/**
 * Each theme put on every sheet in turn, in each reading order, and where each row's box, button
 * and list lie. Runs in the page. The box is the select, or the typeahead's text box, which is what
 * the eye sees beside the button, rather than the anchor around it.
 */
function measure(themes) {
  const rows = [...document.querySelectorAll('[data-formancy-theme] [data-formancy-part="field-control-row"]')]
  const sheets = [...new Set(rows.map((row) => row.closest('[data-formancy-theme]')))]
  const was = sheets.map((sheet) => sheet.getAttribute('data-formancy-theme'))
  const edges = (element) => {
    if (element === null) return null
    const { left, right, top, bottom } = element.getBoundingClientRect()
    return { left, right, top, bottom, width: right - left, height: bottom - top }
  }

  const measured = []
  for (const direction of ['ltr', 'rtl']) {
    document.documentElement.setAttribute('dir', direction)
    for (const theme of themes) {
      for (const sheet of sheets) sheet.setAttribute('data-formancy-theme', theme)
      // A theme eases its shadows in, so read straight after the switch a shadow is where the
      // last theme left it: the transitions the switch started are ended first.
      for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish()
      // The shadow a box casts with nothing beside it: each sheet's first enabled text box.
      const lone = new Map(
        sheets.map((sheet) => {
          const box = [...sheet.querySelectorAll('[data-formancy-part="field"] input[type="text"]:not(:disabled)')].find(
            (input) => input.closest('[data-formancy-part="field-control-row"]') === null,
          )
          return [sheet, box === undefined ? null : getComputedStyle(box).boxShadow]
        }),
      )
      for (const row of rows) {
        const first = row.firstElementChild
        const box = first?.matches('[data-formancy-part="typeahead-anchor"]') ? first.querySelector(':scope > [data-formancy-part="typeahead"]') : first
        const list = first?.querySelector(':scope > [data-formancy-part="typeahead-listbox"]') ?? null
        const field = row.closest('[data-formancy-part="field"]')
        const style = getComputedStyle(field)
        measured.push({
          direction,
          theme,
          sheet: sheets.indexOf(row.closest('[data-formancy-theme]')),
          label: field.querySelector('label')?.textContent?.trim() ?? '',
          kind: box?.tagName === 'SELECT' ? 'select' : 'typeahead',
          box: edges(box),
          button: edges(row.querySelector(':scope > [data-formancy-part="field-beside"] button')),
          row: edges(row).width,
          shadow: getComputedStyle(row).boxShadow,
          lone: lone.get(row.closest('[data-formancy-theme]')) ?? null,
          // The field's content box, which a row stretched across it fills.
          field: field.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
          list: list !== null && getComputedStyle(list).display !== 'none' && list.childElementCount > 0 ? edges(list) : null,
        })
      }
    }
  }

  document.documentElement.removeAttribute('dir')
  sheets.forEach((sheet, at) => sheet.setAttribute('data-formancy-theme', was[at] ?? ''))
  return { sheets: sheets.length, rows: rows.length, measured }
}

/** Half a pixel either way: a laid-out edge is fractional, and the comparison is not about rounding. */
const SLACK = 0.5

/** The playground's pickup point, whose list is opened to see where it lies. */
const POINT = 'Where to collect it'

/** `read` again until it finds nothing wrong or three seconds pass: the source answers after a quarter of a second. */
async function settled(read) {
  const started = Date.now()
  for (;;) {
    const found = await read()
    if (found === null || Date.now() - started > 3000) return found
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** What is wrong with one row in one theme and direction, as `check` takes it. */
function judge({ direction, theme, sheet, label, box, button, row, field, shadow, lone }, check) {
  const where = `${theme}, ${direction}, ${sheet === 0 ? 'React' : 'Angular'}’s “${label}”`
  if (box === null || button === null) {
    check(`${where} draws a box and a button in its row`, `the row holds ${box === null ? 'no box' : 'no button beside it'}`)
    return
  }
  const px = (value) => `${value.toFixed(1)}px`
  check(
    `${where}: the button is the box’s height, on its line`,
    Math.abs(button.top - box.top) <= SLACK && Math.abs(button.bottom - box.bottom) <= SLACK
      ? null
      : `the box runs ${px(box.top)}–${px(box.bottom)} and the button ${px(button.top)}–${px(button.bottom)}`,
  )
  // The box's inline end: its right edge left to right, its left edge right to left.
  const [end, start] = direction === 'rtl' ? [box.left, button.right] : [box.right, button.left]
  check(
    `${where}: the button touches the box at the box’s end`,
    Math.abs(start - end) <= SLACK ? null : `the box ends at ${px(end)} and the button starts at ${px(start)}`,
  )
  check(`${where}: the button is at least 44px wide`, button.width >= 44 - SLACK ? null : `${px(button.width)} wide`)
  check(`${where}: the row is as wide as its field`, Math.abs(row - field) <= SLACK ? null : `the row is ${px(row)} and the field ${px(field)}`)
  check(
    `${where}: the row casts no shadow, or the one a box alone casts`,
    shadow === 'none' || shadow === lone ? null : `the row casts ${shadow} and a text box alone ${String(lone)}`,
  )
}

/** One viewport: every row, every theme, both directions, and the pickup point's list opened in each renderer. */
async function measureAt(browser, url, { label, width, height }, themes, check) {
  console.log(`\nwhat a host draws beside a field’s box, in every theme, both reading orders — ${label}, ${String(width)}×${String(height)}`)
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelectorAll('[data-formancy-part="field-control-row"]').length >= 4, null, { timeout: 30_000 })
    const { sheets, rows, measured } = await page.evaluate(measure, themes)
    check(
      'both renderers draw a row beside the pickup point and the country',
      sheets === 2 && rows === 4 ? null : `${String(rows)} rows on ${String(sheets)} sheets, expected two on each renderer’s`,
    )
    for (const one of measured) judge(one, check)

    // The list, opened from the keyboard in each renderer in turn, measured in every theme while open.
    const boxes = page.getByRole('combobox', { name: POINT, exact: true })
    for (const [at, renderer] of ['React', 'Angular'].entries()) {
      const box = boxes.nth(at)
      await box.scrollIntoViewIfNeeded()
      await box.focus()
      await box.press('ArrowDown')
      const opened = await settled(() =>
        box.evaluate((combobox) =>
          combobox.getAttribute('aria-expanded') === 'true' &&
          (document.getElementById(combobox.getAttribute('aria-controls') ?? '')?.childElementCount ?? 0) > 0
            ? null
            : 'the list did not open',
        ),
      )
      check(`${renderer}: the pickup point’s list opens from the keyboard`, opened)
      if (opened === null) {
        const lists = (await page.evaluate(measure, themes)).measured.filter((one) => one.sheet === at && one.kind === 'typeahead')
        for (const { direction, theme, box: drawn, list } of lists) {
          const where = `${theme}, ${direction}, ${renderer}’s “${POINT}”`
          check(
            `${where}: the list lies within its box, not under the button`,
            list === null || drawn === null
              ? 'the list is not drawn'
              : list.left >= drawn.left - SLACK && list.right <= drawn.right + SLACK
                ? null
                : `the box runs ${drawn.left.toFixed(1)}–${drawn.right.toFixed(1)}px and the list ${list.left.toFixed(1)}–${list.right.toFixed(1)}px`,
          )
        }
      }
      await box.press('Escape')
    }
  } finally {
    await page.close()
  }
}

/** A desk, where both renderers sit side by side, and a phone, where the box must shrink rather than the row overflow. */
const VIEWPORTS = [
  { label: 'desk', width: 1180, height: 820 },
  { label: 'phone', width: 390, height: 844 },
]

export async function checkFieldBeside(browser, url, check) {
  const themes = themeNames()
  check('the themes are found, so there is something to put on the form', themes.length > 1 ? null : `${String(themes.length)} themes found`)
  for (const viewport of VIEWPORTS) await measureAt(browser, url, viewport, themes, check)
}
