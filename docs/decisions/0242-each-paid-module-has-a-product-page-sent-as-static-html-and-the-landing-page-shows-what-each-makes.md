# 0242 — Each paid module has a product page on formancy.ai, sent as static HTML, and the landing page shows what each makes

- **Status:** accepted; extended by [0243](0243-every-page-of-the-sites-own-build-is-sent-as-static-html-and-taken-over-as-sent.md),
  which renders the landing page, the templates gallery and the Angular page, named here as debt,
  by the prerender step decided here, and takes every page over in the browser with one `mount`;
  Report's example with its QR-bill's code undrawn, a square with only the Swiss cross, superseded
  in part by [0244](0244-reports-example-draws-its-samples-own-swiss-qr-code-encoded-as-report-encodes-it.md),
  which draws the sample's own code; the product pages' *What it does not do yet* superseded in
  part by [0245](0245-a-product-page-says-what-its-module-makes-and-does-and-leaves-what-it-does-not-do-yet-to-the-modules-own-pages.md),
  which takes it off them and leaves the absences to each module's own pages
- **Date:** 2026-11-25
- **Extends:** [0179](0179-the-paid-modules-are-named-as-not-free.md), whose licence section
  stays where a visitor decides what is free and which rejected "a page of its own" for that
  decision; and [0241](0241-the-sitemaps-name-the-paid-modules-pages-and-every-pages-footer-links-them.md),
  whose footer now links these pages, and whose rejection of "the modules in the bar" this
  answers with a link that names no module
