import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (path: string): string => readFileSync(join(repo, path), 'utf8')

describe('the public site serves its own fonts', () => {
  test.each(['site', 'playground'])('%s does not contact Google to render text', (app) => {
    // A preconnect transmits connection data even when no font is downloaded.
    expect(read(`apps/${app}/index.html`)).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(read(`apps/${app}/src/main.tsx`)).toContain("../../shared/fonts/fonts.css")
  })

  test('every CSS font URL names a real, unmodified WOFF2 with a recorded source', () => {
    // A local-looking URL that 404s silently changes the typography. Hashes also
    // make an accidental edit to an OFL asset visible before it is redistributed.
    const css = read('apps/shared/fonts/fonts.css')
    const manifest = JSON.parse(read('apps/shared/fonts/manifest.json')) as {
      files: { file: string; sha256: string }[]
    }
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1] ?? '')
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url).toMatch(/^\.\/[^/]+\.woff2$/)
      const bytes = readFileSync(join(repo, 'apps/shared/fonts', url))
      expect(bytes.subarray(0, 4).toString()).toBe('wOF2')
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        manifest.files.find((entry) => entry.file === url.slice(2))?.sha256,
      )
    }
  })

  test.each(['site', 'playground'])('%s distributes the copyright and licence notices', (app) => {
    // Bundlers keep a font but normally drop its adjacent text file. The public
    // copies must ship in each app, even when it is built on its own.
    for (const family of ['archivo', 'fraunces', 'ibmplexmono', 'ibmplexsans', 'spacegrotesk']) {
      const source = read(`apps/shared/fonts/${family}-OFL.txt`)
      expect(source).toContain('SIL OPEN FONT LICENSE Version 1.1')
      expect(read(`apps/${app}/public/font-licenses/${family}-OFL.txt`)).toBe(source)
    }
  })
})
