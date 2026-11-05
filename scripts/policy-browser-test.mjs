/**
 * The site is served under its headers, and the browser refuses it nothing (0234).
 *
 * `browser-test.mjs` serves the composed site with the headers `site-headers.mjs` states
 * for its own origin, the policies writing every refusal to this server, so every page
 * any module of the gate opens, every frame and every worker is heard, and not only
 * the pages opened here. Opened here, besides: every page the site holds, once, and
 * the documentation's search, since the gate's other modules open one page of the
 * documentation and none of the legal pages. A page whose inline script or style no
 * longer matches its hash, a section that loads a file from outside its directories,
 * or a library that writes a style the policy refuses fails the run, by name.
 *
 * Two policies are served to the playground. The one the site serves admits inline
 * styles, which Monaco writes as it draws. A second, report-only, admits none, and
 * every report it sends must come from Monaco's own files: the renderers and the
 * builders in the same page write no inline style, which is what lets a host serve a
 * form under a policy with no `'unsafe-inline'` (C4). A static `style` in an Angular
 * template and TipTap's own stylesheet each broke that, both found this way on
 * 5 November 2026.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { SITE_ORIGIN, headersAt, headersFile, headersFor, inlineOf } from './site-headers.mjs'
import { PROBES } from './request-browser-test.mjs'

/** Where the policies the gate serves send each refusal. */
export const REFUSALS = '/__refused'

/** Where Monaco is copied to in the playground (0154): the only files a playground style may come from. */
const MONACO = '/playground/monaco/'

/**
 * The headers for the composed site at `site`, served at `origin`, and what the
 * browser reported back. `headers(pathname)` is what a response carries; `heard(body)`
 * takes a report's body as the browser posted it.
 */
export function servedUnder(site, origin) {
  const report = `${origin}${REFUSALS}`
  const rules = headersFor(origin, inlineOf(site), { report })
  const reports = []
  return {
    headers: (pathname) => ({
      ...headersAt(rules, pathname),
      ...(pathname.startsWith('/playground/')
        ? { 'Content-Security-Policy-Report-Only': `style-src ${origin}/playground/ 'report-sample'; report-uri ${report}` }
        : {}),
    }),
    heard: (body) => reports.push(JSON.parse(body)['csp-report']),
    reports,
  }
}

/** Every page the composed site holds, as the addresses it is served at. */
const pagesOf = (site, directory = site) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pagesOf(site, join(directory, entry.name))
    if (!entry.name.endsWith('.html')) return []
    return [`/${relative(site, join(directory, entry.name)).split(sep).join('/')}`.replace(/(^|\/)index\.html$/, '$1')]
  })

/** A refusal in a line: where, what and from where, the server's origin taken off. */
const said = (origin) => (report) =>
  [
    report['document-uri'],
    report['effective-directive'],
    report['blocked-uri'],
    report['script-sample'] ? JSON.stringify(report['script-sample'].slice(0, 60)) : '',
    report['source-file'] ? `from ${report['source-file']}:${String(report['line-number'])}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .replaceAll(origin, '')

export async function checkServedUnderItsPolicies(browser, origin, site, served, check) {
  console.log('\nthe site’s content security policies')
  // What the deploy serves is the file `pnpm build:web` wrote, and the gate serves the
  // rules it was written from, so the two are held to each other here.
  check(
    'the composed site’s _headers is what these rules state for formancy.ai',
    readFileSync(join(site, '_headers'), 'utf8') === headersFile(headersFor(SITE_ORIGIN, inlineOf(site)))
      ? null
      : 'apps/site/dist/_headers says otherwise: run `pnpm build:web`',
  )
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pages = pagesOf(site)
  try {
    for (const path of pages) {
      const page = await context.newPage()
      await page.goto(`${origin}${path}`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')
      await page.close()
    }

    // The search, which is the documentation's one flow beyond reading: a WebAssembly
    // module compiled in a worker, and the index fetched in fragments.
    const page = await context.newPage()
    await page.goto(`${origin}/docs/`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Search' }).first().click()
    await page.getByRole('dialog', { name: 'Search' }).getByRole('textbox').fill('schema')
    const found = await page
      .locator('.pagefind-ui__result')
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => null)
      .catch(() => 'no result for “schema”')
    check('the documentation’s search finds a page under its policy', found)
    await page.close()
  } finally {
    await context.close()
  }
  check(
    `every page the site holds was opened: ${String(pages.length)} of them`,
    pages.includes('/') && pages.includes('/docs/') ? null : 'the walk found no landing page or documentation',
  )

  // A report is posted after the event that caused it, by the browser and not the page.
  await new Promise((done) => setTimeout(done, 1000))
  const { reports } = served
  const line = said(origin)
  const provoked = reports.filter((report) => report.disposition === 'enforce' && Object.values(PROBES).includes(report['blocked-uri']))
  check(
    'the policies’ reports reached the gate: it heard the two refusals the request gate provokes',
    new Set(provoked.map((report) => report['blocked-uri'])).size === Object.keys(PROBES).length
      ? null
      : `it heard ${provoked.map(line).join('; ') || 'neither'}`,
  )
  const refused = reports.filter((report) => report.disposition === 'enforce' && !provoked.includes(report))
  check('and the policies refused the site nothing else', refused.length === 0 ? null : [...new Set(refused.map(line))].join('\n          '))

  const styled = reports.filter((report) => report.disposition === 'report')
  const monaco = (report) => (report['source-file'] ?? '').startsWith(`${origin}${MONACO}`)
  check('the playground’s second policy was served: it heard Monaco write its styles', styled.some(monaco) ? null : 'no report from Monaco’s files')
  const others = styled.filter((report) => !monaco(report))
  check(
    'and nothing in the playground but Monaco wrote an inline style, so the renderers and builders need no policy to admit one',
    others.length === 0 ? null : [...new Set(others.map(line))].join('\n          '),
  )
}
