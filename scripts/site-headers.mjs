// The headers formancy.ai is served with, decided once, as a function of the
// origin it is served at (0234). `scripts/build-web.mjs` writes them for
// https://formancy.ai into the `_headers` file Cloudflare's static assets read,
// at the root of the composed site; `pnpm test:browser` serves the composed site
// under them for its own origin, and fails a run the policies refused anything in.
// The two differ in the origin, and in the gate's address for the reports, and in
// nothing else.
//
// Each section of the site is its own build, needing different things of a
// policy, so each is served under its own: the site's pages, the Angular starter
// inside one of them, the playground and the documentation. All four admit the
// section's own files and nothing else, refuse every form, base, object and
// manifest, and refuse a frame but for the starter's own page. A section names its
// directories, not `'self'`, which admits whatever the origin serves: Cloudflare
// serves the scripts of the features it injects from `/cdn-cgi/` of the same
// origin, and formancy.ai-health's review measured on 18 October 2026 that one,
// admitted, sent what was typed to the origin. `no-transform` asks Cloudflare not to
// inject them at all, and the policy refuses one if it does.
//
// What each section needs beyond its files was measured, not reasoned: the gate
// ran on 5 November 2026 under one strict policy in report-only mode, every
// report collected, and every page of the site was opened under it.
//
// - **The site's pages** need nothing more, and require Trusted Types with no
//   policy at all. The legal notice and the privacy notice each carry a `<style>`,
//   admitted by its hash.
// - **The starter** is Angular Material, which writes every component's styles
//   into a `<style>` as the component first renders, and its stylesheet carries
//   faces as `data:` addresses. So `'unsafe-inline'` for styles, and `data:` faces.
// - **The playground** is Monaco, which writes `<style>` elements and style
//   attributes as it draws, loads its own codicon face as a `data:` address, starts
//   its workers from `blob:` addresses, and hands its loader script addresses as
//   strings, so Trusted Types are not required here. The renderers and the
//   builders in the same page need none of it, which the gate holds by serving the
//   page a second, report-only policy with no inline style and failing on any
//   report not from Monaco's files.
// - **The documentation** is Starlight, whose pages carry inline scripts, each
//   admitted by its hash, and style attributes, which a hash can admit only through
//   `'unsafe-hashes'`, one hash per distinct attribute: more than a header line
//   holds, so `'unsafe-inline'` for attributes alone. Its search is Pagefind, which
//   compiles WebAssembly in a worker and hands that worker's address and its
//   results' markup to their sinks as strings, so Trusted Types are not required.
//
// A header two matching rules both set is joined by Cloudflare into one value, so
// no page matches two rules that set a policy: `inlineOf` refuses a page that
// matches no section or two.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Where formancy.ai is served, which the deploy's `_headers` is written for. */
export const SITE_ORIGIN = 'https://formancy.ai'

/** Cloudflare's limits for `_headers`: rules in the file, and characters on one line. */
export const RULE_LIMIT = 100
export const LINE_LIMIT = 2000

/** The headers every response carries, whichever section it belongs to. */
const EVERY_RESPONSE = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // No page asks for a device: the playground's scanner is a stand-in (0071).
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Cloudflare's own cache control for static assets, with `no-transform`, so that it
  // rewrites nothing: an obfuscated e-mail address is decoded by a script from
  // `/cdn-cgi/`, which the policies refuse.
  'Cache-Control': 'public, max-age=0, must-revalidate, no-transform',
}

/**
 * The sections, the paths each is served at, as `_headers` matches them, and its
 * policy as a function of the origin and of the inline scripts and styles its pages
 * carry, by hash.
 */
