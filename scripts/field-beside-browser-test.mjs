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
 * row would open under the button too. Nothing later in the form is drawn over the open list: with
 * the keyboard in it Pop's row is lifted, and so a stacking context of its own that the list can
 * rise only within, and until the row rose with it the tag picker's box under the pickup point was
 * drawn across the list (seen 2026-11-15). And the open list covers the field's status, the line
 * under the row that says how many points it shows: the status is a row of the field and was as
 * wide as the field, the list now only as wide as the box, so the status's end showed beside the
 * open list, under the button, cut mid-word, in every theme (seen 2026-11-16). Before the row the
 * list was the field's width and covered it whole.
 *
 * A row is judged in three states, since a theme draws each with rules of its own: at rest; while
 * its field is invalid, the mark a failed submit leaves, which no theme carried onto the button at
 * first (Blueprint's frame was red round the box and grey round the button, seen 2026-11-15); and
 * with the keyboard in the row, where Pop lifts the box and casts its blue shadow, and a box that
 * lifted inside the row as well as with it would sit off the button's line and cast its shadow onto
 * it. In each the row casts what a box alone casts in that state: nothing where a box casts
 * nothing, and Pop's hard shadow where a box casts that, so a row that lost it, the pair then
 * casting nothing, fails as one that casts another. Pop's row first had its shadow named again for
 * right to left, and read right to left it fell left beside every other box's, which fell right
 * (seen 2026-11-15). A shadow a light casts does not move with the language. Neither the box nor
 * the button inside the row casts one of its own, offset from it, which would fall between the
 * two; a ring round one, as a theme's focus draws, is not one. At rest and invalid, the button's
 * upper and lower edges, its fill and its shadow are the box's, so the frame, the underline, the
 * fill and the mark run on across it. With the keyboard in the row they need not be: the focus
 * says which of the two has it.
 *
 * So, on the playground's form, which draws a button beside the pickup point's typeahead and beside
 * the country's select in both renderers, with each theme in turn on both sheets, left to right and
 * then right to left, at a desk's width and at a phone's: the button is the box's height, at least
 * 44px wide, and touches the box at the box's inline end; the row is as wide as its field and casts
 * the shadows above; and the pickup point's list, opened from the keyboard, lies within its box, is
 * what the browser hits at every point sampled across it, and holds the field's status, saying
 * something, inside its own edges. Neither field is required, so a field is made invalid the way a
 * theme reads it, by its wrapper's `data-state`, for the measurement and put back after it in the
 * same task. Where each lies is the browser's layout, read from the boxes it drew. Not held here: a
 * row under the pointer, which lifts in Pop, since a theme switched under a resting pointer is not
 * reliably hovered again; whether the pair *reads* as one field, a judgement of the eye that edges
 * and fills only approach; and a select's status, which every theme ends where a row's box ends as
 * it does the typeahead's, since the playground's country has no source and so no status.
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
 * and list lie and how the box and the button are drawn. Runs in the page. The box is the select,
 * or the typeahead's text box, which is what the eye sees beside the button, rather than the anchor
 * around it.
 *
 * `invalid` says every row's field, and the field of each sheet's lone text box, invalid for the
 * measurement. `held` is the shadow a lone text box casts with the keyboard in it, by reading order
 * and theme, which `heldShadows` measured: it stands for the lone box's shadow beside the row that
 * has the keyboard, while the lone box itself has not.
 */
function measure({ themes, invalid = false, held = null }) {
  const rows = [...document.querySelectorAll('[data-formancy-theme] [data-formancy-part="field-control-row"]')]
  const sheets = [...new Set(rows.map((row) => row.closest('[data-formancy-theme]')))]
  const was = sheets.map((sheet) => sheet.getAttribute('data-formancy-theme'))
  const edges = (element) => {
    if (element === null) return null
    const { left, right, top, bottom } = element.getBoundingClientRect()
    return { left, right, top, bottom, width: right - left, height: bottom - top }
  }
  // What the eye compares where the box ends and the button begins: the edge above and the edge
  // below, where there is one, the fill and the shadow.
  const look = (element) => {
    if (element === null) return null
    const style = getComputedStyle(element)
    const edge = (side) =>
      parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none'
        ? `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`
        : 'none'
    return { top: edge('Top'), bottom: edge('Bottom'), fill: style.backgroundColor, shadow: style.boxShadow }
  }
  // The box a field draws with nothing beside it: each sheet's first enabled text box outside a row.
  const lone = new Map(
    sheets.map((sheet) => [
      sheet,
      [...sheet.querySelectorAll('[data-formancy-part="field"] input[type="text"]:not(:disabled)')].find(
        (input) => input.closest('[data-formancy-part="field-control-row"]') === null,
      ) ?? null,
    ]),
  )
  // A list the eye sees whole: every point the browser hits across it, a few pixels apart, is in it.
  const over = (list) => {
    list.scrollIntoView({ block: 'nearest' })
    const { left, right, top, bottom } = list.getBoundingClientRect()
    const found = new Set()
    for (let y = top + 2; y < bottom - 1; y += 8) {
      for (const across of [0.05, 0.5, 0.95]) {
        const hit = document.elementFromPoint(left + (right - left) * across, y)
        if (hit === null) found.add('nothing, outside the window')
        else if (!list.contains(hit))
          found.add(`${hit.tagName.toLowerCase()}${hit.getAttribute('data-formancy-part') === null ? '' : ` (${hit.getAttribute('data-formancy-part')})`}`)
      }
    }
    return found.size === 0 ? null : [...found].join(', ')
  }

  const told = invalid ? [...rows, ...[...lone.values()].filter((box) => box !== null)].map((element) => element.closest('[data-formancy-part="field"]')) : []
  const states = told.map((field) => field.getAttribute('data-state'))
  for (const field of told) field.setAttribute('data-state', 'invalid')

  const measured = []
  for (const direction of ['ltr', 'rtl']) {
    document.documentElement.setAttribute('dir', direction)
    for (const theme of themes) {
      for (const sheet of sheets) sheet.setAttribute('data-formancy-theme', theme)
      // A theme eases its shadows in, so read straight after the switch a shadow is where the
      // last theme left it: the transitions the switch started are ended first.
      for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish()
      for (const row of rows) {
        const first = row.firstElementChild
        const box = first?.matches('[data-formancy-part="typeahead-anchor"]') ? first.querySelector(':scope > [data-formancy-part="typeahead"]') : first
        const button = row.querySelector(':scope > [data-formancy-part="field-beside"] button')
        const list = first?.querySelector(':scope > [data-formancy-part="typeahead-listbox"]') ?? null
        const drawn = list !== null && getComputedStyle(list).display !== 'none' && list.childElementCount > 0
        const field = row.closest('[data-formancy-part="field"]')
        const status = field.querySelector(':scope > :is([data-formancy-part="typeahead-status"], [data-formancy-part="select-status"])')
        const style = getComputedStyle(field)
        const sheet = row.closest('[data-formancy-theme]')
        const keyboard = row.contains(document.activeElement)
        const alone = lone.get(sheet) ?? null
        measured.push({
          direction,
          theme,
          sheet: sheets.indexOf(sheet),
          label: field.querySelector('label')?.textContent?.trim() ?? '',
          kind: box?.tagName === 'SELECT' ? 'select' : 'typeahead',
          // Whether the keyboard is in the row and, if so, shown as the keyboard's.
          keyboard: keyboard ? document.activeElement.matches(':focus-visible') : null,
          box: edges(box),
          button: edges(button),
          row: edges(row).width,
          shadow: getComputedStyle(row).boxShadow,
          lone: keyboard && held !== null ? (held[`${direction} ${theme}`] ?? null) : alone === null ? null : getComputedStyle(alone).boxShadow,
          looks: { box: look(box), button: look(button) },
          // The field's content box, which a row stretched across it fills.
          field: field.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
          list: drawn ? edges(list) : null,
          // Read before `over` scrolls the list into view, as the list's edges are, so the two are
          // compared where they lay together.
          status: status === null ? null : { ...edges(status), says: status.textContent?.trim() ?? '' },
          covered: drawn ? over(list) : null,
        })
      }
    }
  }

  told.forEach((field, at) => field.setAttribute('data-state', states[at] ?? 'valid'))
  document.documentElement.removeAttribute('dir')
  sheets.forEach((sheet, at) => sheet.setAttribute('data-formancy-theme', was[at] ?? ''))
  return { sheets: sheets.length, rows: rows.length, measured }
}

/**
 * The shadow a lone text box casts with the keyboard in it, by reading order and theme: the first
 * sheet's first enabled text box outside a row, given the keyboard. Runs in the page, before a row's
 * box is, since only one element has the keyboard at a time.
 */
function heldShadows(themes) {
  const sheets = [
    ...new Set(
      [...document.querySelectorAll('[data-formancy-theme] [data-formancy-part="field-control-row"]')].map((row) => row.closest('[data-formancy-theme]')),
    ),
  ]
  const was = sheets.map((sheet) => sheet.getAttribute('data-formancy-theme'))
  const box = [...(sheets[0]?.querySelectorAll('[data-formancy-part="field"] input[type="text"]:not(:disabled)') ?? [])].find(
    (input) => input.closest('[data-formancy-part="field-control-row"]') === null,
  )
  const held = {}
  if (box === undefined) return held
  box.focus()
  for (const direction of ['ltr', 'rtl']) {
    document.documentElement.setAttribute('dir', direction)
    for (const theme of themes) {
      for (const sheet of sheets) sheet.setAttribute('data-formancy-theme', theme)
      for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish()
      held[`${direction} ${theme}`] = box.matches(':focus-visible') ? getComputedStyle(box).boxShadow : null
    }
  }
  box.blur()
  document.documentElement.removeAttribute('dir')
  sheets.forEach((sheet, at) => sheet.setAttribute('data-formancy-theme', was[at] ?? ''))
  return held
}

/** Half a pixel either way: a laid-out edge is fractional, and the comparison is not about rounding. */
const SLACK = 0.5

/** The playground's pickup point, whose list is opened to see where it lies, and its country. */
const POINT = 'Where to collect it'
const COUNTRY = 'Country'

/** `read` again until it finds nothing wrong or three seconds pass: the source answers after a quarter of a second. */
async function settled(read) {
  const started = Date.now()
  for (;;) {
    const found = await read()
    if (found === null || Date.now() - started > 3000) return found
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * The shadows in a computed `box-shadow` that a box casts, offset from it: not inset, and moved
 * along either axis. A ring, offset by nothing, lies round the box rather than falling beside it.
 */
function cast(shadow) {
  if (shadow === null || shadow === 'none') return []
  const layers = []
  let depth = 0
  let from = 0
  for (const [at, character] of [...shadow].entries()) {
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth === 0) {
      layers.push(shadow.slice(from, at))
      from = at + 1
    }
  }
  layers.push(shadow.slice(from))
  return layers
    .map((layer) => layer.trim())
    .filter((layer) => !/\binset\b/.test(layer))
    .filter((layer) => (layer.replace(/[a-z-]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).slice(0, 2).some((length) => parseFloat(length) !== 0))
}

/** The state a row is in while the keyboard is in it. */
const HELD = 'with the keyboard in it'

/** What is wrong with one row in one theme, direction and state, as `check` takes it. */
function judge({ direction, theme, sheet, label, state, box, button, row, field, shadow, lone, looks }, check) {
  const where = `${theme}, ${direction}, ${state}, ${sheet === 0 ? 'React' : 'Angular'}’s “${label}”`
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
  // Compared by what each casts, so a row that casts nothing beside a box that casts a shadow fails
  // as one that casts another does: Pop's hard shadow round the pair is held, and Blueprint's,
  // Paper's and Dusk's insets and rings, which fall beside nothing, are not asked of the row.
  check(
    `${where}: the row casts what a box alone casts`,
    JSON.stringify(cast(shadow)) === JSON.stringify(cast(lone)) ? null : `the row casts ${shadow} and a text box alone ${String(lone)}`,
  )
  const own = Object.entries(looks).filter(([, look]) => cast(look?.shadow ?? null).length > 0)
  check(
    `${where}: neither the box nor the button casts a shadow of its own`,
    own.length === 0 ? null : own.map(([which, look]) => `the ${which} casts ${String(look?.shadow)}`).join('; '),
  )
  if (state === HELD) return
  const differs = ['top', 'bottom', 'fill', 'shadow'].filter((key) => looks.box?.[key] !== looks.button?.[key])
  check(
    `${where}: the button continues the box’s edges, fill and shadow`,
    differs.length === 0 ? null : differs.map((key) => `${key}: the box ${String(looks.box?.[key])}, the button ${String(looks.button?.[key])}`).join('; '),
  )
}

/**
 * The rows of one renderer with the keyboard in one of them, `kind` the control given it: that row
 * judged in every theme and direction, and the pickup point's list, where it is open, measured.
 */
function judgeHeld(measured, { at, renderer, kind }, check) {
  const rows = measured.filter((one) => one.sheet === at && one.keyboard !== null)
  check(
    `${renderer}: the ${kind === 'select' ? 'country’s' : 'pickup point’s'} row has the keyboard, shown as the keyboard’s`,
    rows.length > 0 && rows.every((one) => one.kind === kind && one.keyboard === true)
      ? null
      : rows.length === 0
        ? 'no row holds the keyboard'
        : `the row holding it is a ${rows[0].kind}’s, shown as the keyboard’s: ${String(rows[0].keyboard)}`,
  )
  for (const one of rows) {
    judge({ ...one, state: HELD }, check)
    if (kind !== 'typeahead') continue
    const where = `${one.theme}, ${one.direction}, ${renderer}’s “${POINT}”`
    const { box, list } = one
    check(
      `${where}: the list lies within its box, not under the button`,
      list === null || box === null
        ? 'the list is not drawn'
        : list.left >= box.left - SLACK && list.right <= box.right + SLACK
          ? null
          : `the box runs ${box.left.toFixed(1)}–${box.right.toFixed(1)}px and the list ${list.left.toFixed(1)}–${list.right.toFixed(1)}px`,
    )
    check(
      `${where}: the list is drawn over what lies under it`,
      list === null ? 'the list is not drawn' : one.covered === null ? null : `${one.covered} is drawn over it`,
    )
    check(`${where}: the list covers the field’s status`, coversStatus(list, one.status, one.direction))
  }
}

/**
 * What of the field's status lies outside the open list, or null where the list covers it: the
 * status's inline end, its right edge left to right and its left edge right to left, no further
 * than the list's, and its upper and lower edges between the list's. The list starts where the box
 * does, as the status does, so it is the end that can stick out. A status saying nothing has no
 * line to show beside the list, and a check of it would pass whatever the theme does, so it fails.
 */
function coversStatus(list, status, direction) {
  if (list === null) return 'the list is not drawn'
  if (status === null || status.says === '') return 'the field’s status says nothing while its list is open'
  const px = (value) => `${value.toFixed(1)}px`
  const [ends, listEnds] = direction === 'rtl' ? [status.left, list.left] : [status.right, list.right]
  const past = direction === 'rtl' ? listEnds - ends : ends - listEnds
  if (past > SLACK) return `“${status.says}” ends at ${px(ends)}, ${px(past)} past the list’s end at ${px(listEnds)}`
  if (status.top < list.top - SLACK || status.bottom > list.bottom + SLACK)
    return `“${status.says}” runs ${px(status.top)}–${px(status.bottom)} down the page and the list ${px(list.top)}–${px(list.bottom)}`
  return null
}

/** One viewport: every row, every theme, both directions, at rest and invalid, and each renderer's two boxes given the keyboard. */
async function measureAt(browser, url, { label, width, height }, themes, check) {
  console.log(`\nwhat a host draws beside a field’s box, in every theme, both reading orders — ${label}, ${String(width)}×${String(height)}`)
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    // Each renderer has drawn its form once it has drawn the pickup point; how many rows it drew
    // is the check below, which a wait for the rows themselves could only time out on.
    const points = page.getByRole('combobox', { name: POINT, exact: true })
    await points.nth(1).waitFor({ timeout: 30_000 })
    const { sheets, rows, measured } = await page.evaluate(measure, { themes })
    check(
      'both renderers draw a row beside the pickup point and the country',
      sheets === 2 && rows === 4 ? null : `${String(rows)} rows on ${String(sheets)} sheets, expected two on each renderer’s`,
    )
    for (const one of measured) judge({ ...one, state: 'at rest' }, check)
    for (const one of (await page.evaluate(measure, { themes, invalid: true })).measured) judge({ ...one, state: 'invalid' }, check)

    const held = await page.evaluate(heldShadows, themes)
    const countries = page.getByRole('combobox', { name: COUNTRY, exact: true })
    for (const [at, renderer] of ['React', 'Angular'].entries()) {
      // The pickup point's list, opened from the keyboard, measured in every theme while open.
      const point = points.nth(at)
      await point.scrollIntoViewIfNeeded()
      await point.focus()
      await point.press('ArrowDown')
      const opened = await settled(() =>
        point.evaluate((combobox) =>
          combobox.getAttribute('aria-expanded') === 'true' &&
          (document.getElementById(combobox.getAttribute('aria-controls') ?? '')?.childElementCount ?? 0) > 0
            ? null
            : 'the list did not open',
        ),
      )
      check(`${renderer}: the pickup point’s list opens from the keyboard`, opened)
      if (opened === null) judgeHeld((await page.evaluate(measure, { themes, held })).measured, { at, renderer, kind: 'typeahead' }, check)
      await point.press('Escape')

      // The country's select, given the keyboard after a key was pressed, so shown as the keyboard's.
      const country = countries.nth(at)
      await country.scrollIntoViewIfNeeded()
      await country.focus()
      judgeHeld((await page.evaluate(measure, { themes, held })).measured, { at, renderer, kind: 'select' }, check)
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
