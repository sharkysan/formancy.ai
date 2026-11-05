import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { LINE_LIMIT, RULE_LIMIT, SECTIONS, SITE_ORIGIN, headersAt, headersFile, headersFor, inlineOf, matches } from '../../../scripts/site-headers.mjs'
import type { Inline, Rule, Section } from '../../../scripts/site-headers.mjs'

/**
 * The headers formancy.ai is served with (0234).
 *
 * The browser gate holds that the site works under them: it serves the composed site
 * with them, opens every page and fails on any refusal. What it cannot hold is what the
 * policies would let through, since a page that works under `'self'` works under a
 * narrower policy too. So the shape of each policy is held here, read from the
 * directives rather than from the wording of the header.
 */

const NONE: Inline = { scripts: [], styles: [] }
const noInline = Object.fromEntries(SECTIONS.map(({ name }) => [name, NONE])) as Record<Section['name'], Inline>

/** A section's policy, directive to sources, for the site at `origin`. */
function policyOf(name: Section['name'], origin = SITE_ORIGIN, inline = noInline): Map<string, string[]> {
  const section = SECTIONS.find((each) => each.name === name)
  if (section === undefined) throw new Error(`no section ${name}`)
  const value = headersAt(headersFor(origin, inline), section.paths[0] ?? '')['Content-Security-Policy'] ?? ''
  return new Map(value.split('; ').map((directive) => [directive.split(' ')[0] ?? '', directive.split(' ').slice(1)]))
}

const names = SECTIONS.map(({ name }) => name)

describe('each section’s policy', () => {
  test.each(names)('%s admits files under this origin, by path, and no host or scheme wholesale', (name) => {
    // `'self'` admits whatever the origin serves, and Cloudflare serves its injected
    // features' scripts from `/cdn-cgi/` of the same origin; a scheme admits every host.
    for (const [directive, sources] of policyOf(name)) {
      for (const source of sources) {
        const allowed =
          /^'[a-z-]+'$/.test(source) ||
          ['data:', 'blob:'].includes(source) ||
          source.startsWith(`${SITE_ORIGIN}/`) ||
          (directive === 'frame-ancestors' && source === SITE_ORIGIN)
        expect(allowed, `${directive} ${source}`).toBe(true)
        expect(["'self'", "'unsafe-eval'", "'strict-dynamic'", '*'], `${directive} ${source}`).not.toContain(source)
      }
    }
  })

  test('admits an inline style only where measured, and an inline script nowhere but by its hash', () => {
    // Material writes its styles into `<style>` elements, Monaco writes elements and
    // attributes, and Starlight writes attributes; a script is never admitted inline.
    const inline = names.flatMap((name) =>
      [...policyOf(name)].filter(([, sources]) => sources.includes("'unsafe-inline'")).map(([directive]) => `${name} ${directive}`),
    )
    expect(inline).toEqual(['starter style-src', 'playground style-src', 'docs style-src-attr'])
  })

  test.each(names)('%s refuses every form, base, object and manifest, and anything a directive does not name', (name) => {
    const policy = policyOf(name)
    for (const directive of ['default-src', 'base-uri', 'form-action', 'object-src', 'manifest-src']) {
      expect(policy.get(directive), directive).toEqual(["'none'"])
    }
  })

  test('refuses every connection but the documentation’s search index', () => {
    // Nothing on the site sends what is typed anywhere, the playground included, whose
    // page sends a model's request to nobody (0160).
    expect(Object.fromEntries(names.map((name) => [name, policyOf(name).get('connect-src')]))).toEqual({
      site: ["'none'"],
      starter: ["'none'"],
      playground: ["'none'"],
      docs: [`${SITE_ORIGIN}/docs/pagefind/`],
    })
  })

  test('lets no page be framed but the starter, and the starter only by this site', () => {
    expect(Object.fromEntries(names.map((name) => [name, policyOf(name).get('frame-ancestors')]))).toEqual({
      site: ["'none'"],
      starter: [SITE_ORIGIN],
      playground: ["'none'"],
      docs: ["'none'"],
    })
  })

  test('requires Trusted Types, with no policy, wherever no script hands a sink a string', () => {
    // Monaco's loader and Pagefind both do, measured; the site's pages and the starter do not.
    const required = names.filter((name) => policyOf(name).get('require-trusted-types-for')?.join(' ') === "'script'")
    expect(required).toEqual(['site', 'starter'])
    for (const name of required) expect(policyOf(name).get('trusted-types'), name).toEqual(["'none'"])
  })

  test('admits the inline scripts and styles a section’s pages carry by their hashes, and only that section', () => {
    const inline = { ...noInline, docs: { scripts: ['sha256-one'], styles: [] }, site: { scripts: [], styles: ['sha256-two'] } }
    expect(policyOf('docs', SITE_ORIGIN, inline).get('script-src')).toContain("'sha256-one'")
    expect(policyOf('site', SITE_ORIGIN, inline).get('style-src')).toContain("'sha256-two'")
    expect(policyOf('playground', SITE_ORIGIN, inline).get('script-src')).not.toContain("'sha256-one'")
  })
})