export const SECTIONS = [
  {
    name: 'site',
    paths: ['/', '/templates/*', '/angular-form-builder/', '/legal/*', '/privacy/*'],
    policy: (origin, inline) => [
      `script-src ${origin}/assets/${hashes(inline.scripts)}`,
      `style-src ${origin}/assets/${hashes(inline.styles)}`,
      `font-src ${origin}/assets/`,
      // The icons each page names, which Chromium fetches as pictures.
      `img-src ${origin}/favicon.svg ${origin}/apple-touch-icon.png ${origin}/assets/ data:`,
      `frame-src ${origin}/angular-form-builder/demo/`,
      "connect-src 'none'",
      "frame-ancestors 'none'",
      "require-trusted-types-for 'script'",
      "trusted-types 'none'",
    ],
  },
  {
    name: 'starter',
    paths: ['/angular-form-builder/demo/*'],
    policy: (origin, inline) => [
      `script-src ${origin}/angular-form-builder/demo/${hashes(inline.scripts)}`,
      `style-src ${origin}/angular-form-builder/demo/ 'unsafe-inline'`,
      `font-src ${origin}/angular-form-builder/demo/ data:`,
      `img-src ${origin}/angular-form-builder/demo/ data:`,
      "connect-src 'none'",
      // The site's Angular page frames it. A path here is ignored: an ancestor is
      // matched by its origin.
      `frame-ancestors ${origin}`,
      "require-trusted-types-for 'script'",
      "trusted-types 'none'",
    ],
  },
  {
    name: 'playground',
    paths: ['/playground/*'],
    policy: (origin, inline) => [
      `script-src ${origin}/playground/${hashes(inline.scripts)}`,
      `style-src ${origin}/playground/ 'unsafe-inline'`,
      `font-src ${origin}/playground/ data:`,
      // A document's own pictures may be `data:` addresses, and the page's own `blob:`
      // ones name bytes it already holds; neither tells anybody anything (0154).
      `img-src ${origin}/playground/ data: blob:`,
      `worker-src ${origin}/playground/ blob:`,
      "connect-src 'none'",
      "frame-ancestors 'none'",
    ],
  },
  {
    name: 'docs',
    paths: ['/docs/*'],
    policy: (origin, inline) => [
      `script-src ${origin}/docs/_astro/ ${origin}/docs/pagefind/ 'wasm-unsafe-eval'${hashes(inline.scripts)}`,
      `style-src ${origin}/docs/_astro/ ${origin}/docs/pagefind/${hashes(inline.styles)}`,
      "style-src-attr 'unsafe-inline'",
      `font-src ${origin}/docs/_astro/`,
      `img-src ${origin}/docs/ data:`,
      `connect-src ${origin}/docs/pagefind/`,
      `worker-src ${origin}/docs/pagefind/`,
      "frame-ancestors 'none'",
    ],
  },
]

