import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act } from '@testing-library/react'
import type { Root } from 'react-dom/client'
import { mount } from './mount.js'
import { STATIC_PAGES, renderPage } from './render.js'

/**
 * The pages the build sends as static HTML (0242, 0243), taken over as the browser takes
 * them over: the markup `prerender.mjs` writes into the root, hydrated by `mount` with the
 * page `render.tsx` renders.
 *
 * The markup is rendered as Node renders it in the build, with none of the browser's globals
 * there, and hydrated where each of them answers: a media query that matches whatever it
 * asks, observers that observe nothing. So a page that asks for the window, the document,
 * the address, a media query, storage or an observer while rendering draws something else
 * here than in the browser, as it would in the build. It is rendered on another day, in
 * another year and in another time zone than it is hydrated in, so a render that reads the
 * clock, even only for its year, or writes a fixed instant in local time, does too. It is
 * hydrated in React's development build, which says every difference, an attribute's
 * included; the production build the site ships says none of an attribute's and leaves it as
 * the server wrote it. Also found here: a random number, or a count kept outside React. What
 * differs between Node and a browser for another reason, a number formatted by another ICU
 * or in the visitor's language, is the browser gate's to find in the page's text, against
 * the build (`scripts/static-pages-browser-test.mjs`); in an attribute, nothing finds it
 * (§11).
 */
// jsdom has neither observer; the landing page's journey starts an IntersectionObserver in an effect.
class Unobserving {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** A media query that matches whatever it asks: Node, rendering the build, has none to ask. */
const matching = (query: string): MediaQueryList =>
  Object.assign(new EventTarget(), {
    matches: true,
    media: query,
    onchange: null,
    addListener(): void {},
    removeListener(): void {},
  })

/** The browser's answer to each of `BROWSER_ONLY` that jsdom does not have, for the hydration. */
function stubBrowser(): void {
  vi.stubGlobal('IntersectionObserver', Unobserving)
  vi.stubGlobal('ResizeObserver', Unobserving)
  vi.stubGlobal('matchMedia', matching)
}

beforeEach(stubBrowser)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/**
 * What a render could reach for that Node, rendering the build, has not, or has otherwise:
 * Node's own `navigator` names Node, not the visitor's browser or language.
 */
const BROWSER_ONLY = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'matchMedia',
  'IntersectionObserver',
  'ResizeObserver',
  'requestAnimationFrame',
]

/**
 * When and where the page is rendered, as far as it can tell: a day and a year that are not
 * the test's, and a zone eleven hours behind UTC, where an instant at midnight UTC is still
 * the day before, as it is for a visitor in the Americas and not on a build machine in UTC.
 */
const RENDERED_AT = new Date('2001-02-03T04:05:06Z')
const RENDERED_IN = 'Pacific/Pago_Pago'

/** A page's markup as the build makes it, with none of those globals there, at another time and in another zone. */
function renderedAsInNode(page: (typeof STATIC_PAGES)[number]): string {
  // Node keeps the zone it was last told when `TZ` is deleted, so the one it had is named back,
  // and is still its zone once `unstubAllEnvs` has deleted `TZ` again.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  for (const name of BROWSER_ONLY) vi.stubGlobal(name, undefined)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(RENDERED_AT)
  vi.stubEnv('TZ', RENDERED_IN)
  try {
    return renderPage(page)
  } finally {
    vi.stubEnv('TZ', zone)
    vi.useRealTimers()
    vi.unstubAllGlobals()
    stubBrowser()
  }
}

describe.each(STATIC_PAGES.map((page) => [page.page === '' ? 'the landing page' : `/${page.page}/`, page] as const))('%s', (_, page) => {
  test('is taken over as it was sent: every element the server sent stays, and React says nothing', async () => {
    /*
     * React keeps the server's elements when its first render agrees with them, and when it
     * does not, it throws them away and draws its own, saying so as an error. So both are
     * asked: whether any element sent is gone, and whether anything was said.
     */
    const markup = renderedAsInNode(page)
    const root = document.createElement('div')
    root.id = 'root'
    root.append(...new DOMParser().parseFromString(markup, 'text/html').body.childNodes)
    document.body.append(root)
    const sent = [...root.querySelectorAll('*')]

    const said: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...words: unknown[]) => {
      said.push(words.map(String).join(' ').slice(0, 300))
    })
    const heard = (event: ErrorEvent): void => {
      said.push(String(event.message).slice(0, 300))
    }
    window.addEventListener('error', heard)

    let drawn: Root | undefined
    try {
      await act(async () => {
        drawn = mount(root, page.element())
        await Promise.resolve()
      })

      expect(said, 'what React said while taking the page over').toEqual([])
      expect(sent.length, 'the page sent no markup to take over').toBeGreaterThan(10)
      expect(
        sent.filter((element) => !element.isConnected).map((element) => element.tagName),
        'elements the server sent that React replaced',
      ).toEqual([])
      expect(root.querySelector('main')).toBe(sent.find((element) => element.tagName === 'MAIN'))
    } finally {
      window.removeEventListener('error', heard)
      act(() => drawn?.unmount())
      root.remove()
    }
  })
})
