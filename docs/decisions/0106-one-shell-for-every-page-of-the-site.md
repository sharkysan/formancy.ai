# 0106 — One shell for every page of the site, and the two pages are compared in a browser

- **Status:** accepted
- **Date:** 2026-10-07
- **Deciders:** Daniel Bacher
- **Verified by:** the site block in `scripts/browser-test.mjs`, run by the `browser`
  job in `.github/workflows/ci.yml`, which loads `/` and `/templates/` from the
  composed build and compares their computed ground, ink, body family, display family
  and bar against each other, plus their navigation and their mark. **Seven mutations
  were applied, rebuilt and watched to redden it**, each reintroducing the exact defect
  one case describes rather than breaking something arbitrary: the gallery's own
  ground, its `Inter` stack, its own navigation, the hero on `paper`, an appearance
  switch that changes nothing, the examples band without the panel's clearance, and a
  card grid of three fixed columns. The five parity parts — ground, ink, text, display,
  bar — are one loop body, and two of the five were reddened, so what is proved is the
  comparison and not each part separately. What it does not verify is in the
  consequences.

## Context

The site grew a second page. `/templates/` ([0105](0105-templates-are-documents-with-examples.md))
shipped with its own design language, and not by a shade:

| | the landing page | the templates page |
|---|---|---|
| ground | `#080a12`, `color-scheme: dark` | `#f6f8f3`, `color-scheme: light` |
| body text | IBM Plex Sans, loaded | `Inter` — **loaded nowhere**, so whatever the machine had |
| display | Archivo, with its width axis set | the same fallback stack |
| serif accent | Fraunces, loaded | `Georgia` |
| accent | `--client` violet and `--server` teal, which carry meaning | `#6852bd` |
| units | rem | px |
| mark | the favicon: a violet stem, teal arms | the letter `f.` in a rounded square, set in Georgia |
| chrome | `.bar`, `footer` | `.template-header`, `.template-footer` |

Reported as *"the templates page does not fit the style at all"*, and the first table
row is the mild version of the problem. The sixth is the one that matters: the landing
page's whole argument is that violet is the browser and teal is the server and one
engine runs in both, so a second accent on a second page is not a cosmetic choice —
it is the page arguing something else.

The `Inter` row is worse than it looks. Nothing in this repository has ever fetched
Inter, so the gallery was rendering in the system UI face on every machine, and
looking plausible while doing it. A font stack that names a family nobody loads fails
silently and differently per visitor.

And the deeper problem is what this product is for. formancy exists so that a
consumer's design system owns the markup. **A product making that argument cannot ship
two design systems of its own.**

Two smaller defects of the same kind were found while measuring:

- The hero's form opened on `paper` — cream, serif, editorial — inside a dark studio on
  a dark page, while the examples section further down had defaulted to `dusk` all
  along. Two halves of one claim about theming, disagreeing about how to open.
- The running submission is `position: fixed` in the corner of a full-bleed page.
  Measured at 1600px: 232×212 pixels of panel on top of the live form and the JSON
  beside it — the one place on the page somebody is actually clicking, hidden by the
  panel reporting what they clicked. The footer had already been given clearance for
  exactly this, and the examples band had not.

## Decision

**One shell, imported by both entry points, in two halves.**

- **`apps/site/src/shell.css`** — the tokens, the type scale, `.eyebrow`, `.lede`,
  `.action`, the backdrop, `.skip`, `.bar`, `.mark` and `footer`. Moved out of
  `site.css`, which keeps the landing page and nothing else.
- **`apps/site/src/chrome.tsx`** — `SiteBar`, `SiteFooter`, `Mark`, `Backdrop`, and the
  `REPO` and `PLAYGROUND` constants that both pages had their own copy of.

The structural half is the point. Copying the stylesheet across would have made the two
pages agree once; a component they both render makes them **unable to disagree**, which
is the question CLAUDE.md asks of any duplication: if these two ever diverge, would
anybody find out? The navigation is one list, so adding a page to the site adds it to
every page's bar, and the place it could be forgotten no longer exists.

**`template-gallery.css` contains no colours.** Every one is a token. The shape it had
— a hero, a toolbar, a card grid, a dialog — survives unchanged, because the shape was
never the complaint.

**The gallery's preview opens in `dusk`**, for the same reason the hero now does: a
cream sheet inside a dark dialog is two products in one window.

