// What jsdom structurally cannot see, measured in a real browser.
//
// This gate exists because two defects shipped through every other one in the
// same week, and neither was findable by any test in this repository:
//
//   1. The playground's pane row set `grid-template-columns` from the component.
//      An inline declaration outranks every rule in a stylesheet, so the
//      narrow-screen rule asking for a single column was silently losing. At an
//      820px viewport the row demanded 992px and the page scrolled sideways by
//      187px, with the one visible pane 304px wide inside an 820px screen
//      (0100).
//   2. The signature surface's `touch-action: none` lived only in the four
//      shipped themes, so a finger drag panned the page instead of drawing for
//      anybody using the renderer with their own stylesheet. Reported from an
//      iPad (0101).
//
// Both are invisible to the suite for the same reason: **jsdom applies no CSS,
// resolves no media queries and performs no layout.** Every box measures zero and
// every cascade question has no answer. That is not a coverage gap to be closed
// with more cases; it is a class of fact the environment cannot represent.
//
// So this runs against the composed site that `pnpm build:web` produces -- not a
// dev server, not a component in isolation -- serves it over HTTP, and asks
// Chromium for computed values and geometry.
//
// **Deliberately not screenshots.** The renderers ship no styling, so a pixel
// baseline would be testing demo CSS, and a baseline is a file somebody updates
// when it goes red. What is asserted here is what the two defects actually were:
// a computed property, a column count and an overflow in pixels.
//
// `pnpm test:browser`, after `pnpm build:web`.

import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkTemplateGallery } from './template-browser-test.mjs'
import { checkAngularPage } from './angular-page-browser-test.mjs'
import { checkUploadThumbnails } from './upload-browser-test.mjs'
import { checkArrangeGaps } from './arrange-browser-test.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const site = join(root, 'apps', 'site', 'dist')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
}

/**
 * The built site over HTTP, on a port the operating system picks.
 *
 * Hand-rolled rather than `vite preview`, for the reason `install-test.mjs`
 * builds its fixture out of real files: the thing being checked is what a host
 * serves, and a dev server is a different program with its own transforms. Forty
 * lines and no dependency.
 */
function serve(directory) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    // `normalize` then a prefix check: a path with `..` in it must not escape the
    // directory even on a server only this script talks to.
    let file = join(directory, normalize(decodeURIComponent(url.pathname)))
    if (!file.startsWith(directory)) {
      response.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end(`no ${url.pathname}`)
      return
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })

  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => ready({ server, port: server.address().port }))
  })
}

/** Widths worth asking about, and why each one is in the list. */
const WIDTHS = [
  // A phone. The pane row demanded 992px here, which is 602px of sideways scroll.
  { label: 'phone', width: 390, height: 844 },
  // The narrowest tablet in portrait, and just below the 64rem breakpoint.
  { label: 'tablet portrait', width: 820, height: 1180 },
  // An iPad in landscape: above the breakpoint, so all three panes are shown and
  // the 59rem of column minimums have about 5rem of room to spare.
  { label: 'tablet landscape', width: 1180, height: 820 },
  // An ordinary laptop.
  { label: 'laptop', width: 1440, height: 900 },
]

/** The breakpoint below which the playground shows one pane at a time, in pixels. */
const ONE_PANE_BELOW = 64 * 16

