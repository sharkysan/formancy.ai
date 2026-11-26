# 0243 — Every page of the site's own build is sent as static HTML, and the browser takes it over as it was sent

- **Status:** accepted
- **Date:** 2026-11-26
- **Extends:** [0242](0242-each-paid-module-has-a-product-page-sent-as-static-html-and-the-landing-page-shows-what-each-makes.md),
  whose prerender step for the product pages now renders the landing page, the templates gallery
  and the Angular page too, and which named those three as debt
- **Deciders:** Daniel Bacher
- **Verified by:** each watched failing on 2026-11-26, its fault planted once and the file put back
  byte for byte:
  - **`pnpm build:web`** (`scripts/build-web.mjs`): every page of the site's own build, the
    landing page, `/templates/`, `/angular-form-builder/` and the three product pages, holds
    `<main>` and one `<h1>` in its root, and no element in it carries a `style` attribute. Failed
    with the landing page taken out of `STATIC_PAGES` in `apps/site/src/render.tsx`:
    `index.html was built with no page in its root`; and with the submission's meter rendered in
    the landing page's first state: `index.html was built with a style attribute on <i>`.
  - **`apps/site/src/render.test.tsx`**, in `pnpm test`: each page in `STATIC_PAGES` is rendered
    as the build renders it in Node, with the browser's globals hidden, under a clock set to
    2001 and in a zone eleven hours behind UTC; written into a root; and taken over by `mount` in
    React's development build, under the real clock and zone, with a media query that matches
    whatever it asks and observers that observe nothing; nothing is said, no element sent is
    replaced, and the `<main>` is the one sent. Failed with one of the landing page's readings
    rendered from `Math.random()` and with one rendered from `typeof window`
    (`what React said while taking the page over: expected [ …(2) ] to deeply equal []`), and with
    the hero's note given another class when there is a window, which changes an attribute and no
    text (React: `A tree hydrated but some attributes of the server rendered HTML didn't match the
    client properties. This won't be patched up.`); and with the note given words when a guarded
    `matchMedia('(prefers-reduced-motion: reduce)')` matches, an attribute when there is a
    `ResizeObserver`, the clock's year, and the day of the month of a fixed instant at midnight
    UTC in local time.
  - **`pnpm test:browser`** (`scripts/static-pages-browser-test.mjs`): each page the built site
    holds rendered into its root, read from the build, the landing page and each product page
    among them, holds its page in its root as served; the elements at the top of the root that
    React owns once it owns all of them, and the `<main>`, are the ones the browser parsed from
    the response; nothing was thrown or logged as an error; on the landing page a tab of the
    examples changes the example, and reading to the end lands the receipt's stamp and the panel
    says "sent"; and `?og` on the landing page and on each product page draws `#og-card` in the
    page's place. Run alone against a site built with the reading from `typeof window`, it failed
    on the landing page with `the elements on the page are not the ones the server sent: React
    drew the page again` and `Minified React error #418`.

  Besides, `scripts/product-pages-browser-test.mjs` now counts an error logged on the landing page
  at each of its widths, as it did on the product pages; that was not planted on its own.

## Context

[0242](0242-each-paid-module-has-a-product-page-sent-as-static-html-and-the-landing-page-shows-what-each-makes.md)
added a step to the site's build that renders the paid modules' product pages to static HTML,
and left every other page of the build as it was: a `<div id="root">` a script draws into. It
named the landing page, the templates gallery and the Angular page as debt, and gave the reason
it stopped there: the landing page renders live forms through the engine, a studio in its hero
and a journey that reacts to scrolling, and rendering those on the server is a change of its own,
with tests of its own.

So a crawler, or a chat app drawing a link's preview, that runs no script read the landing page's
head and nothing else: not its argument, not the section on the paid modules 0242 had just added,
whose every link carries the module's terms, and not its footer, whose links to the modules
reached such a reader through the sitemaps alone
([0241](0241-the-sitemaps-name-the-paid-modules-pages-and-every-pages-footer-links-them.md)). The
templates gallery sent one `<noscript>` line and no template, and the Angular page one line and
none of its code.

## Decision

**The one render module lists every page of the site's own build.** `src/render.tsx`, which was
`src/product-render.tsx`, holds `STATIC_PAGES`: each page's directory under `dist`, the empty root
its `index.html` writes, and the element its entry draws. `pnpm build` runs
`vite build --ssr src/render.tsx --outDir dist/.prerender` after `vite build` and then
`prerender.mjs`, as 0242 decided, which now writes every page's markup into its root, refuses a
page whose root it cannot find or finds twice, and removes the module. No second mechanism, no
plugin and no dependency.

**Every entry takes its markup over through one function**, `mount` in `src/mount.tsx`:
`hydrateRoot` when the root holds the page the build wrote, `createRoot` when it is empty, as on
the development server. The tree is the one `renderPage` renders, `<StrictMode>` around the page,
so the browser's first render is the server's. `?og`, on the landing page and on a product page,
draws the share card with `replace`, which empties the root of the page first.

**Rendering is a function of the page alone.** Nothing on these pages reads the window, the
document, the address, a media query, storage, the clipboard, an observer or the clock while it
renders: the journey starts its `IntersectionObserver` in an effect, the finale's stamp waits for
it, the bar is told which page it is on rather than reading the location, and the entries read
`?og` before anything renders. That was already true, and no component had to change for it;
nothing is marked `suppressHydrationWarning`. The live forms render their first state, with nothing
typed, by the same engine in Node as in the browser, which it was built to be
([0008](0008-layered-packages.md)): the hero's studio, the conference ticket's example with its
rules and source beside it, the readings, and the finale's receipt with no answer in it but where
it was read.

