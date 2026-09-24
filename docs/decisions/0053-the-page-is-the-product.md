# 0053 — The landing page renders a real form, and no effect is load-bearing

- **Status:** accepted
- **Date:** 2026-09-24
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/site/src/site.test.tsx` (16 cases: the demo is real
  markup with a working conditional and a computed value, the page has one
  heading level one and a skip link, and the ending is announced rather than
  only shown), and a manual check at 320 CSS pixels and under
  `prefers-reduced-motion: reduce`.

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

**The demo is the product.** Halfway down, a real `FormSchema` goes to a real
`createFormEngine` and a real `FormancyForm`, with the product's own `dusk`
theme. Choosing the managed plan reveals a field because the document says so;
a computed field computes. It is a separate app (`apps/site`) rather than a
page in the docs site, and it depends on `@formancy/react` the way a customer
would — so it breaks when the package breaks.

**The page is themed by the thing it sells.** The palette is the `dusk` theme's
own tokens. A landing page for a theming system that invents a palette is
arguing against itself.

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

**One bold moment, then quiet.** The hero's two planes converging is the only
place the page raises its voice, other than the ending. Per-section entrance
animations and hover transitions on every card are the generated-page default,
and they make a long page exhausting rather than considered.

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

The reserved column on the right of every wide section exists only to keep the
running submission from sitting on top of prose. It is a real constraint on the
layout imposed by an ending, and it is the thing to remove first if the page is
ever reworked.

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
