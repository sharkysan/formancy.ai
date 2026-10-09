# 0123 — The builder reads right to left, and the bundler is told the browsers it is for

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/builder-core/src/arrange.test.ts` — read right to left, the right
  edge of a field is its start and the right half of a field in a row is before it; both
  cases failed on the code that measured from the left. `arrange-surface.test.tsx` and
  `arrange-surface.test.ts` — each builder's surface passes the direction the browser
  computed, and fails when it passes `ltr` regardless. `apps/docs/src/themes.test.ts` — the
  reading-order cases read every stylesheet the package ships, the builder's included; a
  bar an inset shadow draws down one side has a `:dir(rtl)` rule for the same selector
  drawing it on the other; and a `:dir()` rule is taken out of a stylesheet before its
  sides are counted, which stopped working at the second such rule. `pnpm test:browser` —
  the builder's own layout flips in Chromium and the bar on its selected node moves to the
  right; and no stylesheet the site serves has `:dir()` rewritten as a list of languages.
  The last two failed against the site as Vite's default target built it.
- **Deciders:** Daniel Bacher

## Context

The localisation item asked for right-to-left support in the builder, added and verified.
The rendered form had been verified already
([0113](0113-a-theme-is-written-in-reading-order.md)): its themes are written in logical
properties, a source check keeps them that way, and a browser check flips a form and finds
nothing pinned. The builder had never been looked at, and looking found four things.

**The drag surface measured from the left.** `arrangeDrop` called the left edge of a field
its start and the left half of a field in a row "before". In Arabic or Hebrew both are the
other way round, so a field aimed at the right of another landed on its left — a drop that
contradicts the gesture, in the one interaction a pointer user cannot check by reading.

**The marks CSS cannot write in reading order were on a fixed side.** The selected node in
both trees, the active navigation item, the active typeahead option and all four drop
indicators are a bar drawn down one side with `box-shadow: inset`, and CSS has no logical
box-shadow. Read right to left the bars stayed on the left — so the indicator showed a
field landing on one side while, after the first fix, it landed on the other.

**The source check never read the builder's stylesheet.** Its `themes()` keeps the files
that style a form, which `workbench.css` does not, so every reading-order case read four
stylesheets while its comment said five. Its `background-position` case had a defect of
its own: it removed the `:dir()` rules from a stylesheet by splitting on all of them
joined, which removes nothing once a stylesheet has two with anything in between.

**And the bundler undid `:dir()`.** With the bars mirrored and every source check green,
the browser check still found the bar on the left. Vite's default CSS target is older than
`:dir()`, so Lightning CSS rewrote each `:dir(rtl)` as `:is(:lang(ar), :lang(he), …)` —
a question about the page's language rather than its direction. `dir="rtl"` on a page with
no such `lang` matched none of it. The playground and the landing page were both built that
way, and the four iOS-only rules 0113 added had been shipping in that form since.

## Decision

**The surface asks the browser which way the form reads**, as it asks whether a node sits
side by side: `getComputedStyle(element).direction`, passed to `arrangeDrop` as
`direction`, which measures the pointer from the side a line starts on. Required rather
than defaulted, so a third caller cannot forget it and get left to right.

**Every bar drawn down a side is drawn again for `:dir(rtl)`**, on the same selector, and
the source check holds each rule to its pair — per rule, because the drop indicators name
both sides between them and a per-stylesheet check would pass with none of them mirrored.
A shadow that is not inset is a shadow cast by a light, and is left alone.

**The reading-order cases read every stylesheet the package ships**, through `stylesheets()`,
and `directionScoped` returns each `:dir()` rule on its own.

**The apps that bundle a stylesheet target the browsers it is written for.** `CSS_TARGET`,
at the repository root, is the first release of each with both `:dir()` and `color-mix()`;
the site and the playground both build with it. The browser gate reads what they built
and fails on a stylesheet that names Arabic and Hebrew together — the list the rewrite
writes — having first checked that no stylesheet of ours names a language at all.

## Consequences

**A host bundling the themes with an old CSS target gets the rewrite, and nothing here can
stop it.** That is the cost this record cannot remove: the stylesheets are right, and a
host's build can make them wrong. The themes README says so, names the target, and says a
plain `<link>` needs nothing; the builder READMEs point at it. A host who has not read it
gets a builder that follows the page's language rather than its direction — correct for a
page whose `lang` is Arabic or Hebrew and `dir` agrees, wrong for every other combination.

**The browser floor 0113 named is now enforced on this repository's own builds**, at
Chrome 120, Safari 16.4 and Firefox 113 — Firefox above 0113's 49 because `color-mix()`
arrived in 113, and the stylesheets used it before this.

**The drop indicator still names a side as a value.** `data-drop="wrap-start"` and
`inline-before` are in reading order; what draws them is two rules each. A seventh bar
added without its pair fails the source check before it reaches a browser.

**Measured, not claimed: Chromium only.** The browser gate runs Chromium. That the bars
move in Safari and Firefox rests on `:dir()` being standard there since the releases above,
not on a run.

## Alternatives considered

**`[dir='rtl'] X` instead of `X:dir(rtl)`.** Survives every bundler, and is wrong for a
builder inside an element marked `dir="ltr"` within a right-to-left page — the ancestor
attribute matches through the nearer one. `:dir()` asks the question the browser already
answered.

**Draw the bars with `border-inline-start`.** Logical, so nothing to mirror — and a border
takes space. On the tree nodes that is two pixels every node would carry; on the drop
indicators, which are set on the rendered form's own elements, it would move the form under
the pointer while it is being aimed at.

**Leave the bundler alone and document it.** The repository's own playground was the
first host to get it wrong. A site that demonstrates right to left while serving the
rewrite would be the documented-but-inert failure this repository has shipped before.
