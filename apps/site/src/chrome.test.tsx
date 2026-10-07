import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { App } from './app.js'
import { SiteBar, SiteFooter } from './chrome.js'
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

const navigation = (): string[] =>
  [...screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a')].map((link) =>
    (link.textContent ?? '').trim(),
  )

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

    const current = navigation().filter((_, at) =>
      [...screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a')][at]?.getAttribute(
        'aria-current',
      ) === 'page',
    )
    expect(current).toEqual(['Templates'])
  })

  test('and on the landing page nothing is marked, because no entry is the landing page', () => {
    /*
     * Deliberate, and worth pinning: the wordmark is the way home, and marking
     * one of the section anchors as the current page would be a claim that
     * changes as somebody scrolls.
     */
    render(<SiteBar current="home" />)

    expect(
      screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('[aria-current]'),
    ).toHaveLength(0)
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

    expect(home.length, 'the bar has almost no links').toBeGreaterThan(3)
    expect(templates, 'the two pages carry different navigation').toEqual(home)
  })

  test('and the gallery wears the site\'s header rather than one of its own', () => {
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
    expect(text, 'the footer names a version the workspace is not on').toContain(
      `packages ${__PACKAGE_VERSION__}`,
    )
    expect(text).toContain('Apache-2.0')
  })
})
