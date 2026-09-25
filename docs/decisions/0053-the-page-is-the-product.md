# 0053 — The landing page renders a real form, and no effect is load-bearing

- **Status:** accepted
- **Date:** 2026-09-24
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/site/src/site.test.tsx` (38 cases: every example is
  real markup with working conditionals and computed values, passes the same
  validator and expression check the MCP server runs, and builds an engine;
  the page has one heading level one and a skip link; the example strip is
  keyboard-operable; and the ending is announced rather than only shown), and
  a manual check at 320 CSS pixels and under `prefers-reduced-motion: reduce`.
- **History:** the demo grew the spec 2 types after the fact, and writing it is
  what found the bug in [0022](0022-fail-open-fail-closed.md) — a `visible`
  rule over a `selectboxes` field showed the field it was meant to hide. Which
  is this record's own argument arriving sooner than expected: a page that
  renders the product finds what a page of screenshots cannot.

  Revised on 2026-09-25, when the owner found the page still too plain to
  excite anybody and the one example too dry to want to fill in. The quote
  form became three examples, the page gained light, glass and motion, and two
  decisions below were reversed rather than quietly contradicted: the stack is
  cards again, and the page is no longer quiet between its two loud moments.
  Writing the third example found something too — a visibility rule reading a
  bare checkbox passes the spec's expression check and is then refused by the
  engine, which took the whole page down. There is a test for that now.

## Context

formancy.ai needs a page that makes one argument to a technical audience: the
same engine runs in the browser and on the server, so client and server cannot
disagree about whether a submission is valid.

Two things make that page unusually easy to get wrong.

The first is that a marketing page for a *rendering* library is a rendering
library's own worst advertisement if it shows screenshots. The second is that
a marketing page for an *accessibility-first* library which makes somebody
motion-sick, or breaks at 320 pixels, or hides its headline behind a scroll
animation that has not loaded, has refuted its own argument before the reader
reaches the section about accessibility.

## Decision

**The demo is the product.** A third of the way down, real `FormSchema`s go to
real `createFormEngine`s and a real `FormancyForm`, with the product's own
`dusk` theme. It is a separate app (`apps/site`) rather than a page in the docs
site, and it depends on `@formancy/react` the way a customer would — so it
breaks when the package breaks.

**Three forms somebody might want to fill in.** "Request a quote" is the form
every product page shows and nobody has ever wanted to complete. The examples
are a conference ticket, a bug report and a night in a mountain hut, behind a
keyboard-operable tab strip, and between them they carry every claim the page
makes: conditional fields, computed prices, list answers read by a rule,
`richtext`, `file`, and `tabs` and `table` layouts. Each keeps its own engine
for the life of the page, so switching away does not throw away what somebody
typed.

**The rules evaluate beside the form.** The document is shown next to the form
it drew — generated from the schema, so the two cannot drift — and under it
each rule lights up as the engine evaluates it, read through `useField`, the
hook a consumer would use. The reader watches the engine think rather than
being told that it does.

**The file field uploads nowhere, and says so.** The page is static on purpose
— a landing page that needs a database to render is a landing page that goes
down — so its uploader keeps the file in the tab and writes
`demo:nothing-was-uploaded` as the storage key. Minting a plausible-looking key
would make the demo read better and make the product look like it silently
drops files.

**The page is themed by the thing it sells.** The palette is the `dusk` theme's
own tokens. A landing page for a theming system that invents a palette is
arguing against itself.

**The frame is filled, and that was a bug rather than a taste.** Every section
reserved fifteen rems of its right edge for the submission panel, which sits in
one corner — so two fifths of every screen was empty the whole way down and
the page read as a draft. Only the last section can collide with the panel, and
only that one pays now. The hero is two columns: the headline, and the document
it is talking about with what the engine makes of it.

**Numbers, not adjectives.** A strip of measured readings under the hero:
one engine, **zero** uses of `eval`, fifteen field types, seven agent tools, 57
decision records. The audience has been told "blazing fast" before and stopped
believing it. The zero earns its place because
[0040](0040-no-eval.md) has a test that fails if it ever stops being true, the
field-type count is asserted against `FIELD_TYPES`, and the record count
against the records on disk, so neither can quietly drift — a number on a
landing page that nothing checks is an adjective with extra steps. The test
count was dropped for the same reason: nothing checked it.

**Archivo for display.** A grotesque with a width axis, set slightly narrow:
engineered rather than editorial, which is the register this product speaks in.
The body stays IBM Plex Sans and data stays IBM Plex Mono. Two faces, clearly
distinct, no third.

**Glass, light and a grid — the frame is a place, not a flat ground.** Three
slow washes of the channel colours drift behind the page, a grid fades out
below the fold, and every container is one shape: a translucent window. The
stack's strata are cards again, reversing the earlier "a drawing, not cards":
the hairline version read as austere rather than as considered, which is the
opposite of what a page meant to excite has to do. The edge-light still says
which layers are shared and which are written twice.

**Two accents, carrying information.** Violet is the browser, teal is the
server. They appear together where the pairing is the point and nowhere else,
so the colour scheme is the argument rather than a decoration.

**Every effect is CSS, scroll-driven, and optional.** `animation-timeline:
view()` and `scroll()`, which the browser runs off the compositor with no
scroll listener and no frame loop. A browser that has never heard of them shows
the page flat, and the page reads perfectly flat — there is no third design.
The only JavaScript that touches scrolling is an `IntersectionObserver`, which
does the work off the main thread and reports crossings rather than positions.

**`prefers-reduced-motion` removes all of it, in CSS.** Not smaller movements:
none — no perspective, no rotation, no translation. In the stylesheet rather
than in script, because a preference honoured by JavaScript is a preference
honoured only once the JavaScript has loaded.

**Motion everywhere, and all of it cheap.** Reversed from "one bold moment,
then quiet". Sections rise as they arrive, cards lift and catch a light that
follows the pointer, an agent session plays out line by line, and the headline
shimmers. Every one of these animates `transform` or `opacity` only — the
light behind the page is gradients moved by `transform`, not a blurred layer
repainted every frame — and the pointer light is two custom properties set on
the card under the cursor, with nothing re-rendering.

**The ending is a payoff, not a trick.** A panel accumulates a submission as
sections are read, and the last section reveals that reading the page was
filling one in. The panel holds a real submission shape the whole way down,
built the same way, in a stable order — if it were a decoration shaped like a
submission the reveal would be a lie, and this audience would notice.

## Consequences

**What it buys.** The strongest claim on the page is checked by the page: if
the renderer regresses, the marketing site fails its own tests. The
accessibility argument is made by a page that passes its own bar, at 320
pixels, with reduced motion, by keyboard.

**What it costs.** A fourth app to build and deploy, and a dependency from
marketing onto the packages — so a breaking change to `@formancy/react` breaks
the website's build. That is the intended cost: it is the same cost every
consumer pays, and paying it is how we find out.

The running submission overlays the page's bottom-right corner and only the
last section makes room for it, so on a narrow desktop it can sit over the edge
of a card for a moment. That is the price of an ending that is present the
whole way down.

## Alternatives considered

**A page in the docs site.** Rejected: Starlight owns its root route and its
own design, and the two jobs are different — documentation is scanned, a
landing page is read once, in order.

**Screenshots or a video of the builder.** Rejected, as above. It is also the
cheapest thing to fake and the audience knows it.

**A scroll library** (Lenis, GSAP ScrollTrigger). Rejected: they replace the
browser's scrolling with their own, which is a hijack a keyboard and a screen
reader both notice, and they bring a frame loop the CSS version does not need.
The effects here are a dozen lines of stylesheet.

**No ending.** Considered seriously — the page argues well enough without it,
and Chanel's rule says remove one accessory. Kept because it is the one moment
that makes a technical reader smile, and because it demonstrates the product's
own data shape while doing it.