**A reader without script is told what needs it.** The landing page's `<noscript>` says that the
page can be read without the script but that its forms do not respond and the submission at its
end stays empty; the templates gallery's says that previewing, searching and filtering need the
script and that each card's download link does not.

**A page's first render carries no style attribute.** The site's pages are served under a policy
that admits none ([0234](0234-the-website-is-served-under-a-policy-for-each-section.md)), so a
style written into the markup is refused as the browser parses the page, and React, taking the
page over, does not write it again until it changes; drawn by script, the same style was set
through the CSSOM, which the policy allows. A style a page needs from its first state is a class.
Today the one style the pages' markup could carry, the submission's meter's, renders nothing in
the first state, and the share card's is drawn by script alone.

**The build and the browser gate hold both halves.** `build-web.mjs` refuses a page of the build
whose root holds no page, or whose markup carries a style attribute. The browser gate fails a
page the browser drew again instead of taking it over, which is what React does when its first
render's text or elements differ from the markup, and which a production build says only as a
minified error number; and `render.test.tsx` renders each page as Node renders it, at another
time and in another zone, and hydrates it in React's development build, which names any
difference, an attribute's among them.

## Consequences

**What it buys.** A crawler or a link preview that runs no script reads the landing page's
argument, its examples' documents and rules, the paid modules' section with each module's terms
beside its links, the licence section and the footer; every template's card, with its title, its
description and its download link, which works without the script; and the Angular page's install
command and code. The sitemaps are no longer the only way such a reader finds the modules' pages.
A visitor whose script fails or is blocked reads the page rather than an empty screen.

**What it costs.** Each page is sent with its markup as well as the script that draws it, measured
on the build of 2026-11-26, gzipped by Node's zlib at level 9: the landing page's `index.html`
went from 6,343 bytes with an empty root to 47,906 (1,975 to 12,316 gzipped), the templates
gallery's from 3,331 to 26,168 (1,246 to 4,705) and the Angular page's from 2,871 to 10,551 (1,012
to 3,648). The script is the same size and does the same work, since hydrating builds what drawing
built; nothing here measures whether the page is ready sooner or later than before. The module
the build renders with is 1,454.28 kB as Vite reports it, built and removed on every build.

Until the script has run, the page is words and controls that do nothing a native control would
not: a tab, a theme or the studio's button does not answer, and a rule does not run. What React
does with a value typed into a form before it has taken the form over is not tested here.

React's production build does not correct an attribute that differs between the server's markup
and its first render, and does not report it: the element keeps the server's attribute.
`render.test.tsx` finds one that comes of a browser global, a media query and an observer among
them, of the clock, even read only for its year, of the time zone, or of a random number; one that
comes of something else Node and a browser do differently, a number formatted by another version
of ICU or in the visitor's language, in an attribute, would be sent and kept, and nothing here
would notice. A difference in text is found by the browser gate, which reads React's own property
on the elements it owns to know that it has taken the page over, because nothing public says
hydration has finished. A React release that renamed it would fail the check, saying React never
took the page over: a false failure, not a false pass.

The finale tells a reader without script that they have been filling in a form, beside an empty
receipt; the `<noscript>` line under the page says otherwise, and comes after it. And such a
reader meets the outline a browser always drew: the heading on the hero's paper, "Make it your
next great event.", is the first `<h2>` after the page's own. It is left so, since an `<h3>` there
would skip a level.

**What it forecloses.** A page of the site's own build sent with an empty root; a page that reads
the browser while it renders, or draws itself with `createRoot` over the markup it was sent; a
style attribute in a page's first render; a second way of prerendering beside `prerender.mjs`; and
`suppressHydrationWarning` used to quiet a difference rather than remove it.

## Alternatives considered

**The landing page left drawn by script, its words in its head.** Rejected. A description has 160
characters, and the page's argument, its modules' terms and its links do not fit in it.

**Only the landing page's static sections rendered, the live forms drawn in the browser into
places left for them.** Rejected. It is two renderings of one page, joined at holes nobody would
see go wrong, and the forms are what the page argues with; their first state is real, so it is
sent.

**The markup sent, and drawn again with `createRoot`.** Rejected. The page would be drawn twice,
a crawler would read one page and a visitor see another, and it is the fault the browser gate's
check of the elements it was sent exists to refuse.

**A framework or a static site generator, or a Vite plugin to prerender.** Rejected, as 0242
rejected them: a dependency the SOUP declaration would name and a build nobody here has read, for
what one documented command and a short script already do.

**Rendering at request time, in a Worker.** Rejected. formancy.ai is static files on Cloudflare
under headers the build writes ([0234](0234-the-website-is-served-under-a-policy-for-each-section.md)),
and a page that changes only when the site is built does not need code run for every request.

**The templates gallery and the Angular page left as debt.** Not chosen: the same mechanism took a
line each in `render.tsx` and a change to each entry, and nothing on either renders anything but
its first state.

**A browser check on what React logs, alone.** Rejected. In production React reports a text
difference only as a minified error and an attribute difference not at all; the comparison of the
elements sent and the development build's test are what do not depend on what React chooses to say.

**A browser check comparing the page taken over with one the browser draws itself.** Not done:
React's ids, the separators it writes between text nodes and how a control's state appears in the
markup differ between the two by design, and a check that smoothed all three away would be a check
of the smoothing.