**The examples band reserves the panel's corner** with the clearance the footer already
takes, `calc(var(--gutter) + 15rem)`, on the band rather than on the page — a gutter on
the page would move the hero sideways the moment the panel appeared.

### How the parity is checked

In the browser gate, because none of it is visible to jsdom: no CSS, no cascade, no
layout ([0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).

**Computed values, compared between the two pages rather than against a literal.** No
constant in the test says what the ground is, so changing the site's palette is one
change and not two; what cannot change is that the pages differ.

**`font-family` as computed, which is the family each page *asks for*.** Deliberately
not what rendered: the gallery asked for `Inter` and got the system face, and comparing
what rendered would have found the two pages in agreement while one of them was wrong.

**The sideways check is scroll*ability*, not `scrollWidth`.** The site sets
`overflow-x: hidden` on the body so the backdrop's auroras and the marquee's two rails
can be wider than the screen on purpose. With that set, `scrollWidth` reports 348px of
"overflow" on a page that cannot be scrolled sideways at all — a case that fails on the
decoration and says nothing about the content. So: the page genuinely cannot be slid,
and every control on it is inside the viewport. The second half is the one with teeth,
since being unable to reach a control is what a too-wide layout actually costs.

**A control parked off the side is asked whether focusing brings it back**, which is the
skip-link pattern and correct. Asked of the element rather than recognised by its
class: this repository has had a guard match the shape a thing usually has and go quiet
the moment it had another.

**The theme cases assert relative luminance, never a theme's name.** What was wrong is
that two surfaces disagreed, so that is the property. A differently-named dark default
must pass and `paper` must not, whatever the default is called by then. And a second
case switches to a light appearance and requires the measurement to *change*, because
without it the first passes on a page where nothing is themed and every surface reads
as the same transparent black — green while asserting nothing, which is how a guard
here has failed twice ([0060](0060-documentation-is-checked.md)).

## Consequences

**`site.css` lost 489 lines and `app.tsx` lost 87.** The size budget's ratchet fired on
`app.tsx` and its ceiling came down with it, which is the ratchet doing the job it was
built for rather than a number being tidied.

**A third page is now cheap and cannot drift.** It renders `SiteBar` and `SiteFooter`,
imports `shell.css`, and the gate compares it to the other two the moment its path is
added to the list. That is the actual return on this change; the two pages agreeing
today is the smaller half.

**The gate compares the pages to each other, so both could be wrong together.** A
palette change that broke the site uniformly would pass every parity case here. That is
accepted: what shipped was divergence, and divergence is what is now impossible. The
parts of a page that are a matter of taste are not testable and are not claimed to be.

**One width, 1600px.** None of the three defects is a breakpoint — all three were worst
where there is the most room — so the site block runs once rather than across the four
viewports the playground block uses. A layout defect that only appears on a phone would
not be caught by it, and the honest place to say so is here.

**The templates page's `index.html` gained the font links, the dark `theme-color` and
`color-scheme`, and the shared social metadata.** Two documents now list the same font
request. That is a real duplication and the one left standing: Vite's HTML entry points
are separate documents, and the alternative is a build-time template, which is a
plugin's worth of machinery for four lines. The gate's `text` and `display` cases are
what fail if they diverge.

## Alternatives considered

**Copy the landing page's values into `template-gallery.css`.** The fastest fix and the
one that invites the next divergence, since nothing then fails when somebody changes one
of them. Rejected on the duplication rule: two implementations of the same decision is
the thing this project exists to prevent
([0091](0091-a-second-builder-is-a-binding.md)).

**A shared package, `@formancy/site-shell`.** A published package for two pages in one
app, with a build and a version, to be depended on by nothing else. No interface with
one consumer ([0008](0008-layered-packages.md) and the pattern rule in CLAUDE.md).

**Pixel baselines of both pages.** It would catch a drift of taste as well as of
tokens, and it is the one kind of assertion that gets quieter the more often it fails,
because the baseline is a file somebody updates when it goes red
([0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md) rejected it for the same
reason). What the defect actually was is a colour, a family and a list of links, all of
which a test can state.

**Leave the gallery as a deliberately separate landing page.** Defensible for a
marketing microsite with its own campaign. Not defensible here: the bar links to it,
the bar now appears on it, and a visitor crossing between them in one click sees two
products.
