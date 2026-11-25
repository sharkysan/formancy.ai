import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { CURRENT_SPEC_VERSION } from '@formancy/spec'
import { AngularBuilderPage } from './angular-builder-page.js'
import { App } from './app.js'
import { SiteBar, SiteFooter } from './chrome.js'
import { ProductPage } from './product-page.js'
import { PRODUCTS } from './products/all.js'
import { TemplateGallery } from './template-gallery.js'

/**
 * The chrome both pages are hung in, and the one thing a type cannot hold.
 *
 * The templates gallery shipped with its own header, its own brand mark, its own
 * navigation and its own footer, inside a site that already had all four
 * ([0106](../../../docs/decisions/0106-one-shell-for-every-page-of-the-site.md)).
 * The browser gate compares what the two pages are *drawn in* — the ground, the
 * families, the bar — because none of that exists in jsdom.
 *
 * What is left for here is the markup, and one fact about it that the gate
 * cannot see cheaply: a bar link to a section of the landing page has to carry
 * the page it belongs to, or from anywhere else it scrolls nowhere. That is a
 * dead link that looks like a working one.
 */
const stubObserver = (): void => {
  // The landing page notices which sections have been read, and jsdom has no
  // `IntersectionObserver`. Inert on purpose: the journey is `site.test.tsx`'s
  // subject, and this file is about the bar and the footer.
  class FakeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver)
}