- **Deciders:** Daniel Bacher
- **Verified by:** each watched failing on 2026-11-26, its fault planted once and the file put back
  byte for byte:
  - **`apps/site/src/site.test.tsx`**, *a link to a paid module says beside it that the module
    is not free*, now finds a link to `/products/data/`, `/products/report/` or
    `/products/health/` as a link to a module, and requires the modules' section's two links per
    module and the footer's product pages among the landing page's, each in the item that says
    "not free" and "paid in production". Failed with the terms taken out of the cards
    (`/products/data/ has no terms beside it`), with Data's product page link moved out of its
    card into the section's foot (`/products/data/ is not in a module's item`), and with the
    pattern it had before, which does not see a product page (`expected [ …(9) ] to deeply equal
    [ '/products/data/', …(14) ]`). *The paid modules' section* requires the section between
    `#run` and `#licence`, each card's name before its sketch in the document (failed with the
    sketch put first: `Formancy Data's sketch comes before its name`), no picture, frame or
    control in an example (failed with an `<img>` in Data's), and the QR-bill's place holding the
    Swiss cross and no other element or character (failed with two more spans drawn in it: `the
    place holds the Swiss cross and nothing else`).
  - **`apps/site/src/product-page.test.tsx`**, for each of the three pages: one heading level
    one; every link whose address names a module in a group named by *that* module's terms and
    showing them, or in the footer's item — failed with the example's link moved out of its group
    on all three pages, and with Report's healthcare page linked from Health's hero
    (`its group is not named by its module's terms`); HL7's sentence on a page that names HL7 or
    FHIR; "open source" said only as "not open source"; the example a figure with nothing in it to
    operate; every German, French and Italian word marked with its language (failed with the
    referral's answer unmarked: `Synthetische Fragestellung (de)`); the page ending on the
    demonstration and "Ask about a production licence", whose address names the module in its
    subject (failed on all three with the plain address); the release and "Read from the module's
    repository on 25 November 2026" in *Status* and in *What it does not do yet*; the root
    `prerender.mjs` writes into, and the page `renderProduct` sends; and the head of its
    `index.html` — title (60 characters at most) and description (70 to 155) equal to the page's
    own, canonical and `og:url` at its address, no `noindex`, and structured data naming the
    module, its address and its release, with no offer or rating; its share card at
    `/products/<id>/og.png`, 1200 by 630 and `summary_large_image`, described for X as for Open
    Graph by the module, its terms and its heading's promise (failed with Report's description
    without its terms: `Formancy Report: The documents … expected false to be true`); and a
    `BreadcrumbList` from formancy.ai to the page, which the page's node names (failed with
    Data's trail skipping the site: `expected [ { '@type': 'ListItem', …(3) } ] to deeply equal
    [ { '@type': 'ListItem', …(3) }, …(1) ]`). On Report's, the QR-bill's place as on the card
    (failed with the same fault). *The landing page's head* requires one `SoftwareApplication`
    node per module in `paid-modules.json`, each with the `@id`, address, name and description
    its product page's head gives it, and no other (failed with Health's node taken out:
    `expected [ { …(5) }, { …(5) } ] to deeply equal [ { …(5) }, { …(5) }, { …(5) } ]`; with
    Report's `@id` ending `#app`; and with Data's address its examples page's), and each of its
    three descriptions to say "visual form builder for Angular and React" first and "Paid modules"
    after it, the search result's within 160 characters and X's within 200 (failed with "Paid"
    taken out of the description: `description does not say the modules are paid, after the
    engine`).
  - **`apps/site/src/product-og-card.test.tsx`**, for each module's share card: its heading's
    words are its page's heading's (failed on all three with a headline typed in the card:
    `expected 'Formancy Data makes the documents you…' to be 'Your existing database, as forms in
    y…'`); it names the module beside "Not free · paid in production" and "Source-available", and
    calls nothing open source (failed on all three with the terms taken out); it draws its own
    module's example, with nothing in it to operate (failed with Report's card drawing Data's:
    `mx mx-data mx-card: expected false to be true`), and HL7's sentence where it names HL7's
    marks; and it is `#og-card`, at `.og-card`'s size.
  - **`apps/docs/src/counts.test.ts`**: every `index.html` the site builds names an `og:image`
    that `apps/site/public` holds at its path, a PNG whose header says the width and height the
    head does (failed with Health's named `card.png`: `which apps/site/public does not hold`, and
    with Data's height said as 600: `"said": "1200x600"`); and `product-main.tsx` draws
    `ProductOgCard`.
  - **`apps/site/src/chrome.test.tsx`**: every page in the shell, the three product pages
    included, links each module from its footer to its product page beside its terms; the bar's
    one link to the modules names none of them and says "paid"; on a product page it is marked
    `aria-current="true"` and no link claims to be the page (failed with it marked `page`:
    `data: expected 'page' to be 'true'`); and a product page carries the landing page's
    navigation.
  - **`pnpm build:web`** (`scripts/build-web.mjs`): `sitemap-pages.xml` lists the three pages
    after the site's own and before the modules' own pages; each built page holds `<main>` and one
    `<h1>` in its root (failed with the site built without `node prerender.mjs`:
    `products/data/index.html was built with no page in its root`); `apps/site/dist/.prerender`
    is gone (failed with `prerender.mjs` leaving it: `apps/site/dist/.prerender is still
    there`); and each module's `product` in `paid-modules.json` is one of the pages the build
    made (failed with Report's spelled `/products/reports/`).
    `apps/docs/src/site-headers.test.ts` requires the pages to be served under the site's own
    policy, which `inlineOf` would otherwise refuse to write headers for (failed with
    `/products/*` taken out of the site's section: `/products/data/: expected undefined`).
  - **`pnpm test:browser`** (`scripts/product-pages-browser-test.mjs`), whose checks were run
    alone against each planted build: the landing page and each product page at 320, 390, 820,
    1180 and 1440 pixels cannot be scrolled sideways and keep every control inside the viewport;
    no box in an example that clips, and no sheet of paper, holds more than it shows (failed at
    320 and 390 with Report's A4 page held to its proportions and clipping: `mx-paper mx-a4: 0px
    across, 497px down`); no word in an example is under 10 pixels (failed at 320 and 390 with
    Report's words sized by the page's width again: `mx-address at 5.08px`); the landing page's
    cards are three in a row or one to a row, and three in a row at 1440 (failed at 820 and 1180
    with the grid of as many 19rem columns as fit: `they are on 2 rows`); the bar shows "Paid
    modules" past 64rem and hides it below (failed at 820 with the rule that hides it removed); a
    product page raises no error, React's for markup it had to correct among them (failed on every
    page and width with the eyebrow differing between the build and the browser: React's error
    418); and each product page, as served, holds its page in its root (failed on all three with
    the site built without its prerender step). The site block compares each product page's
    ground, faces, bar and navigation with the landing page's, the request gate opens Health's and
    counts what it asks for and keeps, and the policy gate opens all three.

  Nothing here reads the modules' repositories. What the pages and the section say each module
  does, what it does not do yet, its release and its terms were read from each on 2026-11-25,
  and the pages say so beside them.

## Context

Formancy Data, Formancy Report and Formancy Health are sold beside formancy, each from a
repository of its own ([0179](0179-the-paid-modules-are-named-as-not-free.md),
[0180](0180-formancy-health-is-named-before-its-first-release.md)). By 2026-11-25 Data was at
0.5.0, Report at 0.3.0 and Health at 0.1.0, the last two developer previews.

On formancy.ai a visitor met them in three places, each a sentence or a name: the licence
section's items under "Apache-2.0. The whole thing.", the footer of every page
([0241](0241-the-sitemaps-name-the-paid-modules-pages-and-every-pages-footer-links-them.md)), and
the modules' own pages, which their repositories deploy under `/data/`, `/report/` and
`/health/`. None of the three said on this site what a module is for in a way somebody
searching for it would find: `https://formancy.ai/products/data/` answered 404 on 2026-11-25,
and the landing page, like every page this site builds, is an empty `<div id="root">` that a
script draws into, so a crawler that runs no script reads nothing on it.

0179 rejected *a footer link, or a page of its own*, because "a separate page is one nobody
reads before deciding" what is free. That holds for the decision it was about, and the licence
section is still where that decision is made. It did not weigh the visitor who arrives from a
search for "forms for an existing PostgreSQL database" or "Swiss QR-bill PDF" and has never seen
the landing page. 0241 kept the modules out of the bar because a module's name there would stand
without its terms.

## Decision

**The landing page gains a section on the modules**, `#modules` in `apps/site/src/modules.tsx`,
after the self-hosting section and directly before the licence: the engine has told its whole
story by then. Each module is one card, one list item, with its promise, what it covers, a sketch
of what it makes, its terms, and two links, to its product page and to its own demonstration. Its
name comes first in the document and its sketch is drawn above it, so somebody moving by headings
reads each sketch under its own module. The cards are three in a row where the section gives each
the room a sketch needs, one to a row below that, never two with the third alone. The section's
lede is one line: the licence section right below it says the terms in full and where to ask, and
two paragraphs saying the same in a row read as a repeat. Formancy Health's card carries HL7's
sentence. The hero, the product path and the marquee stay formancy's.

**Each module has a product page**, `/products/data/`, `/products/report/` and
`/products/health/`, an entry of the site's own build drawn in the one shell
([0106](0106-one-shell-for-every-page-of-the-site.md)): one layout, `product-page.tsx`, and one
file of words per module under `src/products/`. Each has its own title, description, canonical,
Open Graph and Twitter tags, a share card of its own, and structured data: a `SoftwareApplication`
naming the module, its release and its licence, and a `BreadcrumbList` from formancy.ai to the
page, which the page's `WebPage` names as its `breadcrumb`. It says, in this order, what the module makes, what it does, what teams use it for, who it is
for, how it fits with formancy, its status, what it does not do yet, and its terms as its licence
writes them, and it ends on what a buyer does next: the demonstration, and "Ask about a production
licence", an address whose subject names the module. Each capability leads with what it does for
the reader and leaves the mechanism to the module's own guide, which the page links; each absence
is said as a buyer would ask it. A word in another language is marked with that language.
Health's carries HL7's sentence. What it says about the module is dated, because
nothing here can read it again. Report's page links Report's own topic pages rather than repeating
them, and has a title and description of its own.

**Their words are in the HTML the server sends.** Nothing in the build prerendered anything, so
the site's `build` renders these three pages after Vite has built them:
`vite build --ssr src/product-render.tsx --outDir dist/.prerender` makes a module Node can run, with
the same plugins and defines as the pages, and `prerender.mjs` writes each page's markup into its
root and removes that module. In the browser, `product-main.tsx` takes the markup over with
`hydrateRoot`, or draws it on the development server, which renders nothing in advance. The landing
page is left as it is, and named as debt.

**Every link to a module on a product page is in a group named by its terms**: a `role="group"`
whose name is "Formancy Data, not free, paid in production" and which shows "Not free · paid in
production" beside the links, so a person who tabs to a link hears the terms before its name and
sees them. That is 0179's rule, a link is often reached alone, on a page where every link but
formancy's own leads to a paid module. A link to another module, Health's to Report's pages for
healthcare, is in a group named by that module's terms.

**The bar gains one link, "Paid modules"**, to `/#modules`. It names no module and says in its own
words that what it leads to is paid, which is what 0241's objection asked of anything in the bar.
It is hidden below 64rem, where the bar has no room for a sixth link, and the bar's gaps close a
little between 64rem and 50rem. On a product page it is `aria-current="true"`, the section the page
is in, and not `page`, since it goes elsewhere. "Products" was not used: it would read as
formancy's own product line.

**The footer links each module to its product page**, read from a `product` field in
`paid-modules.json` that replaces the module's own start page, which the product page now links. The
list's `pages` and `sitemaps`, and so the sitemaps' entries for the modules' own pages, are as 0241
left them; `sitemap-pages.xml` lists the product pages after the site's own and before them.

**The examples are drawn by this site**, in HTML and CSS, one component per module with a `card`
and a `page` crop, so the section and the page cannot show a module differently. No picture is
copied from a module's repository and nothing is fetched
([0154](0154-the-website-makes-no-request-to-any-other-site.md)). Every value in them is the
module's own, read from its fixtures, its pictures' capture scripts and, for Report's amounts, the
text `docs/images/samples.json` prints of the rendered sample. Nothing in them is a control. Their
words are set in rem with a floor of 0.625rem and are never clipped: Report's A4 page, first sized
by its width, printed its invoice at about 5 pixels on a phone, so it keeps A4's proportions only
where its stage is wide enough and grows where its words need more.
The QR-bill's code is not drawn: a square with only the Swiss cross stands where the renderer
draws it, with words saying so, so that nothing on this site can be scanned or taken for a code
somebody could pay.

**Each product page is shared as its module's own card.** The site's card shows formancy and its
headline, so a product page shared with it would show the free thing under a paid module's title.
`src/product-og-card.tsx` draws each module's at 1200 by 630 the way `og-card.tsx` draws the
site's: a route, `?og` on the page, whose `#og-card` is screenshotted from the built site in
Chromium and kept as `public/products/<id>/og.png`, as `docs/images/README.md` says. Its words are
the page's own, rendered from the same `Product`: the module's name, the promise its page's
heading makes, and its terms, "Not free · paid in production" and "Source-available", since a
shared card is read alone beside formancy's mark. Beside them is the landing page's crop of the
module's example, drawn by the same component, and on Health's card HL7's sentence. Each page's
head names its card with its size, asks for it large, and describes it, for Open Graph and for X,
starting with the module, its terms and the promise.

**The landing page's head names what the modules make, as paid.** Its description, its Open Graph
description and its X description still lead with the engine and its phrase, "visual form builder
for Angular and React", and then say "Paid modules" and what they make: forms over a PostgreSQL or
SQL Server database, PDF and Word invoices, the longer two documents as well, and healthcare forms;
the search result's in 160 characters, which cost it the engine's list of features. Its structured
data gains one `SoftwareApplication` node per module, after formancy's, with the `@id` the module's
product page gives it, its name, the product page as its address and that page's description, so
both pages describe one thing and say the same of it. Nothing else: no licence, version or
`isAccessibleForFree`, which its product page says or which would be wrong, since a module is free
only to try and build with. The title is unchanged.

## Consequences

**What it buys.** A search for what a module does can land on a page of this site that says it,
in words a crawler reads without running a script, in the room the rest of the site is drawn in,
with the terms beside every way to the module. A visitor on any page reaches each module's page
from the footer, and from the bar on a wide screen, and the landing page shows what each module
makes, where before it named them in a paragraph. A shared link to a product page shows that
module, and a search engine reading the landing page's head alone learns that the modules exist,
what they make and that they are paid.

**What it costs.** The pages state, in detail, facts about three other repositories that nothing
here checks. Each module's capabilities, absences, release and licence were read on 2026-11-25,
and the pages and the section say so; the first release of a module after that makes some of it
wrong until somebody reads the module again. The repositories and their own pages go on describing
the same things, Report's in four languages, so a module is described in two places that can
disagree, and nobody would find out but a reader. The licence section's descriptions in
`licence.tsx` are a third, shorter statement on the landing page itself, and Report's there was
brought in line with Report's README by hand: PDF and Word, printed in Node or in a browser.

The pages ship React to draw what the HTML already holds, which they need for nothing but the
development server and a shell that is one component. The site's build is three steps instead of
one, and a module that renders the pages is built and removed on every build. The landing page,
the templates gallery and the Angular page are still empty to a crawler that runs no script.

The terms are said more often again: on every card, in each group on a product page, and in the
footer of every page in the shell. On a phone the invoice's drawing leaves out its unit and price
columns, and its slip's two parts stand one above the other, which no real QR-bill does. The bar is a link longer on wide screens. No module's packages are named
by their npm names on these pages: `apps/docs/src/package-references.test.ts` holds every
`@formancy/` name on the site to this workspace, and the modules publish from their own
repositories, so a page says "Formancy Data's browser client" and sends the reader to the module's
getting-started guide for the name.

The share cards are pictures taken by hand from the built site, as the site's own is. What is held
is their source, against the page's heading, and the files, against the address and size each head
names; nothing compares a picture with its source, so a card goes stale when a module's promise,
terms or example changes, until somebody takes it again. They are three more files in the
repository, 209 to 213 kB each as taken on 2026-11-26. The landing page's structured data repeats
each product page's description by hand, held to it by the test, and its description no longer
lists the engine's conditional fields, validation, file uploads and styling, which the 160
characters had no room for beside the modules.

**What it forecloses.** A link to a module, on any page of this site, without its terms beside it,
and a module named in the bar. A sketch of a module's output that is a picture, fetched or
copied, or that draws a payment code somebody could scan. A product page whose words are drawn by
script alone. A product page shared under formancy's card, a module's card without its terms, and
structured data on the landing page that describes a module otherwise than its product page does.
As 0179 forecloses, any of this describing a module as part of formancy's open-source
offer: a product page says "Source-available, not open source".

## Alternatives considered

**The modules' pages left to their own repositories.** Rejected. Their deployments own `/data/`,
`/report/` and `/health/` and draw their own pages, Report's in four languages; none of them is in
this site's shell or carries its footer, and two of the three are demonstrations rather than pages
about the module. A page in formancy.ai's room, beside the free thing it is built on, is this
repository's to make.

**Pages of their own instead of a section on the landing page**, or the other way round. Rejected.
A visitor already on the landing page should see the modules where the page discusses what is
free; a visitor who searched should land on a page about one module. Each is for one of them.

**The section higher up the page, or in the hero.** Rejected. The landing page argues for formancy,
which is free; a paid module above that argument would read as the product.

**Every page prerendered, the landing page with them.** Rejected for this change. The landing page
renders live forms through the engine, a studio in its hero and a journey that reacts to scrolling,
and rendering those on the server is a change of its own, with its own tests. It is recorded as debt.

**A static site generator or a Vite plugin to prerender.** Rejected. Either is a dependency the
SOUP declaration would name and a build nobody here has read, for what two documented Vite commands
and a short script do.

**No script on the product pages.** Rejected, narrowly. The pages need none to be read, but the
development server renders nothing in advance and would show an empty page, and the page would
need a stylesheet linked by hand where every other page has its styles from its components.

**The head written from the page's data by `prerender.mjs`.** Rejected. The development server would
then serve the pages with no description, canonical or structured data; the head is written in each
`index.html` as every other page's is, and the page's test holds it to the page's own title and
description.

**Pictures of the modules copied into this repository.** Rejected: an image of text a reader cannot
select, a file that goes stale without anything here noticing, and, for Report's invoice, a Swiss QR
Code a phone could scan. The share cards are pictures, but of this site's own drawing, taken from its
built pages and shown only where a link is shared, and Report's has the same undrawn square.

**The site's card on the product pages, or no card.** Rejected. The site's card shows formancy's
headline and form under a paid module's title, which says the wrong thing about both; with none, a
shared product page was the one page of the site that showed no picture.

**The landing page's module nodes written from the products' files at build time.** Rejected, as the
product pages' heads were above: the development server would serve the landing page without them,
and the test holds the nodes written in `index.html` to each product page's head, which is what a
search engine joins them to.

**A script here that takes the cards.** Not done: the site's card is taken by hand from its route, as
`docs/images/README.md` says, and the modules' are taken the same way, so there is one way of taking
the site's pictures and not two.

**A bar link called "Products".** Rejected, as above: it would read as formancy's own product line and
blur what is free. **The modules by name in the bar** stays rejected, as 0241 rejected it.

**One terms line per page, at the top.** Rejected, as 0179 rejected one sentence above the licence
section's links: a link is reached alone, and the guard would then be a phrase somewhere on the page.

**Report's newest topic pages linked from its product page now.** Not done: on 2026-11-25 Report's
deployment served its product page, its QR-bill page, its EPC QR code page and its healthcare page,
and a link to a page not yet deployed is a 404. The others are linked once Report serves them.
