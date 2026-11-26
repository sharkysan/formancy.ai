import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import landingHtml from '../index.html?raw'
import dataHtml from '../products/data/index.html?raw'
import healthHtml from '../products/health/index.html?raw'
import reportHtml from '../products/report/index.html?raw'
import PAID_MODULES from './paid-modules.json'
import { ProductPage } from './product-page.js'
import { STATIC_PAGES, renderPage } from './render.js'
import { PRODUCTS } from './products/all.js'
import type { Product } from './products/product.js'
import { longDate } from './products/product.js'

/**
 * The paid modules' product pages (0242): `/products/data/`, `/products/report/` and
 * `/products/health/`.
 *
 * What a page says about its module was read from that module's repository, and nothing
 * here can read it again: the page dates it. What is held here is what this repository
 * decides. Every link to the module sits beside its terms, as on the landing page (0179,
 * 0241); a page that names HL7 or FHIR carries HL7's sentence; "open source" is said of
 * nothing but in denial; the head each `index.html` carries is the page's own and fits a
 * search result, names the module's own share card and places the page under formancy.ai;
 * and the HTML the build sends holds the page, not an empty root. The landing page's head
 * names each module as its product page does, and says they are paid.
 */
afterEach(cleanup)

const PAGES: ReadonlyArray<[string, Product, string]> = [
  ['Formancy Data', PRODUCTS.data, dataHtml],
  ['Formancy Report', PRODUCTS.report, reportHtml],
  ['Formancy Health', PRODUCTS.health, healthHtml],
]

/** A page's structured data, the nodes of the graph its head carries. */
const graphOf = (html: string): Array<Record<string, unknown>> => {
  const head = new DOMParser().parseFromString(html, 'text/html')
  const data = JSON.parse(head.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}') as { '@graph'?: Array<Record<string, unknown>> }
  return data['@graph'] ?? []
}

/** What a node of the page says, as words without their markup: a heading's `<em>` adds none. */
const wordsOf = (node: ReactNode): string => new DOMParser().parseFromString(renderToStaticMarkup(<>{node}</>), 'text/html').body.textContent ?? ''

/** A link to a paid module, however it is spelled: its repository, its pages on formancy.ai, or its product page here. */
const MODULE_LINK = /formancy\.ai-(data|report|health)|formancy\.ai\/(data|report|health)\/|\/products\/(data|report|health)\//

/** The module a link leads to, by the part of its address that names it. */
const moduleOf = (href: string): string | undefined => {
  const match = MODULE_LINK.exec(href)
  const id = match?.[1] ?? match?.[2] ?? match?.[3]
  return id === undefined ? undefined : `Formancy ${id.charAt(0).toUpperCase()}${id.slice(1)}`
}

/**
 * Words on the pages in another language than the page's English, and the language each is
 * in. A screen reader says an unmarked word in the page's language, so "Zuweisung" would be
 * read as English (WCAG 3.1.2). Written here rather than read from the pages, so a word that
 * loses its mark fails rather than leaving the list.
 */
const FOREIGN: ReadonlyArray<[string, string]> = [
  ['Zuweisung', 'de'],
  ['Synthetische Fragestellung', 'de'],
  ['Deutsch', 'de'],
  ['Français', 'fr'],
  ['Italiano', 'it'],
]

