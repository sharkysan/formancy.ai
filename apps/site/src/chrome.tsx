import type { ReactElement } from 'react'
import { CURRENT_SPEC_VERSION } from '@formancy/spec'
import './shell.css'

/**
 * The chrome both pages of formancy.ai are hung in.
 *
 * The site grew a second page — the templates gallery — and that page wrote its
 * own header, its own brand mark, its own navigation and its own footer. Not
 * merely different: the mark was a letter set in Georgia inside a rounded
 * square, where the site's mark is the favicon, a violet stem and teal arms
 * saying the same thing the whole page says about the browser and the server.
 *
 * Copying the markup across would have made them agree once. This makes them
 * unable to disagree, which is the question CLAUDE.md asks of any duplication:
 * if these two ever diverge, would anybody find out? The matching half is
 * `shell.css`.
 *
 * The navigation is one list, and a page names itself rather than restating the
 * list — so adding a page to the site adds it to every page's navigation, and
 * the one place it could be forgotten no longer exists.
 */

export const REPO = 'https://github.com/sharkysan/formancy.ai'

/*
 * The playground is a separate Vite app on its own port in development and a
 * sibling directory in the build. Written with the trailing slash: whether
 * `/playground` resolves to `/playground/index.html` depends on the static
 * host, and asking for the address we actually mean removes the host from the
 * question.
 */
export const PLAYGROUND = import.meta.env.DEV ? 'http://localhost:4381/' : '/playground/'

/** Where a page can be, for the entry that marks itself as current. */
export type Page = 'home' | 'templates' | 'angular'

/**
 * The light behind every page.
 *
 * Three washes drifting, a grid that fades out below the fold, and a grain so
 * the gradients do not band. Shared rather than left on the landing page,
 * because the bar and the cards are drawn against it: on a flat `--ground` the
 * same borders and the same glass read as a different, cheaper page.
 *
 * Everything in it animates `transform` and `opacity` only, off the
 * compositor, and `prefers-reduced-motion` stops all of it in CSS rather than
 * in script — a preference honoured by JavaScript is honoured only once the
 * JavaScript has arrived.
 */
export function Backdrop(): ReactElement {
  return (
    <div className="backdrop" aria-hidden="true">
      <i className="aurora a1" />
      <i className="aurora a2" />
      <i className="aurora a3" />
      <i className="grid" />
      <i className="grain" />
    </div>
  )
}

/**
 * The mark, which is also the favicon.
 *
 * Violet stem, teal arms — the browser and the server, the same pair the whole
 * site is about. The colours come from `--client` and `--server` in the
 * stylesheet rather than from attributes here, so a theme change reaches it.
 */
export function Mark(): ReactElement {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="var(--inset)" />
      <rect className="stem" x="14" y="14" width="12" height="36" rx="6" />
      <rect className="arm" x="30" y="14" width="20" height="12" rx="6" />
      <rect className="arm" x="30" y="30" width="14" height="12" rx="6" />
    </svg>
  )
}

/*
 * The links in the bar, in reading order.
 *
 * `optional` is the class the stylesheet hides below 50rem, so the bar keeps
 * the wordmark and the two things somebody came for at 320px. The anchors are
 * the landing page's sections, so from anywhere else they have to be qualified
 * with `/` — a bare `#engine` on `/templates/` scrolls that page to nowhere,
 * which is the kind of link that looks like it works.
 */
const LINKS = [
  { href: '#engine', label: 'How it works', optional: true },
  { href: '#build', label: 'Examples', optional: true },
  { href: '/templates/', label: 'Templates', page: 'templates' as Page, optional: true },
  { href: '/angular-form-builder/', label: 'Angular', page: 'angular' as Page, optional: true },
  { href: '#run', label: 'Run it', optional: true },
  { href: PLAYGROUND, label: 'Playground' },
]

/**
 * The bar, sticky at the top of every page.
 *
 * `current` is the page asking, not a path read from the location: the page
 * knows what it is, and reading `window.location` would make the marker wrong
 * under server rendering and right only after hydration.
 */
export function SiteBar({ current }: { current: Page }): ReactElement {
  return (
    <header className="bar">
      <strong>
        <a href="/" aria-label="formancy.ai home">
          <Mark />
          formancy.ai
        </a>
      </strong>
      <nav aria-label="Main">
        {LINKS.map((link) => (
          <a
            key={link.href}
            className={link.optional === true ? 'optional' : undefined}
            // An anchor is a destination on the landing page. From anywhere else
            // it has to carry the page it belongs to or it goes nowhere.
            href={link.href.startsWith('#') && current !== 'home' ? `/${link.href}` : link.href}
            aria-current={link.page === current ? 'page' : undefined}
          >
            {link.label}
          </a>
        ))}
        <a className="bar-cta" href={REPO} rel="noreferrer noopener">
          GitHub
        </a>
      </nav>
      <div className="rail" aria-hidden="true" />
    </header>
  )
}

/**
 * The footer, which says what somebody needs to check the claim above it.
 *
 * The versions are read rather than typed, for the reason the landing page
 * derives its counts: a number written into prose goes stale, and these are the
 * first thing an integrator compares against what they have installed. The spec
 * version was typed, and said 2 for two versions after the spec reached 4.
 */
export function SiteFooter(): ReactElement {
  return (
    <footer>
      <span>Apache-2.0</span>
      <a href={REPO} rel="noreferrer noopener">
        Source
      </a>
      <a href="/docs">Documentation</a>
      <span className="spacer">{`Spec version ${CURRENT_SPEC_VERSION} · packages ${__PACKAGE_VERSION__}, beta`}</span>
    </footer>
  )
}