const navigation = (): string[] => [...screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a')].map((link) => (link.textContent ?? '').trim())

afterEach(cleanup)

describe('the bar', () => {
  test('qualifies a section anchor on every page but the one it belongs to', () => {
    /*
     * The failure this prevents: `href="#engine"` on `/templates/` is a link to
     * a section of a different document. The browser follows it, the page does
     * not move, and nothing anywhere reports a problem — which is why the
     * gallery's own navigation had simply left those four entries out rather
     * than get them wrong.
     */
    render(<SiteBar current="templates" />)
    const away = screen.getByRole('link', { name: 'How it works' })
    expect(away.getAttribute('href'), 'an anchor on another page goes nowhere').toBe('/#engine')

    cleanup()
    render(<SiteBar current="home" />)
    // And on the page it belongs to it stays an anchor, because `/#engine` there
    // is a navigation rather than a scroll.
    expect(screen.getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#engine')
  })

  test('marks the page you are on, and only that one', () => {
    // Without it the bar is the one place a visitor checks whether the link they
    // clicked did anything, saying nothing.
    render(<SiteBar current="templates" />)

    const current = navigation().filter(
      (_, at) => [...screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a')][at]?.getAttribute('aria-current') === 'page',
    )
    expect(current).toEqual(['Templates'])
  })

  test('on a product page, marks "Paid modules" as the section it is in, and claims no link is the page itself', () => {
    /*
     * The bar's "Paid modules" goes to the landing page's section, not to the product page
     * (0242). Marked `page` there it would tell somebody they are on the page that link
     * opens, which they are not; marked as the current item of the set, it says where on
     * the site they are, and it is underlined as the current page's entry is.
     */
    for (const page of ['data', 'report', 'health'] as const) {
      render(<SiteBar current={page} />)
      const nav = screen.getByRole('navigation', { name: 'Main' })
      const modules = within(nav).getByRole('link', { name: 'Paid modules' })
      expect(modules.getAttribute('aria-current'), page).toBe('true')
      expect(modules.getAttribute('href'), 'an anchor on another page goes nowhere').toBe('/#modules')
      expect(nav.querySelectorAll('[aria-current="page"]'), page).toHaveLength(0)
      cleanup()
    }
  })

  test('names no module, and says in its own words that what it leads to is paid', () => {
    /*
     * 0241 kept the modules out of the bar because a module's name there would stand
     * without its terms. The one bar link to them names none of them, and its words are
     * the terms' gist, so it cannot be read as part of the free offer.
     */
    render(<SiteBar current="home" />)

    const links = [...screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a')]
    expect(links.filter((link) => /Formancy (Data|Report|Health)/.test(link.textContent ?? ''))).toEqual([])
    const modules = links.find((link) => link.getAttribute('href') === '#modules')
    expect(modules?.textContent).toMatch(/paid/i)
  })

  test('and on the landing page nothing is marked, because no entry is the landing page', () => {
    /*
     * Deliberate, and worth pinning: the wordmark is the way home, and marking
     * one of the section anchors as the current page would be a claim that
     * changes as somebody scrolls.
     */
    render(<SiteBar current="home" />)

    expect(screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('[aria-current]')).toHaveLength(0)
  })
})

describe('both pages', () => {
  test('carry the same navigation, so adding a page cannot miss one', () => {
    /*
     * The structural half of 0106. The browser gate asserts this too, against
     * the built site; this asserts it against the components, which is where
     * somebody would reintroduce a second copy — and it runs without a browser.
     *
     * Compared between the two rather than against a list written here: a
     * literal would need editing every time the site gains a page, and the
     * thing that must not happen is that the two disagree.
     */
    stubObserver()
    render(<App />)
    const home = navigation()
    cleanup()

    render(<TemplateGallery />)
    const templates = navigation()
    cleanup()

    // And the product pages, which are drawn in the same shell (0242).
    render(<ProductPage product={PRODUCTS.report} />)
    const product = navigation()

    expect(home.length, 'the bar has almost no links').toBeGreaterThan(3)
    expect(templates, 'the two pages carry different navigation').toEqual(home)
    expect(product, 'a product page carries navigation of its own').toEqual(home)
  })

  test("and the gallery wears the site's header rather than one of its own", () => {
    // The specific regression: `.template-header`, `.template-brand` and
    // `.template-footer` were a second set of chrome. Asserted as their absence,
    // because a page can perfectly well render both and look nearly right.
    const { container } = render(<TemplateGallery />)

    expect(container.querySelector('.template-header'), 'a second header is back').toBeNull()
    expect(container.querySelector('.template-footer'), 'a second footer is back').toBeNull()
    expect(container.querySelectorAll('svg.mark'), 'the shared mark is missing').toHaveLength(1)
  })
})

describe('the footer', () => {
  test('states the version the workspace is actually on, not a version shaped like one', () => {
    /*
     * The first thing an integrator compares against what they have installed,
     * and the kind of number CLAUDE.md requires to be derived rather than typed.
     *
     * Compared to `__PACKAGE_VERSION__`, **not** to `/packages \d+\.\d+\.\d+/`.
     * That pattern is the trap this repository has fallen into seven times: it
     * matches the shape the thing usually has, so a literal `0.1.0` left behind
     * after a release satisfies it completely.
     *
     * The constant is not a circular comparison: `vitest.config.ts` computes it
     * with the same `packageVersion()` the build uses, reading the root
     * manifest, so a literal typed into the footer disagrees with it at once.
     * Reading `package.json` here directly would be the more obvious test and
     * cannot be written — this app has no `@types/node` on purpose, which is
     * the layer boundary holding in the place it was meant to
     * ([0008](../../../docs/decisions/0008-layered-packages.md)).
     */
    render(<SiteFooter />)

    const text = screen.getByRole('contentinfo').textContent ?? ''
    expect(text, 'the footer names a version the workspace is not on').toContain(`packages ${__PACKAGE_VERSION__}`)
    expect(text).toContain('Apache-2.0')
  })

  test('and the spec version the packages write, which was typed and stayed at 2', () => {
    // The footer said "Spec version 2" through spec 3 and into 4: a literal, in the one
    // line an integrator reads to see which documents these packages produce.
    render(<SiteFooter />)

    expect(screen.getByRole('contentinfo').textContent).toContain(`Spec version ${CURRENT_SPEC_VERSION}`)
  })

  test('links each paid module by its name from every page, with its terms beside the link', () => {
    /*
     * The failure this prevents: the licence section of the landing page was the one
     * place the site linked Formancy Data, Formancy Report and Formancy Health, so a
     * visitor who arrived on the templates page or the Angular page, and a search engine
     * following that page's links, found no way to them, though all three are served
     * under formancy.ai (0241). Every page is rendered, not the footer alone, since a page
     * that drew a footer of its own would drop the links without failing a test of the
     * component.
     *
     * Beside a footer that opens with "Apache-2.0", a bare name reads as part of the free
     * offer, so the item holding each link says the module's terms (0179). The addresses
     * are written here rather than read from `paid-modules.json`, or a wrong one there
     * would pass. Each is the module's product page on this site, which links the pages
     * its own repository serves (0242); before those pages, Report's was its English
     * product page and not its Studio at `/report/`, which that module keeps out of search.
     * The product pages carry the footer too, so they are rendered as well.
     */
    const expected = [
      ['Formancy Data', '/products/data/'],
      ['Formancy Report', '/products/report/'],
      ['Formancy Health', '/products/health/'],
    ] as const
    stubObserver()

    for (const [page, element] of [
      ['the landing page', <App key="home" />],
      ['the templates page', <TemplateGallery key="templates" />],
      ['the Angular page', <AngularBuilderPage key="angular" />],
      ['the Formancy Data page', <ProductPage key="data" product={PRODUCTS.data} />],
      ['the Formancy Report page', <ProductPage key="report" product={PRODUCTS.report} />],
      ['the Formancy Health page', <ProductPage key="health" product={PRODUCTS.health} />],
    ] as const) {
      render(element)
      const footer = within(screen.getByRole('contentinfo'))

      for (const [name, href] of expected) {
        const link = footer.getByRole('link', { name })
        expect(link.getAttribute('href'), `${page} links ${name} somewhere else`).toBe(href)
        const item = link.closest('li')?.textContent ?? ''
        expect(item, `${page} links ${name} with no terms beside it`).toMatch(/not free/i)
        expect(item).toMatch(/paid in production/i)
      }
      cleanup()
    }
  })
})
