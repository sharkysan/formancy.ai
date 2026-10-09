/**
 * Dropping between two nodes on the preview (0146), and picking things up again after a
 * drop (0148).
 *
 * The surface tests hand every element a rectangle, because jsdom draws nothing, and
 * then say where the pointer is. That takes two facts on trust: that the theme leaves
 * any space between two stacked nodes at all, and that a browser reports a pointer
 * there as over their container. Either one false, and the gap is a target nobody can
 * reach. Here Chromium lays out the playground, the pointer is put into the gap, and a
 * real drag is made into it — in both renderers' markup, since the playground's one
 * surface holds the React form and the Angular one.
 */

const NODE = '[data-formancy-layout-path],[data-formancy-field-path]'

/** How many nodes in a preview can be picked up. */
async function pickable(pane) {
  return pane.locator('[data-arrangeable="true"]').count()
}

/** The order the preview draws the given fields in, read from the page. */
async function fieldOrder(pane) {
  return pane
    .locator('[data-formancy-field-path]')
    .evaluateAll((elements) => elements.map((element) => element.dataset.formancyFieldPath))
}

/**
 * The middle of the space between two nodes, one above the other, and what a browser
 * says is under it there: the layout path of the nearest element that names a node,
 * or `null` for none.
 */
async function gapBetween(page, above, below) {
  const top = await above.boundingBox()
  const bottom = await below.boundingBox()
  const gap = bottom.y - (top.y + top.height)
  const point = { x: bottom.x + bottom.width / 2, y: top.y + top.height + gap / 2 }
  const under = await page.evaluate(
    ({ x, y, selector }) => {
      const hit = document.elementFromPoint(x, y)?.closest(selector)
      return hit === null || hit === undefined
        ? null
        : (hit.getAttribute('data-formancy-layout-path') ?? `field ${hit.getAttribute('data-formancy-field-path')}`)
    },
    { ...point, selector: NODE },
  )
  return { gap, point, under }
}

/**
 * A drag as a person makes it: pressed on the node's label, moved in steps, released.
 * Pressed on the label rather than the control, because pressing in a text box
 * selects text instead of picking anything up.
 */
async function dragInto(page, handle, point) {
  const from = await handle.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(point.x, point.y, { steps: 10 })
  await page.mouse.up()
}

/** Polls until `ready` holds or five seconds pass, and returns the last reading. */
async function settled(read, ready) {
  const started = Date.now()
  let value = await read()
  while (!ready(value) && Date.now() - started < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    value = await read()
  }
  return value
}

/**
 * The playground, fresh, with the Arrangement tab open and the given renderer's preview
 * ready to be dragged in. Fresh for each drag, so each is the first on its page and a
 * check reads what one drop did rather than what a sequence of them left behind.
 */
async function arranging(browser, url, renderer) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(url, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Arrangement', exact: true }).click()
  const pane = page.getByRole('region', { name: renderer, exact: true })
  await pane.locator('[data-arrangeable="true"]').first().waitFor({ timeout: 10_000 })

  /** The section holding a field. */
  const section = (holding) =>
    pane.locator('[data-formancy-part="layout-section"]', {
      has: page.locator(`[data-formancy-field-path="${holding}"]`),
    })
  const centred = (locator) => locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  return { page, pane, section, centred }
}

export async function checkArrangeGaps(browser, url, check) {
  for (const renderer of ['React', 'Angular']) {
    console.log(`\ndropping between two nodes on the ${renderer} preview — 1600×1000`)

    // ── Inside a section: Country into the space between Email and Phone ────────────
    const inSection = await arranging(browser, url, renderer)
    try {
      const { page, pane, section, centred } = inSection
      const about = section('email')
      const email = about.locator('[data-formancy-field-path="email"]').first()
      const phone = about.locator('[data-formancy-field-path="phone"]').first()
      const country = pane.locator('[data-formancy-field-path="country"]').first()
      await centred(phone)
      const gap = await gapBetween(page, email, phone)
      const before = await pickable(pane)

      check(
        `${renderer}: two stacked nodes in a section have space between them, and it is the section's`,
        gap.gap > 0 && gap.under === '1'
          ? null
          : `${String(gap.gap)}px between them, and under the middle of it: ${String(gap.under)}`,
      )

      await dragInto(page, country.locator('label').first(), gap.point)
      const drawn = await settled(
        () => fieldOrder(about),
        (order) => order.includes('country'),
      )
      check(
        `${renderer}: a field dropped there lands between them, not above or below the section`,
        drawn.join() === 'firstName,lastName,email,country,phone'
          ? null
          : `the section draws ${drawn.join(', ')}`,
      )

      // A drop redraws the preview — React's in the surface's own render, Angular's after
      // it, on Angular's schedule — and what is redrawn must still be there to pick up.
      // The Angular preview went from 33 such nodes to none after one drop (0148).
      const after = await settled(
        () => pickable(pane),
        (count) => count === before,
      )
      check(
        `${renderer}: after a drop, as much of the preview can be picked up as before`,
        before > 0 && after === before ? null : `${String(before)} nodes before the drop, ${String(after)} after`,
      )
    } finally {
      await inSection.page.close()
    }

    // ── A field a rule shows: the canton, once Switzerland is chosen ───────────────────
    // A hidden field leaves the DOM, and the one a rule shows is mounted by its own slot,
    // not by a render of the surface — so it arrived with no mark (0148).
    const shown = await arranging(browser, url, renderer)
    try {
      const { pane } = shown
      const canton = pane.locator('[data-formancy-field-path="canton"]').first()
      await pane.getByRole('combobox', { name: 'Country' }).selectOption('CH')
      await canton.waitFor({ timeout: 5000 })
      const marked = await settled(
        () => canton.getAttribute('data-arrangeable'),
        (mark) => mark === 'true',
      )
      check(
        `${renderer}: a field a rule shows while arranging can be picked up`,
        marked === 'true' ? null : 'the canton appeared with no mark on it',
      )
    } finally {
      await shown.page.close()
    }

    // ── At the top level: the order section into the space between the first two ───
    const atTop = await arranging(browser, url, renderer)
    try {
      const { page, pane, section, centred } = atTop
      const about = section('email')
      const where = section('country')
      // Picked up by its heading: pressed on a field inside it, the field is what moves.
      const order = section('delivery').locator('[data-formancy-part="layout-section-heading"]').first()
      await centred(where)
      const gap = await gapBetween(page, about, where)

      check(
        `${renderer}: between two top-level sections there is space, and no node is under it`,
        gap.gap > 0 && gap.under === null
          ? null
          : `${String(gap.gap)}px between them, and under the middle of it: ${String(gap.under)}`,
      )

      await dragInto(page, order, gap.point)
      const drawn = await settled(
        () => fieldOrder(pane),
        (fields) => fields.indexOf('delivery') < fields.indexOf('country'),
      )
      const at = (key) => drawn.indexOf(key)
      check(
        `${renderer}: a section dropped there lands between the two`,
        at('phone') < at('delivery') && at('delivery') < at('country')
          ? null
          : `the form draws ${drawn.slice(0, 12).join(', ')}…`,
      )
    } finally {
      await atTop.page.close()
    }
  }
}