/** The directives every section's policy starts with: what no page of the site does. */
const REFUSED = ["default-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "manifest-src 'none'"]

const hashes = (list) => list.map((hash) => ` '${hash}'`).join('')

/**
 * The rules of `_headers`, in order, for the site at `origin`: an http or https
 * origin as a browser writes one, with no path. `inline` is `inlineOf`'s answer for
 * the built site. `report`, the gate's alone, is where a browser sends each refusal.
 */
export function headersFor(origin, inline, { report } = {}) {
  if (!URL.canParse(origin) || new URL(origin).origin !== origin || !/^https?:/.test(origin)) {
    throw new Error(`the site's headers are for an http or https origin, written as a browser writes one, not ${JSON.stringify(origin)}`)
  }
  return Object.freeze([
    Object.freeze({ path: '/*', headers: Object.freeze({ ...EVERY_RESPONSE }) }),
    ...SECTIONS.flatMap((section) => {
      const directives = [...REFUSED, ...section.policy(origin, inline[section.name]), ...(report === undefined ? [] : [`report-uri ${report}`])]
      const headers = Object.freeze({ 'Content-Security-Policy': directives.join('; ') })
      return section.paths.map((path) => Object.freeze({ path, headers }))
    }),
  ])
}

/** Whether a `_headers` path matches `pathname`: exactly, or by a splat at its end, which matches any rest, none included. */
export function matches(path, pathname) {
  return path.endsWith('*') ? pathname.startsWith(path.slice(0, -1)) : pathname === path
}

/** The headers a response for `pathname` carries under `rules`, as Cloudflare applies them: every matching rule's, a header two rules set joined by a comma. */
export function headersAt(rules, pathname) {
  const headers = {}
  for (const rule of rules) {
    if (!matches(rule.path, pathname)) continue
    for (const [name, value] of Object.entries(rule.headers)) headers[name] = name in headers ? `${headers[name]}, ${value}` : value
  }
  return headers
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/** `_headers` as it is written to disk, refusing what Cloudflare would read otherwise than these rules mean. */
export function headersFile(rules) {
  if (rules.length > RULE_LIMIT) throw new Error(`${String(rules.length)} rules, and Cloudflare reads ${String(RULE_LIMIT)}`)
  const lines = []
  for (const { path, headers } of rules) {
    // A path is matched as `matches` matches it: no placeholder, no splat but a last one.
    if (!/^\/[^:*!\s]*\*?$/.test(path)) throw new Error(`a path _headers would read as a pattern this file does not mean: ${JSON.stringify(path)}`)
    lines.push(path)
    for (const [name, value] of Object.entries(headers)) {
      if (!HEADER_NAME.test(name)) throw new Error(`not a header name: ${JSON.stringify(name)}`)
      if (/[\r\n]/.test(value)) throw new Error(`a line break in ${name}, which would end the header there`)
      lines.push(`  ${name}: ${value}`)
    }
  }
  for (const line of lines) {
    if (line.length > LINE_LIMIT)
      throw new Error(`a line of ${String(line.length)} characters, and Cloudflare reads ${String(LINE_LIMIT)}: ${line.slice(0, 80)}…`)
  }
  return `${lines.join('\n')}\n`
}

/** The address a built page is served at: its directory's, for an `index.html`. */
const pathOf = (site, file) => `/${relative(site, file).split(sep).join('/')}`.replace(/(^|\/)index\.html$/, '$1')

/** Every `.html` file under `directory`. */
const pagesUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? pagesUnder(join(directory, entry.name)) : entry.name.endsWith('.html') ? [join(directory, entry.name)] : [],
  )

/**
 * The script types a policy's `script-src` governs inline: a classic script, under no
 * type or a JavaScript one, a module, an import map and speculation rules. Anything
 * else, JSON-LD among it, is a data block, which the browser never runs.
 */
const RUN = new Set(['', 'module', 'importmap', 'speculationrules', 'text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'])

const sha256 = (text) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`

/**
 * The inline scripts and styles each section's pages carry, by hash, read from the
 * built site at `site`. Refuses a page that no section's paths match, or two do,
 * since it would be served under no policy, or under two joined into one.
 */
export function inlineOf(site) {
  const inline = Object.fromEntries(SECTIONS.map((section) => [section.name, { scripts: new Set(), styles: new Set() }]))
  for (const file of pagesUnder(site)) {
    const path = pathOf(site, file)
    const owners = SECTIONS.filter((section) => section.paths.some((pattern) => matches(pattern, path)))
    if (owners.length !== 1) {
      throw new Error(
        `${path} is a page of the site that ${owners.length === 0 ? 'no section' : owners.map(({ name }) => name).join(' and ')} serves, so it would be served under ${owners.length === 0 ? 'no policy' : 'two policies joined'}; give it one in scripts/site-headers.mjs`,
      )
    }
    const html = readFileSync(file, 'utf8')
    for (const [, attributes, text] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\ssrc\s*=/i.test(attributes)) continue
      const type = (/\stype\s*=\s*["']?([^"'\s>]*)/i.exec(attributes)?.[1] ?? '').toLowerCase()
      if (RUN.has(type)) inline[owners[0].name].scripts.add(sha256(text))
    }
    for (const [, text] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) inline[owners[0].name].styles.add(sha256(text))
  }
  return Object.fromEntries(Object.entries(inline).map(([name, { scripts, styles }]) => [name, { scripts: [...scripts].sort(), styles: [...styles].sort() }]))
}
