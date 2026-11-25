# 0241 — The sitemaps name the paid modules' pages, and every page's footer links them, from one list

- **Status:** accepted; extended by [0242](0242-each-paid-module-has-a-product-page-sent-as-static-html-and-the-landing-page-shows-what-each-makes.md),
  whose footer links each module to its product page on this site, which links the module's own
  pages, and whose bar has one link to the modules, "Paid modules", that names none of them; the
  sitemaps' entries for the modules' own pages stay as decided here
- **Date:** 2026-11-22
- **Extends:** [0179](0179-the-paid-modules-are-named-as-not-free.md), whose licence section
  stays where a visitor decides what is free, and which rejected a footer link *in place of* it
- **Deciders:** Daniel Bacher
- **Verified by:** each watched failing on 2026-11-22, its fault planted once and the file put back:
  - **`pnpm build:web`** (`scripts/build-web.mjs`), in CI's `verify`. It requires
    `apps/site/public/sitemap-pages.xml` to list the site's own pages and then every page
    `apps/site/src/paid-modules.json` lists, and `sitemap.xml` to list `sitemap-pages.xml`, the
    documentation's sitemaps as Astro wrote them and then every sitemap the list names, each in
    that order; and it refuses an address in the list that is not under `https://formancy.ai/`.
    Failed before the files named the modules, then with `/data/demo/` taken out of the pages,
    with Report's sitemap taken out of the index, and with a repository's address put into the
    list.
  - **`apps/site/src/chrome.test.tsx`**, *links each paid module by its name from every page, with
    its terms beside the link*. It renders the landing page, the templates page and the Angular
    page, finds each module's link in the footer by role and name at the address the test writes
    out, and requires "not free" and "paid in production" in the item that holds it. Failed before
    the footer had the links (`Unable to find an accessible element with the role "link" and name
    "Formancy Data"`), with the terms taken out of the item, and with Report's link put back on
    `/report/`.
  - **`apps/site/src/site.test.tsx`**, *a link to a paid module says beside it that the module is
    not free*, now requires the footer's three links among the landing page's, each beside its
    terms; it failed (`expected [ …(6) ] to deeply equal [ …(9) ]`) before they existed.

  Nothing here reads the pages the list names. That they exist, may be indexed and stay where the
  list says is held by the modules' repositories, not by this one.

## Context

Formancy Data, Formancy Report and Formancy Health are each served under formancy.ai by a
deployment of its own repository ([0179](0179-the-paid-modules-are-named-as-not-free.md),
[0180](0180-formancy-health-is-named-before-its-first-release.md)). Data's examples are at
`/data/examples/` and its live demo at `/data/demo/`. Report's product pages are at `/report/en/`,
`/report/de/`, `/report/fr/` and `/report/it/`, beside its Studio at `/report/`. Health's demo is
at `/health/`. Report's pages write a sitemap of their own at `/report/sitemap.xml`, a urlset in
which each page names its other languages, read from that repository's `main` on 2026-11-22.

A search engine found none of them through this site:

- The sitemap index listed `sitemap-pages.xml` and the documentation's sitemap, and
  `sitemap-pages.xml` listed the landing page, the playground, the templates page and the Angular
  page. No module.
- The one place the site linked the modules was the licence section of the landing page. The
  templates page and the Angular page, where a search can land a visitor as well, named none of
  them.
- Report's licence item links its Studio, which is the tool rather than a page about the module,
  and whose page says `noindex`, read from that repository's `main` the same day.

0179 rejected *a footer link, or a page of its own*: "The footer holds what somebody needs to check
the claims above it, and a separate page is one nobody reads before deciding." That was about where
a visitor decides what is free, and it holds. It did not weigh a visitor, or a crawler, who never
reaches the landing page's licence section.

## Decision

**The sitemaps name the modules' pages.** `sitemap-pages.xml` lists `/data/examples/`,
`/data/demo/` and `/health/` after the site's own pages, and the index lists `/report/sitemap.xml`
after the documentation's sitemaps. Report's Studio is listed nowhere. `robots.txt` keeps its one
`Sitemap:` line, for the index, which reaches every other sitemap.

