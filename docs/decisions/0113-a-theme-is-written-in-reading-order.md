# 0113 — A theme is written in reading order, and something fails when it is not

- **Status:** accepted
- **Date:** 2026-10-08
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/themes.test.ts` — no stylesheet may name a side as a
  property, and a side named as a *value* must be named again for the other reading
  order. Proved against four physical properties (`margin-left`, `text-align: right`,
  `padding-right`, `left`) and against removing one theme's flip. The browser gate adds
  a narrower claim about the rendered form, proved by pinning a side in the
  application's own stylesheet and watching it name the three elements that stopped
  flipping.

## Context

Right-to-left support was never decided. It was **true by accident**: every shipped
theme had zero physical directional properties and twenty to twenty-nine logical ones,
because the person writing them reached for `padding-inline-start` out of habit.

A fact that holds by habit holds until the first person who types `padding-left` because
that is what their fingers do. Then an Arabic or Hebrew form has its labels, its error
marks and its repeater controls on the wrong side, and nothing anywhere reports it —
this product ships no layout of its own, so a theme's stylesheet is the whole of the
answer.

And looking for the guard found a defect the guard had been told to ignore.

## Decision

**A theme may not name a side.** `apps/docs/src/themes.test.ts` refuses
`margin-left`, `margin-right`, `padding-left`, `padding-right`, `border-left`,
`border-right`, `left`, `right` and `text-align: left | right` in any stylesheet that
scopes itself to `data-formancy-theme`. Not a count — a count would pass the day
somebody adds one and removes another, and the point is that there are none.

**With a guard on the guard**: every theme must *use* a logical directional property
somewhere, or the refusal above is an assertion of absence satisfied by a stylesheet
that positions nothing.

**And a side named as a value is named again for the other reading order.** This is the
part that was not merely missing. The first version of the rule excluded
`background-position` with a comment saying the pattern would have to understand the
difference between a side as a property and a side as a value — and all four themes
that draw an icon did this:

```css
background-position: right 0.75rem center;
padding-inline-end: 2.5rem;
```

The padding moves with the reading order and the icon does not, so in Arabic or Hebrew
the two part company and the icon sits on top of the text. CSS has no logical
`background-position`, so the honest fix is to name the side twice — and the guard now
checks that each side named outside a `:dir()` rule has its opposite inside one.

`:dir(rtl)` on the control rather than an `[dir='rtl']` ancestor: direction is
inherited, so a form inside a right-to-left document with no attribute of its own still
reads right to left, and an ancestor selector would miss it.

**The browser gate holds a different and narrower claim**: the rendered form responds to
`dir`, none of its own layout stays pinned, and nothing overflows once mirrored.

## Consequences

**The icon defect was invisible to every gate and will stay that way.** Those rules live
inside `@supports (-webkit-touch-callout: none)` — iOS WebKit alone, because mobile
Safari draws no icon of its own while Chromium and Firefox do. The browser gate runs
Chromium, which never applies them. So this is held by a source check and by nothing
else, and that is stated rather than implied.

**The browser case does not hold the themes, and its wording says so.** Measured: four
asymmetries in the rendered form, all of them from the renderer and the user-agent
stylesheet. Pinning a side in all four themes left the case green; pinning one in the
application's stylesheet reddened it and named three elements. So it holds the
renderer's own layout and nothing more — worth keeping at that narrower claim, because
a renderer emitting a hard-coded arrow would fail there and nowhere else, and worth
saying because the first version of this record claimed it held the themes.

**Nothing here checks a right-to-left *language*.** Mirroring a layout is not
translating a form, and a form whose content is in Arabic with its catalogue in English
is a different problem with a different answer
([0107](0107-layout-text-is-read-in-the-engines-locale.md)). What is claimed is that the
layout follows the reading order it is given.

**`:dir()` is the browser support floor this adds**: Chrome 120, Safari 16.4, Firefox
49. The rules using it are already inside an iOS-WebKit-only block, so the practical
floor is Safari 16.4 — well below what that block already assumes.

> **Amended by [0123](0123-the-builder-reads-right-to-left.md).** A floor stated here was
> not a floor any build used: Vite's default target rewrote these rules as a list of
> right-to-left languages, in the site this record's checks run against. The site and the
> playground now build for the floor, and the cases above read the builder's stylesheet
> too, which they had not.

## Alternatives considered

**Leave it as it is, since the themes already comply.** That is the state this record
exists to end: a property nothing checks is a property that holds until somebody is in
a hurry. The whole repository is built on the opposite rule.

**A `[dir='rtl']` prefix on every rule instead of logical properties.** Twice the
stylesheet, and it only works where somebody wrote the attribute — a form inside a
right-to-left page with no attribute of its own would be missed, because direction is
inherited and an attribute selector is not.

**Pixel-comparing a mirrored screenshot.** It would catch everything, including the
things no rule can express. It is also a baseline somebody updates when it goes red,
which is the one kind of assertion that gets quieter the more often it fails — refused
here for the same reason it was refused for layout
([0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).