describe('the headers as a function of the origin', () => {
  test('the deploy’s and the gate’s differ in the origin and the report address alone', () => {
    // What the gate measured is what formancy.ai serves only while this holds.
    const gate = 'http://127.0.0.1:4321'
    const served = headersFor(gate, noInline, { report: `${gate}/__refused` }).map(({ path, headers }) => ({
      path,
      headers: Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name, value.replace(`; report-uri ${gate}/__refused`, '').replaceAll(gate, SITE_ORIGIN)]),
      ),
    }))
    expect(served).toEqual(headersFor(SITE_ORIGIN, noInline).map(({ path, headers }) => ({ path, headers: { ...headers } })))
  })

  test.each([
    'https://formancy.ai/',
    'https://formancy.ai/docs/',
    'formancy.ai',
    'ftp://formancy.ai',
    'javascript:alert(1)',
    'https://someone@formancy.ai',
    'https://Formancy.ai',
  ])('%j is not an origin as a browser writes one, and is refused, since a policy admits what it names', (origin) => {
    expect(() => headersFor(origin, noInline)).toThrow(/an http or https origin/)
  })

  test('every response carries the headers no section changes', () => {
    for (const pathname of ['/', '/assets/main.js', '/docs/', '/playground/monaco/vs/loader.js']) {
      expect(headersAt(headersFor(SITE_ORIGIN, noInline), pathname), pathname).toMatchObject({
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        // So that Cloudflare injects nothing the policies would then refuse.
        'Cache-Control': 'public, max-age=0, must-revalidate, no-transform',
      })
    }
  })
})

describe('the paths, as Cloudflare matches them', () => {
  test.each([
    ['/', '/', true],
    ['/', '/templates/', false],
    ['/templates/*', '/templates/', true],
    ['/templates/*', '/templates/x/', true],
    ['/angular-form-builder/', '/angular-form-builder/demo/', false],
    ['/angular-form-builder/demo/*', '/angular-form-builder/demo/', true],
    ['/docs/*', '/docsx/', false],
  ])('%s matches %s: %s', (path, pathname, expected) => {
    expect(matches(path, pathname)).toBe(expected)
  })

  test('a header two matching rules set is joined into one value, as Cloudflare joins it', () => {
    // Which is why no page may match two rules that set a policy: the browser would
    // enforce both, and the page would be held to what neither section's alone says.
    const rules: Rule[] = [
      { path: '/*', headers: { 'Content-Security-Policy': "img-src 'none'" } },
      { path: '/docs/*', headers: { 'Content-Security-Policy': "font-src 'none'" } },
    ]
    expect(headersAt(rules, '/docs/')['Content-Security-Policy']).toBe("img-src 'none', font-src 'none'")
  })
})

describe('_headers', () => {
  test('is the rules in order, one header to an indented line', () => {
    const file = headersFile(headersFor(SITE_ORIGIN, noInline))
    expect(file.startsWith('/*\n  X-Content-Type-Options: nosniff\n')).toBe(true)
    expect(file.split('\n').filter((line) => line.startsWith('/'))).toEqual(['/*', ...SECTIONS.flatMap(({ paths }) => paths)])
  })

  test.each<[string, Rule[], RegExp]>([
    ['a name that is not a token', [{ path: '/*', headers: { 'Bad Name': 'x' } }], /not a header name/],
    ['a line break in a value', [{ path: '/*', headers: { 'X-A': 'one\ntwo' } }], /line break/],
    ['a line past the limit', [{ path: '/*', headers: { 'X-A': 'x'.repeat(LINE_LIMIT) } }], /Cloudflare reads 2000/],
    ['a placeholder', [{ path: '/:name/', headers: {} }], /pattern/],
    ['a splat before the end', [{ path: '/a*/b', headers: {} }], /pattern/],
    ['a detached header', [{ path: '/! x', headers: {} }], /pattern/],
    ['more rules than Cloudflare reads', Array.from({ length: RULE_LIMIT + 1 }, (_, at) => ({ path: `/${String(at)}/`, headers: {} })), /rules/],
  ])('refuses %s, which Cloudflare would read otherwise than the rules mean', (_, rules, error) => {
    expect(() => headersFile(rules)).toThrow(error)
  })
})

describe('the inline scripts and styles of the built pages', () => {
  let site: string | undefined
  afterEach(() => {
    if (site !== undefined) rmSync(site, { recursive: true, force: true })
  })
  const page = (path: string, html: string): void => {
    if (site === undefined) site = mkdtempSync(join(tmpdir(), 'site-headers-'))
    const file = join(site, ...path.split('/'))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, html)
  }
  const sha = (text: string): string => `sha256-${createHash('sha256').update(text).digest('base64')}`

  test('are hashed per section: a script that runs and a style, never a data block or an external file', () => {
    page('index.html', '<script type="application/ld+json">{"@context":"x"}</script><script type="module" src="/assets/a.js"></script>')
    page('legal/index.html', '<style>body{margin:0}</style>')
    page('docs/start/index.html', '<script>one()</script><script type="module">two()</script><script src="/docs/_astro/a.js"></script>')
    page('docs/404.html', '<script>one()</script>')

    expect(inlineOf(site ?? '')).toEqual({
      site: { scripts: [], styles: [sha('body{margin:0}')] },
      starter: NONE,
      playground: NONE,
      docs: { scripts: [sha('one()'), sha('two()')].sort(), styles: [] },
    })
  })

  test('refuse a page that no section serves, since it would be served under no policy', () => {
    page('index.html', '')
    page('pricing/index.html', '')
    expect(() => inlineOf(site ?? '')).toThrow(/\/pricing\/ is a page of the site that no section serves/)
  })
})