async function run() {
  if (!existsSync(join(site, 'playground', 'index.html'))) {
    throw new Error('no built site at apps/site/dist/playground — run `pnpm build:web` first')
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    throw new Error('playwright is not installed — run `pnpm install`')
  }

  const { server, port } = await serve(site)
  const origin = `http://127.0.0.1:${String(port)}`
  const url = `${origin}/playground/`

  let browser
  try {
    browser = await chromium.launch()
  } catch (error) {
    server.close()
    throw new Error(
      `could not launch Chromium (${String(error)}).\nRun \`pnpm exec playwright install --with-deps chromium\`.`,
    )
  }

  const failures = []
  const check = (name, problem) => {
    if (problem === null) {
      console.log(`  ok    ${name}`)
    } else {
      console.log(`  FAIL  ${name}\n          ${problem}`)
      failures.push(`${name}: ${problem}`)
    }
  }

  try {
    /*
     * The stylesheets as the site serves them, before any page is opened.
     *
     * The themes say right to left with `:dir()`, and Vite's default target had
     * Lightning CSS rewrite every one as `:is(:lang(ar), :lang(he), …)` — a question
     * about the page's language, not its direction — so the playground's builder kept
     * its marks on the left under `dir="rtl"` while every source check was green
     * (0123). What is looked for is that list — Arabic and Hebrew named together —
     * and not `:lang()` as such: the documentation's own theme asks for Chinese and
     * Japanese by `:lang()` to choose their fonts, which is what `:lang()` is for. No
     * stylesheet of ours names a language at all, checked first. A file check, not a
     * browser one, but it reads what `pnpm build:web` produced, and this is the gate
     * that runs after it.
     */
    {
      const cssUnder = (directory) =>
        readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? cssUnder(join(directory, entry.name))
            : entry.name.endsWith('.css')
              ? [join(directory, entry.name)]
              : [],
        )
      const sources = [
        ...cssUnder(join(root, 'packages', 'themes')).filter((file) => !file.includes('node_modules')),
        ...cssUnder(join(root, 'apps', 'site', 'src')),
        ...cssUnder(join(root, 'apps', 'playground', 'src')),
      ]
      const built = cssUnder(site)
      console.log('\nthe stylesheets as served')
      const rewritten = (css) => css.includes(':lang(ar)') && css.includes(':lang(he)')
      check(
        'no stylesheet of ours names a language, so a list of them was written by the bundler',
        sources.filter((file) => readFileSync(file, 'utf8').includes(':lang(')).join(', ') || null,
      )
      check(
        'and none the site serves has :dir() rewritten as a list of languages',
        built
          .filter((file) => rewritten(readFileSync(file, 'utf8')))
          .map((file) => file.slice(site.length + 1))
          .join(', ') || null,
      )
      check(
        'and the builder’s stylesheet reached the playground with :dir() intact',
        built.some((file) => file.includes('playground') && readFileSync(file, 'utf8').includes(':dir(rtl)'))
          ? null
          : 'no :dir(rtl) in any playground stylesheet, so there was nothing to keep',
      )
    }

    await checkTemplateGallery(browser, origin, check)
    await checkAngularPage(browser, origin, check)
    await checkUploadThumbnails(browser, url, check)
    await checkArrangeGaps(browser, url, check)
    for (const { label, width, height } of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.goto(url, { waitUntil: 'load' })
      // The React and Angular previews both mount on load; the signature is in
      // the demo schema, so its presence is also the signal that the form rendered.
      await page.waitForSelector('[data-formancy-part="signature-surface"]', { timeout: 30_000 })
      console.log(`\n${label} — ${String(width)}×${String(height)}`)

      /*
       * Nothing scrolls sideways.
       *
       * The whole of defect 1 in one number. A page that scrolls horizontally on
       * a phone is not a layout preference; it is a page whose columns do not fit
       * and whose content is cut off at the edge.
       */
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      check(
        'the page does not scroll sideways',
        overflow > 0 ? `${String(overflow)}px of horizontal overflow` : null,
      )

      /*
       * One column below the breakpoint, and the handles gone with it.
       *
       * Asserted as the *computed* template, which is the thing the inline style
       * was overriding. Counting columns rather than matching the string, because
       * the string is `780.667px` at one width and three `minmax()` tracks at
       * another, and the fact is how many there are.
       */
      const row = await page.evaluate(() => {
        const element = document.querySelector('.panes')
        if (element === null) return null
        const style = getComputedStyle(element)
        return {
          columns: style.gridTemplateColumns.split(' ').filter((part) => part !== '').length,
          handles: [...document.querySelectorAll('[role="separator"]')].filter(
            (handle) => getComputedStyle(handle).display !== 'none',
          ).length,
        }
      })
      check('the pane row is in the document', row === null ? 'no .panes element' : null)

      if (row !== null && width < ONE_PANE_BELOW) {
        check(
          'one pane at a time below the breakpoint',
          row.columns === 1 ? null : `${String(row.columns)} columns, so the narrow-screen rule is being overridden`,
        )
        check(
          'and no drag handles, which would be stray lines between stacked panes',
          row.handles === 0 ? null : `${String(row.handles)} handles visible`,
        )
      } else if (row !== null) {
        check(
          'three panes and two handles above the breakpoint',
          row.columns === 5 && row.handles === 2
            ? null
            : `${String(row.columns)} columns and ${String(row.handles)} handles, expected 5 and 2`,
        )
      }

      /*
       * A finger on the signature draws, with or without a theme.
       *
       * The whole of defect 2. The second half is the one that matters: the
       * property lived in the themes, so reading it with a theme applied was the
       * measurement that said everything was fine for weeks.
       */
      const touch = await page.evaluate(() => {
        /*
         * Every surface on the page, not the first one.
         *
         * The playground renders one schema twice -- once by React and once by
         * Angular -- so there are two, and `querySelector` checked React alone.
         * The two controls are written by hand in each framework's idiom and are
         * exactly the kind of pair that can disagree without anybody finding out.
         */
        const surfaces = [...document.querySelectorAll('[data-formancy-part="signature-surface"]')]

        return surfaces.map((surface) => {
          const host = surface.closest('[data-formancy-theme]')
          const theme = host?.getAttribute('data-formancy-theme') ?? null
          const read = () => getComputedStyle(surface).touchAction

          const themed = read()
          if (host !== null) host.removeAttribute('data-formancy-theme')
          const unthemed = read()
          if (host !== null && theme !== null) host.setAttribute('data-formancy-theme', theme)

          const onSurface = new Event('touchmove', { bubbles: true, cancelable: true })
          surface.dispatchEvent(onSurface)

          return { themed, unthemed, cancelled: onSurface.defaultPrevented }
        })
      })

      check(
        'both renderers put a signature on the page',
        touch.length === 2 ? null : `${String(touch.length)} signature surfaces, expected one per renderer`,
      )
      touch.forEach((surface, at) => {
        const which = at === 0 ? 'React' : 'Angular'
        check(
          `the ${which} signature surface refuses to be panned`,
          surface.themed === 'none' ? null : `touch-action is ${surface.themed}`,
        )
        check(
          `and refuses it with no theme applied, which is where ${which} was broken`,
          surface.unthemed === 'none' ? null : `touch-action is ${surface.unthemed} without a theme`,
        )
        check(
          `and cancels a touch on itself (${which})`,
          surface.cancelled ? null : 'a touchmove on the surface was left to scroll',
        )
      })

      const elsewhere = await page.evaluate(() => {
        // The form has to stay scrollable with a finger; cancelling everything
        // would pass every case above and trap the page.
        const typed = document.querySelector('[data-formancy-part="signature-typed"]')
        const event = new Event('touchmove', { bubbles: true, cancelable: true })
        typed.dispatchEvent(event)
        return event.defaultPrevented
      })
      check(
        'while leaving the rest of the form scrollable',
        elsewhere ? 'a touchmove on the text input beside it was cancelled too' : null,
      )

      /*
       * And it actually records a stroke.
       *
       * Because every assertion above is about something *not* happening, and a
       * surface that refuses every gesture would pass all four.
       */
      const drawn = await page.evaluate(async () => {
        const surface = document.querySelector('[data-formancy-part="signature-surface"]')
        const box = surface.getBoundingClientRect()
        const options = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true }
        surface.dispatchEvent(
          new PointerEvent('pointerdown', { ...options, clientX: box.left + 10, clientY: box.top + box.height / 2 }),
        )
        for (let step = 1; step <= 8; step += 1) {
          surface.dispatchEvent(
            new PointerEvent('pointermove', {
              ...options,
              clientX: box.left + 10 + step * 8,
              clientY: box.top + box.height / 2 + (step % 3) * 4,
            }),
          )
        }
        surface.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: box.left + 80, clientY: box.top }))
        await new Promise((done) => setTimeout(done, 100))

        const strokes = [...document.querySelectorAll('[data-formancy-part="signature-stroke"]')]
        return { strokes: strokes.length, points: (strokes[0]?.getAttribute('d') ?? '').split(/[ML]/).filter(Boolean).length }
      })
      check(
        'and records one stroke of the points it was given',
        drawn.strokes === 1 && drawn.points === 9
          ? null
          : `${String(drawn.strokes)} strokes and ${String(drawn.points)} points, expected 1 and 9`,
      )

      /*
       * The theme editor changes what the form looks like.
       *
       * Only at the widest viewport: below the breakpoint the playground shows
       * one pane at a time, so the editor pane is not on screen to open.
       *
       * This is the one check here that could not be written any other way. The
       * editor discovers its controls from the stylesheet and applies an
       * override as a custom property, and **jsdom has neither** -- no cascade,
       * so no computed colour to compare. The suite can assert that the property
       * lands on the host; that it reaches a control is this.
       */
      if (width >= 1440) {
        const theming = await page.evaluate(async () => {
          const wait = () => new Promise((done) => setTimeout(done, 150))
          const host = document.querySelector('.sheet[data-formancy-theme]')
          const box = host?.querySelector('input[type="checkbox"]')
          if (host === null || box === null || box === undefined) return { error: 'no themed checkbox' }

          // A checked checkbox takes its background from `--fm-signal` in every
          // shipped theme, which makes it the element whose rendering proves an
          // override arrived.
          if (!box.checked) {
            box.click()
            await wait()
          }
          const read = () => getComputedStyle(box).backgroundColor
          const before = read()

          const mode = [...document.querySelectorAll('button.mode')].find(
            (button) => button.textContent?.trim() === 'Theme',
          )
          if (mode === undefined) return { error: 'no Theme mode' }
          mode.click()
          await wait()

          const controls = [...document.querySelectorAll('.theme-token')]
          const signal = controls
            .find((token) => token.querySelector('.theme-token-name')?.textContent === 'signal')
            ?.querySelector('input[type="text"]')
          if (signal === null || signal === undefined) return { error: 'no signal control', controls: controls.length }

          // Through the value setter, so React's onChange sees it.
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
          setter?.call(signal, '#ff00aa')
          signal.dispatchEvent(new Event('input', { bubbles: true }))
          await wait()
          const overridden = read()

          const reset = [...document.querySelectorAll('.theme-actions button')].find((button) =>
            button.textContent?.trim().startsWith('Reset'),
          )
          reset?.click()
          await wait()

          return { controls: controls.length, before, overridden, afterReset: read() }
        })

        /*
         * Exactly one editor body on screen per mode.
         *
         * Reported as "the schema view is broken", and what was broken was the
         * cascade: `hidden` hides an element through `display: none` in the
         * user-agent stylesheet, and ANY author `display` beats it. The theme
         * body's `display: flex` matched at the same specificity as
         * `.pane .body[hidden]` and came later in the file, so it was rendered in
         * every mode — 349px of controls inside a pane with 321px of room.
         *
         * Third cascade defect in this file in one session. jsdom resolves none
         * of it, so this is the only place the fact can be held.
         */
        const modes = await page.evaluate(async () => {
          const wait = () => new Promise((done) => setTimeout(done, 200))
          const shown = () =>
            [...document.querySelectorAll('.pane.editor > .body')]
              .filter((body) => getComputedStyle(body).display !== 'none')
              .map((body) => body.className.replace('body', '').trim() || 'build')

          const seen = { start: shown() }
          for (const name of ['Schema', 'Theme', 'Build']) {
            const button = [...document.querySelectorAll('button.mode')].find(
              (candidate) => candidate.textContent?.trim() === name,
            )
            if (button === undefined) return { error: `no ${name} mode` }
            button.click()
            await wait()
            seen[name.toLowerCase()] = shown()
          }
          return seen
        })

        check(
          'exactly one editor body is on screen in each mode',
          modes.error !== undefined
            ? modes.error
            : Object.entries(modes).filter(([, bodies]) => bodies.length !== 1).length === 0
              ? null
              : Object.entries(modes)
                  .filter(([, bodies]) => bodies.length !== 1)
                  .map(([mode, bodies]) => `${mode}: ${bodies.join(' + ') || 'nothing'}`)
                  .join('; '),
        )

        check(
          'the theme editor finds the tokens the applied theme declares',
          theming.error === undefined && theming.controls > 8
            ? null
            : `${theming.error ?? `${String(theming.controls)} controls`}`,
        )
        check(
          'and an override reaches the rendered form',
          theming.before !== theming.overridden
            ? null
            : `the checkbox stayed ${String(theming.before)} after the signal colour changed`,
        )
        check(
          'and resetting gives the theme back',
          theming.afterReset === theming.before
            ? null
            : `${String(theming.afterReset)} after reset, was ${String(theming.before)}`,
        )
      }

      await page.close()
    }

    /*
     * The same form, read right to left.
     *
     * Every shipped theme is written in reading order — `padding-inline-start`
     * rather than `padding-left` — and `apps/docs/src/themes.test.ts` keeps it
     * that way by refusing a stylesheet that names a side. That guard reads
     * the source; this one reads the browser, and the two are different
     * claims. A stylesheet full of logical properties still lays out wrongly
     * if nothing ever sets `dir`, if a renderer hard-codes an arrow, or if a
     * control's own markup assumes an order.
     *
     * jsdom cannot answer either half: it resolves no logical property to a
     * physical one, because it performs no layout at all.
     */
    {
      const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForSelector('[data-formancy-part="signature-surface"]', { timeout: 30_000 })
      console.log('\nright to left — 1180×820')

      const flipped = await page.evaluate(async () => {
        const wait = () => new Promise((done) => setTimeout(done, 150))
        const sheet = document.querySelector('.sheet[data-formancy-theme]')
        if (sheet === null) return { error: 'no themed form on the page' }

        /*
         * A control whose theme gives it asymmetric inline padding, found
         * rather than named: the point is that SOME themed element flips, and
         * hunting for one by selector would be a case that breaks when a theme
         * restyles the control it happened to pick.
         */
        const SIDED = [
          ['paddingLeft', 'paddingRight'],
          ['marginLeft', 'marginRight'],
          ['borderLeftWidth', 'borderRightWidth'],
        ]

        /*
         * EVERY asymmetry in the form, not the first one found.
         *
         * The first version took one element and checked that it flipped, and
         * pinning three properties in a theme reddened nothing — because some
         * other element was still asymmetric and still flipped, so the case
         * proved only that the document responds to `dir` at all. Each one has
         * to flip, or the case cannot catch the rule that stopped.
         */
        const describe = (element) => {
          const part = element.getAttribute('data-formancy-part')
          return part ?? `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 20)}`
        }

        const sided = []
        for (const element of sheet.querySelectorAll('*')) {
          const style = getComputedStyle(element)
          for (const [left, right] of SIDED) {
            if (style[left] === style[right]) continue
            sided.push({
              element,
              left,
              right,
              was: { left: style[left], right: style[right] },
            })
          }
        }
        if (sided.length === 0) {
          return { error: 'nothing in the form is laid out asymmetrically, so nothing can flip' }
        }

        document.documentElement.setAttribute('dir', 'rtl')
        await wait()

        const stuck = []
        for (const entry of sided) {
          const style = getComputedStyle(entry.element)
          if (style[entry.left] === entry.was.right && style[entry.right] === entry.was.left) {
            continue
          }
          stuck.push(
            `${describe(entry.element)} ${entry.left.replace(/Left$/, '')}: ` +
              `${entry.was.left}/${entry.was.right} stayed ${style[entry.left]}/${style[entry.right]}`,
          )
        }

        const slack = document.documentElement.scrollWidth - document.documentElement.clientWidth
        document.documentElement.removeAttribute('dir')

        return { measured: sided.length, stuck: [...new Set(stuck)].slice(0, 5), slack }
      })

      /*
       * What this measures, said exactly.
       *
       * Four asymmetries in the rendered form, and they come from the
       * RENDERER and the user-agent stylesheet rather than from a theme —
       * measured by pinning a side in all four themes and watching this stay
       * green. So it holds the renderer's own layout and the document's
       * response to `dir`, and the THEMES are held by
       * `apps/docs/src/themes.test.ts`, which reads the stylesheets and is
       * proved against four physical properties and an unpaired
       * `background-position`.
       *
       * Worth keeping at that narrower claim rather than deleting: a renderer
       * that emitted a hard-coded arrow or an order its markup assumed would
       * fail here and nowhere else.
       */
      check(
        'the rendered form responds to the reading order, and none of its layout stays pinned',
        flipped.error ??
          (flipped.stuck.length === 0
            ? null
            : `${String(flipped.stuck.length)} of ${String(flipped.measured)} did not flip — ${flipped.stuck.join('; ')}`),
      )

      check(
        'and there was something to measure, which is the guard on that one',
        flipped.error !== undefined || flipped.measured >= 3
          ? null
          : `only ${String(flipped.measured)} asymmetries found; the case above would pass on a form that lays out nothing`,
      )

      check(
        'and the page does not scroll sideways once it is mirrored',
        flipped.error !== undefined || flipped.slack <= 0
          ? null
          : `${String(flipped.slack)}px of horizontal overflow in right-to-left`,
      )

      await page.close()
    }

    /*
     * The builder, read right to left.
     *
     * The question above, asked of the builder's own chrome, which `workbench.css`
     * styles and which no reading-order check read until 2026-10-09: the source guard
     * kept only the stylesheets that style a form. And the one mark CSS cannot write
     * in reading order — the bar down the side of the selected node, an inset shadow —
     * has to be SEEN to move: a `:dir(rtl)` rule that lost on specificity would satisfy
     * the source guard and change nothing on screen.
     */
    {
      const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForSelector('[data-formancy-part="builder-node"][aria-selected="true"]', {
        timeout: 30_000,
      })
      console.log('\nthe builder, right to left — 1180×820')

      const builder = await page.evaluate(async () => {
        const wait = () => new Promise((done) => setTimeout(done, 150))
        const root = document.querySelector('[data-formancy-part="builder"]')
        const selected = document.querySelector(
          '[data-formancy-part="builder-node"][aria-selected="true"]',
        )
        if (root === null || selected === null) {
          return { error: 'no builder tree with a selected node on the page' }
        }

        const SIDED = [
          ['paddingLeft', 'paddingRight'],
          ['marginLeft', 'marginRight'],
          ['borderLeftWidth', 'borderRightWidth'],
        ]
        const sided = []
        for (const element of [root, ...root.querySelectorAll('*')]) {
          const style = getComputedStyle(element)
          for (const [left, right] of SIDED) {
            if (style[left] === style[right]) continue
            sided.push({ element, left, right, was: { left: style[left], right: style[right] } })
          }
        }
        // Chromium writes a shadow as "rgb(…) 2px 0px 0px 0px inset": the first
        // length once the colour is gone is the horizontal offset, and its sign the side.
        const offset = () =>
          parseFloat(getComputedStyle(selected).boxShadow.replace(/rgba?\([^)]*\)/g, '').trim())
        const before = offset()

        document.documentElement.setAttribute('dir', 'rtl')
        await wait()

        const stuck = []
        for (const entry of sided) {
          const style = getComputedStyle(entry.element)
          if (style[entry.left] === entry.was.right && style[entry.right] === entry.was.left) continue
          const part = entry.element.getAttribute('data-formancy-part') ?? entry.element.tagName
          stuck.push(`${part} ${entry.left.replace(/Left$/, '')}`)
        }
        const after = offset()
        document.documentElement.removeAttribute('dir')

        return { measured: sided.length, stuck: [...new Set(stuck)].slice(0, 5), before, after }
      })

      check(
        'the builder responds to the reading order, and none of its layout stays pinned',
        builder.error ??
          (builder.stuck.length === 0
            ? null
            : `${String(builder.stuck.length)} of ${String(builder.measured)} did not flip — ${builder.stuck.join('; ')}`),
      )

      check(
        'and there was something in it to measure',
        builder.error !== undefined || builder.measured >= 3
          ? null
          : `only ${String(builder.measured)} asymmetries found in the builder`,
      )

      check(
        'and the bar on the selected node moves to the side a line starts on',
        builder.error ??
          (builder.before > 0 && builder.after < 0
            ? null
            : `its offset was ${String(builder.before)}px and is ${String(builder.after)}px right to left`),
      )

      await page.close()
    }

    /*
     * An option's picture, loaded.
     *
     * jsdom never fetches an image, so every renderer test of a picture asserts the
     * element and not the picture. Here the starter's delivery options carry theirs as
     * `data:image/svg+xml` addresses, and a page that blocked or mis-encoded them would
     * show a broken image in both renderers while every other gate passed (0126).
     */
    {
      const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForSelector('[data-formancy-part="option-image"]', { timeout: 30_000 })
      console.log('\npictures on options — 1180×820')

      const pictures = await page.evaluate(async () => {
        const images = [...document.querySelectorAll('[data-formancy-part="option-image"]')]
        // Lazy, so each is brought into view first: a lazy image off screen is never
        // fetched, and `decode()` on it waits for good — which is how the first version
        // of this case hung the whole gate. Bounded either way.
        const settled = (image) =>
          Promise.race([
            image.decode().catch(() => undefined),
            new Promise((done) => setTimeout(done, 5000)),
          ])
        for (const image of images) {
          image.scrollIntoView({ block: 'center' })
          await settled(image)
        }
        return images.map((image) => ({ loaded: image.complete && image.naturalWidth > 0 }))
      })

      check(
        'the starter’s pictured options load in both renderers',
        pictures.length < 4
          ? `only ${String(pictures.length)} pictures on the page; the starter has two in each renderer`
          : pictures.every((picture) => picture.loaded)
            ? null
            : `${String(pictures.filter((picture) => !picture.loaded).length)} of ${String(pictures.length)} did not load`,
      )

      await page.close()
    }

    /*
     * The two pages of the site, side by side.
     *
     * The gate was written for the playground's cascade defects. These are the
     * same class of fact about the pages in front of it, and all three were
     * reported by somebody looking at them rather than found by anything here:
     *
     *   - The templates gallery was a light page, in a family nothing loads, on
     *     a palette of its own, under its own header and footer, inside a dark
     *     site. "The templates page does not fit the style at all."
     *   - The hero opened its form on `paper` — cream, serif, editorial —
     *     inside a dark studio, while the examples section further down had
     *     defaulted to `dusk` all along.
     *   - The running submission is fixed in the corner of a full-bleed page,
     *     so at 1600px it sat on top of the live form and the JSON beside it.
     *
     * One width, because none of the three is a breakpoint; all three were
     * worst where there is the most room.
     */
    {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
      console.log('\nthe site — 1600×1000')

      /*
       * What a page is drawn in, read from the page rather than from a file.
       *
       * Computed values, so this is the cascade's answer and not the
       * stylesheet's intention — and `font-family` as computed, so a family the
       * document never fetches still shows up here as the name it asked for.
       * That is deliberate: the old gallery asked for `Inter`, which nothing in
       * this repository has ever loaded, and the browser quietly served
       * whatever the machine had. Comparing the two pages' *requests* catches
       * that, where comparing what rendered would not.
       */
      const look = async (path) => {
        await page.goto(`${origin}${path}`, { waitUntil: 'load' })
        await page.waitForSelector('.bar nav a', { timeout: 30_000 })
        return page.evaluate(() => {
          const body = getComputedStyle(document.body)
          const heading = document.querySelector('h1')
          const bar = document.querySelector('.bar')
          return {
            ground: body.backgroundColor,
            ink: body.color,
            text: body.fontFamily,
            display: heading === null ? null : getComputedStyle(heading).fontFamily,
            bar: bar === null ? null : getComputedStyle(bar).backgroundColor,
            links: [...document.querySelectorAll('.bar nav a')].map((link) => (link.textContent ?? '').trim()),
            mark: document.querySelectorAll('.bar svg.mark').length,
          }
        })
      }

      const home = await look('/')
      for (const path of ['/templates/', '/angular-form-builder/']) {
        const other = await look(path)
        for (const part of ['ground', 'ink', 'text', 'display', 'bar']) {
          check(
            `${path} is drawn in the landing page's ${part}`,
            home[part] !== null && home[part] === other[part]
              ? null
              : `the landing page has ${String(home[part])} and ${path} ${String(other[part])}`,
          )
        }
        check(
          `and carries the same navigation, so adding a page cannot miss one`,
          home.links.length > 3 && home.links.join(' | ') === other.links.join(' | ')
            ? null
            : `${home.links.join(' | ')} against ${other.links.join(' | ')}`,
        )
        check(
          'and the same mark, which is the favicon rather than a letter in a box',
          home.mark === 1 && other.mark === 1
            ? null
            : `${String(home.mark)} marks on the landing page and ${String(other.mark)} on ${path}`,
        )
      }

      /*
       * The form in the hero is the tone of the page it sits in.
       *
       * Asserted as relative luminance, never as the theme's name: what was
       * wrong is that two surfaces disagreed, so that is the property. A
       * differently-named dark theme must pass here and `paper` must not,
       * whatever the default is called by then.
       */
      await page.goto(`${origin}/`, { waitUntil: 'load' })
      await page.waitForSelector('.studio-canvas', { timeout: 30_000 })
      const tone = await page.evaluate(async () => {
        const wait = () => new Promise((done) => setTimeout(done, 200))
        const dark = (colour) => {
          const parts = /rgba?\(([^)]+)\)/.exec(colour)
          if (parts === null) return null
          const [r, g, b] = parts[1].split(/[ ,/]+/).map(Number)
          // Rec. 709 luma, which is ample for "is this surface dark".
          return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
        }

        const canvas = document.querySelector('.studio-canvas')
        if (canvas === null) return { error: 'no form in the hero' }
        const ground = dark(getComputedStyle(document.body).backgroundColor)
        const opens = dark(getComputedStyle(canvas).backgroundColor)

        /*
         * And the same measurement on an appearance that is light.
         *
         * Without it the case above passes on a page where nothing is themed
         * and every surface reads as the same transparent black — green while
         * asserting nothing, which is how a guard here has failed twice.
         */
        const light = [...document.querySelectorAll('.studio-swatches button')].find((button) =>
          (button.textContent ?? '').toLowerCase().includes('paper'),
        )
        if (light === undefined) return { error: 'no appearance switcher' }
        light.click()
        await wait()
        return { ground, opens, switched: dark(getComputedStyle(canvas).backgroundColor) }
      })

      check(
        'the hero form opens in the tone of the page around it',
        tone.error ??
          (tone.ground === null || tone.opens === null
            ? 'could not read a background colour'
            : tone.ground === tone.opens
              ? null
              : `the page is ${tone.ground ? 'dark' : 'light'} and the form opens ${tone.opens ? 'dark' : 'light'}`),
      )
      check(
        'and the switcher beside it really does change that tone',
        tone.error !== undefined || tone.switched !== tone.opens
          ? null
          : 'a light appearance changed nothing, so the case above is reading a constant',
      )

      /*
       * The running submission does not cover the form it reports on.
       *
       * Reading the page is what fills the submission in, so scrolling to the
       * examples is both how the panel appears and how the form it would cover
       * comes on screen.
       */
      const covering = await page.evaluate(async () => {
        const demo = document.querySelector('.demo')
        if (demo === null) return { error: 'no examples section' }
        demo.scrollIntoView({ block: 'center' })
        await new Promise((done) => setTimeout(done, 800))

        const panel = document.querySelector('.panel')
        if (panel === null) return { error: 'the panel never appeared, so this measures nothing' }
        const box = panel.getBoundingClientRect()
        const covered = new Set()
        for (const element of demo.querySelectorAll('.window, .sheet')) {
          const other = element.getBoundingClientRect()
          if (other.right > box.left && other.left < box.right && other.bottom > box.top && other.top < box.bottom) {
            covered.add(String(element.className))
          }
        }
        return { covered: [...covered] }
      })

      check(
        'the running submission does not cover the form it reports on',
        covering.error ?? (covering.covered.length === 0 ? null : `the panel is on top of ${covering.covered.join(', ')}`),
      )

      /*
       * And nothing a visitor needs is off the side of either page.
       *
       * Not `scrollWidth`, which is what the playground's cases use. The site
       * sets `overflow-x: hidden` on the body so the backdrop's auroras and the
       * marquee's two rails can be wider than the screen on purpose, and with
       * that set `scrollWidth` reports 348px of "overflow" on a page that
       * cannot be scrolled sideways at all. Measuring it here would be a case
       * that fails on the decoration and says nothing about the content.
       *
       * So: the page genuinely cannot be scrolled sideways, and every control
       * on it is inside the viewport. The second half is the one with teeth —
       * it is what the reader is actually deprived of when a layout is too
       * wide.
       */
      for (const path of ['/', '/templates/', '/angular-form-builder/']) {
        await page.goto(`${origin}${path}`, { waitUntil: 'load' })
        await page.waitForSelector('.bar nav a', { timeout: 30_000 })
        const reach = await page.evaluate(() => {
          const root = document.scrollingElement ?? document.documentElement
          root.scrollLeft = 9999
          const slid = root.scrollLeft
          root.scrollLeft = 0

          const edge = document.documentElement.clientWidth
          const past = []
          const active = document.activeElement
          for (const control of document.querySelectorAll('a, button, input, select, textarea, summary')) {
            const box = control.getBoundingClientRect()
            if (box.width === 0 || box.height === 0) continue
            if (box.right <= edge + 1 && box.left >= -1) continue

            /*
             * A control parked off the side that comes back when it is focused
             * is the skip link, and that is the correct pattern rather than a
             * defect. Asked of the element rather than recognised by its class:
             * the repository has had a guard match the shape a thing usually
             * has and go quiet the moment it had another.
             */
            control.focus({ preventScroll: true })
            const focused = control.getBoundingClientRect()
            if (focused.right <= edge + 1 && focused.left >= -1) continue

            past.push(`${control.tagName}.${String(control.className).slice(0, 24)}`)
          }
          if (active instanceof HTMLElement) active.focus({ preventScroll: true })
          else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          return { slid, past: [...new Set(past)].slice(0, 6) }
        })

        check(
          `${path} cannot be scrolled sideways`,
          reach.slid === 0 ? null : `it slid ${String(reach.slid)}px`,
        )
        check(
          `and every control on ${path} is inside the viewport`,
          reach.past.length === 0 ? null : `off the edge: ${reach.past.join(', ')}`,
        )
      }

      await page.close()
    }

    /*
     * The Angular starter, as formancy.ai serves it, looks like the Material
     * application it says it is.
     *
     * It did not, and no other gate could say so: Material's type tokens name
     * Roboto with no fallback and nothing loaded it, so every Material label
     * was drawn in the browser's serif; the builder beside the form had no
     * styling at all; and the controls Material does not draw — the submit
     * button, a repeater's — were the platform's grey buttons.
     *
     * Asked of the cascade, not the stylesheet: Roboto as a face the document
     * actually loaded (a family merely named would pass `document.fonts.check`
     * when no face of it exists at all), and colours compared with what
     * Material's own token resolves to on the page, so a change of theme
     * moves both sides and a part left in another colour does not.
     */
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      console.log('\nthe Angular starter — 1440×900')
      await page.goto(`${origin}/angular-form-builder/demo/`, { waitUntil: 'load' })
      await page.waitForSelector('mat-form-field', { timeout: 30_000 })
      const starter = await page.evaluate(async () => {
        await document.fonts.ready
        const token = (name) => {
          const probe = document.createElement('span')
          probe.style.color = `var(${name})`
          document.body.append(probe)
          const value = getComputedStyle(probe).color
          probe.remove()
          return value
        }
        const label = document.querySelector('mat-form-field mat-label')
        const selected = document.querySelector("[data-formancy-part='builder-node'][aria-selected='true']")
        const submit = document.querySelector("[data-formancy-part='submit']")
        const group = document.querySelector("fieldset[data-formancy-part='field']")
        return {
          roboto: [...document.fonts].filter((face) => face.family.replace(/["']/g, '') === 'Roboto' && face.status === 'loaded').length,
          labelFace: label === null ? null : getComputedStyle(label).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
          primary: token('--mat-sys-primary'),
          outline: token('--mat-sys-outline-variant'),
          selected: selected === null ? null : getComputedStyle(selected).boxShadow,
          submit: submit === null ? null : getComputedStyle(submit).backgroundColor,
          frame: group === null ? null : getComputedStyle(group).borderTopColor,
        }
      })

      check(
        'Material’s labels are drawn in Roboto, loaded by the starter rather than named',
        starter.roboto > 0 && starter.labelFace === 'Roboto'
          ? null
          : `${String(starter.roboto)} Roboto faces loaded, and the label asks for ${String(starter.labelFace)}`,
      )
      check(
        'the builder is dressed, and marks its selection in Material’s primary',
        starter.selected !== null && starter.selected.includes(starter.primary)
          ? null
          : `the selected node's mark is ${String(starter.selected)}, and Material's primary ${starter.primary}`,
      )
      check(
        'what Material does not draw wears its colours: the submit button and a group’s frame',
        starter.submit === starter.primary && starter.frame === starter.outline
          ? null
          : `submit ${String(starter.submit)} against ${starter.primary}; frame ${String(starter.frame)} against ${starter.outline}`,
      )
      await page.close()
    }

  } finally {
    await browser.close()
    server.close()
  }

  console.log('')
  if (failures.length > 0) {
    throw new Error(`${String(failures.length)} browser check(s) failed:\n  ${failures.join('\n  ')}`)
  }
  console.log(
    `browser checks passed: ${String(WIDTHS.length)} viewports of the playground, plus the site's pages, the starter embedded in one and the starter on its own, and drops into the space between two nodes, for the layout, gesture and cascade facts jsdom cannot represent`,
  )
}

await run()
