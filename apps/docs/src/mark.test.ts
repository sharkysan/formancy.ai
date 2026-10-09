import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'

/**
 * One mark, everywhere it is drawn.
 *
 * Asked: why is the logo not the same everywhere, for example in the docs? Because there
 * were four. The site's bar drew a violet stem and teal arms from its palette; the site's
 * and the playground's favicons drew a darker violet and teal; the admin drew the palette's
 * colours on the favicon's ground; and the documentation drew a single mint on dark green,
 * in its header and its favicon. The Angular starter had no favicon at all. The playground's
 * favicon said "one mark across the site, the playground and the admin" — and nothing held
 * it to that, or to the documentation, which it did not name.
 *
 * The site's favicon is the mark. Every other copy is compared with it shape for shape and
 * colour for colour; the site's own bar, which colours the mark through its palette, is held
 * to it through the palette.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const read = (...path: string[]): string => readFileSync(join(repo, ...path), 'utf8')

interface Shape {
  x: string
  y: string
  width: string
  height: string
  rx: string
  fill: string
}

/**
 * `source` with every span from `open` to the next `close` taken out — scanned rather than
 * replaced by a regular expression, which CodeQL reads as an HTML sanitiser. This reads
 * source; it cleans nothing for a browser.
 */
function without(source: string, open: string, close: string): string {
  let kept = ''
  let at = 0
  for (;;) {
    const start = source.indexOf(open, at)
    if (start < 0) return kept + source.slice(at)
    kept += source.slice(at, start)
    const end = source.indexOf(close, start + open.length)
    if (end < 0) return kept
    at = end + close.length
  }
}

/** Every rectangle a mark draws, with what it is filled with, comments ignored. */
function shapes(source: string): Shape[] {
  const code = without(without(source, '<!--', '-->'), '{/*', '*/}')
  return [...code.matchAll(/<rect\b([^>]*)\/?>/g)].map(([, attributes]) => {
    // An absent position is 0, as SVG reads it; an absent fill is the site's bar, which
    // fills its stem and arms from the stylesheet.
    const attribute = (name: string, absent: string): string =>
      new RegExp(`\\b${name}="([^"]*)"`).exec(attributes!)?.[1] ?? absent
    return {
      x: attribute('x', '0'),
      y: attribute('y', '0'),
      width: attribute('width', '0'),
      height: attribute('height', '0'),
      rx: attribute('rx', '0'),
      fill: attribute('fill', '').toLowerCase(),
    }
  })
}

const mark = (): Shape[] => shapes(read('apps', 'site', 'public', 'favicon.svg'))

/** A PNG's pixels, RGB or RGBA, unfiltered — enough of the format to read a colour. */
function pixels(png: Buffer): { width: number; channels: number; data: Buffer } {
  let at = 8
  let width = 0
  let height = 0
  let channels = 3
  const chunks: Buffer[] = []
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const data = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      channels = data[9] === 6 ? 4 : 3
    }
    if (type === 'IDAT') chunks.push(data)
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const data = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? data[y * stride + x - channels]! : 0
      const up = y > 0 ? data[(y - 1) * stride + x]! : 0
      const corner = x >= channels && y > 0 ? data[(y - 1) * stride + x - channels]! : 0
      const guess = left + up - corner
      const paeth =
        Math.abs(guess - left) <= Math.abs(guess - up) && Math.abs(guess - left) <= Math.abs(guess - corner)
          ? left
          : Math.abs(guess - up) <= Math.abs(guess - corner)
            ? up
            : corner
      const predicted = [0, left, up, (left + up) >> 1, paeth][filter!]!
      data[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + predicted) & 255
    }
  }
  return { width, channels, data }
}

function pixel(png: Buffer, x: number, y: number): string {
  const { width, channels, data } = pixels(png)
  const at = Math.round(y) * width * channels + Math.round(x) * channels
  return `#${[0, 1, 2].map((i) => data[at + i]!.toString(16).padStart(2, '0')).join('')}`
}

describe('the mark', () => {
  test('is a ground, a stem and two arms', () => {
    // A parse that found nothing would make every copy below agree with it.
    expect(mark()).toHaveLength(4)
  })

  test('is the same in every favicon and in the documentation’s header', () => {
    const copies = [
      ...readdirSync(join(repo, 'apps'))
        .map((app) => join('apps', app, 'public', 'favicon.svg'))
        .filter((path) => existsSync(join(repo, path))),
      join('apps', 'docs', 'src', 'assets', 'mark.svg'),
    ]
    expect(copies.length).toBeGreaterThan(3)
    for (const copy of copies) expect({ copy, shapes: shapes(read(copy)) }).toEqual({ copy, shapes: mark() })
  })

  test('and in the admin, which draws it inline', () => {
    expect(shapes(read('apps', 'admin', 'src', 'mark.tsx'))).toEqual(mark())
  })

  test('and on the site’s bar, whose stem and arms are its palette’s violet and teal', () => {
    // The bar and the social card colour the mark through `--client` and `--server`, so
    // those two are what has to agree. Shape for shape, too.
    const css = read('apps', 'site', 'src', 'shell.css')
    const token = (name: string): string =>
      new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toLowerCase() ?? ''
    const [, stem, arm] = mark()
    expect(token('client')).toBe(stem!.fill)
    expect(token('server')).toBe(arm!.fill)
    for (const file of ['chrome.tsx', 'og-card.tsx']) {
      const drawn = shapes(read('apps', 'site', 'src', file)).map(({ fill: _, ...shape }) => shape)
      expect(drawn).toEqual(mark().map(({ fill: _, ...shape }) => shape))
    }
  })

  test('and in the picture a phone puts on its home screen', () => {
    // A raster copy, so its colours are read from its pixels: the ground in a corner, the
    // stem and an arm at their middles, on the 64-unit grid the mark is drawn on.
    const png = readFileSync(join(repo, 'apps', 'site', 'public', 'apple-touch-icon.png'))
    const [ground, stem, arm] = mark()
    const scale = pixels(png).width / 64
    expect([pixel(png, 2, 2), pixel(png, 20 * scale, 32 * scale), pixel(png, 40 * scale, 20 * scale)]).toEqual(
      [ground!.fill, stem!.fill, arm!.fill],
    )
  })

  test('and every page an application serves names it as its icon', () => {
    // The Angular starter had none, so its tab showed the browser's blank page.
    const pages = [
      join('apps', 'admin', 'index.html'),
      join('apps', 'playground', 'index.html'),
      join('apps', 'angular-starter', 'index.html'),
      ...['', 'templates', 'angular-form-builder'].map((page) => join('apps', 'site', page, 'index.html')),
    ]
    const missing = pages.filter((page) => !/<link[^>]*rel="icon"[^>]*favicon\.svg/.test(read(page)))
    expect(missing).toEqual([])
  })
})
