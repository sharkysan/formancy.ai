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
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  const url = `http://127.0.0.1:${String(port)}/playground/`

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
    `browser checks passed: ${String(WIDTHS.length)} viewports against the composed site, for the two things jsdom cannot see`,
  )
}

await run()