describe.each(PAGES)('the product page of %s', (_, product, html) => {
  test('is one document: one heading level one, and the content reachable by a skip link', () => {
    // A second heading level one from a module's copy would split the page's subject, for a
    // search engine and for somebody moving by headings; and a page this long needs the skip
    // link the rest of the site has, landing on the content and not on the bar again.
    render(<ProductPage product={product} />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#start')
    expect(screen.getByRole('main').id).toBe('start')
  })

  test('says beside every link to the module that it is not free', () => {
    /*
     * The failure this prevents is 0179's: a link to a module under another licence, reached
     * alone — by tab, or from a list of links — with nothing beside it saying the module is
     * paid. On a page about one module every link but formancy's own is one, so each sits in
     * a group named by the terms and showing them, or, in the footer, in an item that says
     * them. Asked of every link whose address names a module, whatever its spelling, so a
     * link added anywhere on the page is held too.
     */
    render(<ProductPage product={product} />)

    const links = screen.getAllByRole('link').filter((link) => MODULE_LINK.test(link.getAttribute('href') ?? ''))
    // A guard on the guard: the calls to action, the example's, the further pages', the
    // licence's and the footer's three.
    expect(links.length).toBeGreaterThan(product.ctas.length + product.further.links.length + 3)

    for (const link of links) {
      const href = link.getAttribute('href') ?? ''
      const group = link.closest('[role="group"]')
      const holder = group ?? link.closest('li')
      expect(holder, `${href} is in nothing that says its terms`).not.toBeNull()
      expect(holder?.textContent, `${href} has no terms beside it`).toMatch(/not free/i)
      expect(holder?.textContent).toMatch(/paid in production/i)
      // And the terms are those of the module the link leads to: Health's page links Report,
      // and a link to Report heard as "Formancy Health, not free" names the wrong product.
      const name = moduleOf(href) ?? ''
      if (group !== null)
        expect(group.getAttribute('aria-label'), `${href}'s group is not named by its module's terms`).toBe(`${name}, not free, paid in production`)
      else expect(holder?.textContent, `${href}'s item does not name its module`).toContain(name)
    }
  })

  test("names HL7's marks only with HL7's sentence beside them", () => {
    // Read from the rendered page: a mark that reaches it by any sentence owes the line, and
    // the sentence is written out here rather than imported, so a change to it fails.
    render(<ProductPage product={product} />)

    const page = document.body.textContent ?? ''
    if (!/\b(HL7|FHIR)\b/.test(page)) return
    expect(page).toContain(
      'HL7, FHIR and the FHIR [FLAME DESIGN] are the registered trademarks of Health Level Seven International and their use does not constitute endorsement by HL7.',
    )
  })

  test('calls the module source-available, and says "open source" only to deny it', () => {
    // The modules are source-available, not open source (0179). The page says what
    // formancy is with "Apache-2.0", so the one phrase it may hold is the denial.
    render(<ProductPage product={product} />)

    const page = document.body.textContent ?? ''
    expect(page).toMatch(/source-available/i)
    const said = [...page.matchAll(/open[\s-]source/gi)].map((match) => page.slice(Math.max(0, match.index - 4), match.index + match[0].length))
    expect(said.length, 'the page says what it is not').toBeGreaterThan(0)
    expect(said.filter((phrase) => !/^not\s/i.test(phrase))).toEqual([])
  })

  test('draws its example as a figure that says what it shows, with nothing in it to operate', () => {
    // A picture of text cannot be selected, read aloud or kept true by anything here, and a
    // control in a drawing is a stop on the keyboard's way that does nothing (0242).
    render(<ProductPage product={product} />)

    const figure = screen.getByRole('region', { name: 'What it makes' }).querySelector('figure')
    expect(figure).not.toBeNull()
    expect(figure?.querySelector('figcaption')?.textContent).toMatch(/Drawn for this page after/)
    expect(figure?.querySelectorAll('img, svg, canvas, picture, iframe')).toHaveLength(0)
    expect(figure?.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0)
  })

  test('dates what it says about the module, since nothing here reads it again', () => {
    // What a module does and does not do was read from its repository, and its next release
    // can make it wrong with no gate here failing. Undated, a stale page would read as
    // current; dated, a reader can weigh it.
    render(<ProductPage product={product} />)

    for (const part of ['Status', 'What it does not do yet']) {
      expect(screen.getByRole('region', { name: part }).textContent, part).toContain('Read from the module’s repository on 25 November 2026.')
    }
    expect(within(screen.getByRole('region', { name: 'Status' })).getByText(product.release.version)).toBeTruthy()
  })

  test('marks every word in another language with that language', () => {
    // WCAG 3.1.2: a screen reader says an unmarked German word as English. Asked of every
    // piece of text the page renders, so a word added anywhere on it is held too.
    render(<ProductPage product={product} />)

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const unmarked: string[] = []
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      for (const [word, lang] of FOREIGN) {
        if (text.includes(word) && node.parentElement?.closest('[lang]')?.getAttribute('lang') !== lang) unmarked.push(`${word} (${lang})`)
      }
    }
    expect(unmarked).toEqual([])
  })

  test('ends on what a buyer does next: the demonstration, and a question about a production licence', () => {
    // A page that ended on the licence's table left a buyer to find the address in small
    // print. The last part offers the demonstration and the question together, beside the
    // terms, and the question arrives with the module named in its subject.
    render(<ProductPage product={product} />)

    const parts = within(screen.getByRole('main')).getAllByRole('region')
    const last = parts[parts.length - 1]
    if (last === undefined) throw new Error('the page has no parts')
    expect(last.getAttribute('aria-labelledby')).toBe('next-title')
    const group = within(last).getByRole('group', { name: `${product.name}, not free, paid in production` })
    const demo = product.ctas[0]
    expect(
      within(group)
        .getByRole('link', { name: demo?.label ?? '' })
        .getAttribute('href'),
    ).toBe(demo?.href)
    const ask = within(group).getByRole('link', { name: 'Ask about a production licence' }).getAttribute('href') ?? ''
    expect(ask.startsWith('mailto:info@formancy.ai?subject=')).toBe(true)
    expect(decodeURIComponent(ask.split('subject=')[1] ?? '')).toBe(`${product.name} production licence`)
  })

  test('is sent with its words in the HTML, rendered as the browser draws it', () => {
    /*
     * The page exists to be found, and a crawler that runs no script reads only what the
     * server sends. `prerender.mjs` writes the markup `render.tsx` renders for this page into
     * the root its `index.html` names; `build-web.mjs` reads the built page back. This holds
     * the two halves that are source: the root is the one the build looks for, and the markup
     * is the whole page.
     */
    const page = STATIC_PAGES.find((each) => each.page === `products/${product.page}`)
    if (page === undefined) throw new Error(`render.tsx renders no page products/${product.page}`)
    expect(page.root).toBe(`<div id="root" data-product="${product.page}"></div>`)
    expect(html).toContain(page.root)

    const sent = new DOMParser().parseFromString(renderPage(page), 'text/html')
    expect(sent.querySelectorAll('h1')).toHaveLength(1)
    expect(sent.querySelector('main')).not.toBeNull()
    expect(sent.body.textContent).toContain(product.name)
    expect(sent.body.textContent).toMatch(/Not free · paid in production/)
  })

  test('carries a head of its own, which fits a search result and says what the page says', () => {
    /*
     * Each page is found on its own, so each says its own title and description, and its
     * canonical, its Open Graph address and its structured data name it. The title and the
     * description are written once in the module's file and held here to the `index.html`,
     * whose head is what a search engine reads. 60 and 155 characters are what a result
     * shows before it cuts.
     */
    const head = new DOMParser().parseFromString(html, 'text/html')
    const meta = (selector: string): string => head.querySelector(selector)?.getAttribute('content') ?? ''
    const address = `https://formancy.ai/products/${product.page}/`

    expect(head.title).toBe(product.title)
    expect(product.title.length).toBeLessThanOrEqual(60)
    expect(meta('meta[name="description"]')).toBe(product.description)
    expect(product.description.length).toBeGreaterThanOrEqual(70)
    expect(product.description.length).toBeLessThanOrEqual(155)
    expect(head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(address)
    expect(meta('meta[property="og:url"]')).toBe(address)
    expect(meta('meta[property="og:title"]')).toBe(product.title)
    expect(meta('meta[name="robots"]')).toMatch(/^index/)
    expect(meta('meta[name="robots"]')).not.toMatch(/noindex/)

    const software = graphOf(html).find((node) => node['@type'] === 'SoftwareApplication')
    expect(software).toMatchObject({ name: product.name, url: address, softwareVersion: product.release.version, description: product.description })
    // Nothing the page does not say: no price, no offer, no rating.
    expect(Object.keys(software ?? {}).filter((key) => ['offers', 'aggregateRating', 'review'].includes(key))).toEqual([])
  })

  test('is shared as its own module’s card, described by the module, its terms and its promise', () => {
    /*
     * The site's card shows formancy, so a product page shared with it would show the free
     * thing under the paid module's title. Each page names its own card, the one
     * `product-og-card.tsx` draws at `?og` on it, at the page's own address and at the size
     * it is drawn at, and asks for it large. Its description is read alone, by somebody who
     * cannot see the card, so it says what the card says: the module and its terms, which
     * the card shows beside its name (0179), and the promise the page's heading makes, read
     * here from that heading, so a rewrite of one without the other fails. That the file is
     * there, and that size, is `apps/docs/src/counts.test.ts`'s to hold.
     */
    const head = new DOMParser().parseFromString(html, 'text/html')
    const meta = (selector: string): string => head.querySelector(selector)?.getAttribute('content') ?? ''
    const image = `https://formancy.ai/products/${product.page}/og.png`

    expect(meta('meta[property="og:image"]')).toBe(image)
    expect(meta('meta[name="twitter:image"]')).toBe(image)
    expect([meta('meta[property="og:image:width"]'), meta('meta[property="og:image:height"]')]).toEqual(['1200', '630'])
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image')

    const alt = meta('meta[property="og:image:alt"]')
    expect(alt.startsWith(`${product.name}, not free, paid in production: ${wordsOf(product.h1)}.`), alt).toBe(true)
    expect(meta('meta[name="twitter:image:alt"]')).toBe(alt)
  })

  test('is placed under formancy.ai by a breadcrumb its page names', () => {
    // A search result can show where a page is on its site as a trail. One that skipped the
    // site, named another page, or that the page's own node did not point at would show a
    // trail to somewhere the page is not, or none at all.
    const address = `https://formancy.ai/products/${product.page}/`
    const graph = graphOf(html)
    const page = graph.find((node) => node['@type'] === 'WebPage')
    const trail = graph.find((node) => node['@type'] === 'BreadcrumbList')

    expect(trail?.['@id']).toBe(`${address}#breadcrumb`)
    expect(page?.['breadcrumb']).toEqual({ '@id': `${address}#breadcrumb` })
    expect(trail?.['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'formancy.ai', item: 'https://formancy.ai/' },
      { '@type': 'ListItem', position: 2, name: product.name, item: address },
    ])
  })
})

/** Each product page's `index.html`, by its path from here. */
const PRODUCT_HEADS = import.meta.glob<string>('../products/*/index.html', { query: '?raw', import: 'default', eager: true })

describe('the landing page’s head', () => {
  test('names each paid module by the @id, address, name and description its product page gives it, and no other', () => {
    /*
     * The landing page shows the modules (0242), and its structured data names each with a
     * node. A node with the @id a product page gives its SoftwareApplication is that same
     * thing, so it has to agree with the product page, or a search engine is told two
     * different things about one module. So the @id, the address, the name and the
     * description are read from each product page's head, for every module in
     * `paid-modules.json`, the list the footer and the sitemaps are read from: a module left
     * out, one the list does not have, and an @id or address its product page does not name
     * all fail.
     */
    const named = graphOf(landingHtml).filter((node) => node['@type'] === 'SoftwareApplication')

    const expected = PAID_MODULES.map((module) => {
      const html = PRODUCT_HEADS[`..${module.product}index.html`]
      if (html === undefined) throw new Error(`${module.name}'s product page, ${module.product}, has no index.html beside the others`)
      const software = graphOf(html).find((node) => node['@type'] === 'SoftwareApplication')
      expect(software?.['url'], module.name).toBe(`https://formancy.ai${module.product}`)
      return {
        '@type': 'SoftwareApplication',
        '@id': software?.['@id'],
        name: software?.['name'],
        url: software?.['url'],
        description: software?.['description'],
      }
    })
    // A guard on the guard: an @id read as undefined on both sides would agree.
    expect(expected.map((node) => node['@id'])).toEqual(PAID_MODULES.map((module) => `https://formancy.ai${module.product}#software`))
    expect(named).toEqual(expected)
  })

  test('leads with the engine, says the modules it names are paid, and fits a search result', () => {
    /*
     * The page is formancy's, which is free. A description that put the modules first, or
     * named them beside the engine without saying they are paid, would sell the free thing
     * as the paid one, or the paid ones as free (0179). So each of the three says the
     * engine's phrase first and "Paid modules" after it; the search result's within the 160
     * characters a result shows, and X's within the 200 it takes.
     */
    const head = new DOMParser().parseFromString(landingHtml, 'text/html')
    const meta = (selector: string): string => head.querySelector(selector)?.getAttribute('content') ?? ''
    const descriptions = {
      description: meta('meta[name="description"]'),
      'og:description': meta('meta[property="og:description"]'),
      'twitter:description': meta('meta[name="twitter:description"]'),
    }

    for (const [name, text] of Object.entries(descriptions)) {
      const engine = text.toLowerCase().indexOf('visual form builder for angular and react')
      expect(engine, `${name} does not lead with the engine`).toBeGreaterThan(-1)
      expect(engine, `${name} does not lead with the engine`).toBeLessThan(20)
      expect(text.indexOf('Paid modules'), `${name} does not say the modules are paid, after the engine`).toBeGreaterThan(engine)
    }
    expect(descriptions.description.length).toBeLessThanOrEqual(160)
    expect(descriptions['twitter:description'].length).toBeLessThanOrEqual(200)
  })
})

describe('Formancy Report’s page', () => {
  test('leaves the QR-bill’s code undrawn, so nothing on it can be scanned', () => {
    // As on the landing page's card: a payment code that looked scannable would be one
    // somebody could pay. The place holds the Swiss cross alone, and no character.
    render(<ProductPage product={PRODUCTS.report} />)

    const places = document.querySelectorAll('#makes .mx-code-square')
    expect(places).toHaveLength(1)
    const [place] = places
    expect([...(place?.children ?? [])].map((child) => child.className)).toEqual(['mx-cross'])
    expect(place?.firstElementChild?.children).toHaveLength(0)
    expect(place?.textContent).toBe('')
  })
})

describe('longDate', () => {
  test('writes a day as the page says it, the same in the build as in any browser', () => {
    // A locale's own formatting would differ between Node and a visitor's browser, and the
    // page drawn over the HTML the build sent would then disagree with it.
    expect(longDate('2026-11-22')).toBe('22 November 2026')
    expect(longDate('2026-01-05')).toBe('5 January 2026')
    expect(() => longDate('2026-13-01')).toThrow(/YYYY-MM-DD/)
  })
})