**Every page's footer links each module by its name**: the footer of the one shell the landing
page, the templates page and the Angular page are drawn in
([0106](0106-one-shell-for-every-page-of-the-site.md)), on a line under the links that check the
site's claims. Data's goes to its examples, Report's to its English product page, Health's to its
demo. Each link's item says "not free · paid in production" beside it, as the licence section's
items do and for 0179's reason: a link is often reached alone. The licence section stays as 0179
decided it.

**One list states both.** `apps/site/src/paid-modules.json` gives each module's name, the page the
footer links, the pages the sitemap lists and the sitemaps of its own the index lists. The footer
renders it, and `build-web.mjs` holds the two sitemaps to it. JSON, because the footer is bundled
for a browser and the check runs in plain Node from a bare checkout, and both read JSON with nothing
built.

**The landing page's HTML gains nothing.** Its body is an empty element a script draws into, and
its structured data describes formancy alone. Writing the links into it as well would be a second
rendering of the footer, which nothing would hold to the first.

## Consequences

**What it buys.** A search engine reading the index is told of every module page meant to be found,
and one that runs the site's scripts finds a link to each module from every page. A visitor on the
templates page or the Angular page reaches the modules without passing the landing page, and reads
their terms beside the link. The footer and the sitemaps cannot say a module lives in two places,
because they read one list.

**What it costs.** The site now lists and links pages it does not build, at addresses other
repositories own. If a module moves a page, asks for it not to be indexed or stops serving it, this
site goes on listing it and the build stays green; a search engine reports the address, and no
gate here does. Each module makes its pages indexable in a change of its own, and until it has, the
page itself tells a search engine not to index what this sitemap lists. The index names Report's
sitemap whether or not it is there.

The footer is drawn by script, as the licence section is, so a crawler that runs no script finds
the modules through the sitemaps alone. The playground, the documentation and the legal and privacy
pages are not drawn in the shell, and their own chrome does not link the modules' pages. And the
footer is a line longer on every page it is on, the same terms three times on it, and twice per
module on the landing page. That was chosen over one phrase in front of all three, which 0179
rejected for the licence section on the same grounds.

The list stands beside the licence section's own in `licence.tsx`, which keeps the descriptions and
links Report's Studio rather than its product page. The two name the same modules, and the
addresses of Data and Health twice. `site.test.tsx` writes out every module address the landing
page links, so a change to one is made beside the other, but nothing derives one from the other.

The privacy notice names what `/data/demo/` and Report's product pages, which this site now lists
or links, keep and send: Report's pages as read from the live site on 2026-11-22, the live demo as
its repository's guide and code say on that day -- a cookie at sign-in, what a visitor types held
by a server of their own until it stops, their choices in local storage. Nothing here checks either:
the notice is read again when one of them changes.

**What it forecloses.** A module page in a sitemap that `paid-modules.json` does not list, and a
link to a module in the footer without its terms beside it. As 0179 and 0180 already foreclose, the
footer says nothing of any module but its name and its terms: not that it is released, and never
that it is part of formancy's open-source offer.

## Alternatives considered

**The licence section alone, as 0179 has it.** Rejected. It is on one page of three, and it links
Report's Studio, which asks not to be indexed, rather than a page about Report.

**The sitemaps alone.** Rejected. A sitemap tells a search engine an address exists; a link tells
it, and a visitor on any page, that this site leads there. Both were missing.

**A `Sitemap:` line in `robots.txt` for each module.** Rejected. The index already reaches them, and
one line is one place to keep right.

**A module's sitemap index in the index.** Not allowed: a sitemap index may not list another index, which
is why the documentation's children are listed rather than Astro's index. Report's sitemap is a
urlset and may be listed; a module that writes an index later needs its children listed instead,
and the build cannot read which it wrote.

**The links written into `index.html` too.** Rejected above: a second rendering of the same links,
in a page whose static HTML carries none of its content today.

**The list in the build script, and the footer's links typed in `chrome.tsx`.** Rejected: two
statements of where each module lives, and if they disagreed nobody would find out.

**The modules in the bar.** Rejected. The bar is how somebody moves around this site, and below
50rem it keeps two links. A module in it would sit there without its terms, or make the bar carry
them.
