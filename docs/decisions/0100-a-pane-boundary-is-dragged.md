# 0100 — A pane boundary is dragged, and the row's template is a custom property

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/playground/src/panes.test.ts` for the arithmetic, the
  minimums against the stylesheet's own breakpoint, and the two cascade facts;
  `apps/playground/src/pane-splitters.test.tsx` for the handles on the page, the
  keyboard path, the pointer path and the reset. Fourteen mutations were applied and
  each observed failing the case meant to catch it — including putting the template
  back inline, which is the regression this record also fixes. The behaviour that
  depends on real layout was measured in Chromium, because jsdom has none, and one
  of those measurements contradicted a comment in the first draft.

## Context

Folding a pane away answered a crowded laptop
([#145](https://github.com/sharkysan/formancy.ai/pull/145), merged earlier the same
day as this) and answered it bluntly: a pane is open, or it is a 2.75rem strip.
Neither is what somebody wants while writing a schema, where the editor should have
two thirds of the row, or while filling the form in, where it should have a quarter.

**And that change broke the playground on every screen narrower than 64rem.** It
composed the grid template in the component and set it with an inline `style`, which
outranks every rule in the stylesheet — including the narrow-screen override asking
for a single column, which had been correct until something started shadowing it.
Measured in Chromium at an 820px viewport: the row demanded 992px, the page scrolled
sideways by 187px, and the single visible pane was 304px wide inside an 820px screen.
At 390px the overflow would be 602px.

It shipped, it passed every gate, and it was reported by somebody using an iPad. No
test could have seen it: jsdom applies no CSS and resolves no media queries, so the
cascade this depended on does not exist in the suite.

## Decision

**The row's template arrives as a custom property, and the declaration that reads it
stays in the stylesheet.** `--pane-template` is set inline; `grid-template-columns:
var(--pane-template, …)` is a rule like any other, so the media query can still beat
it. The fallback in that `var()` is the all-open case, which is also what the page
shows before React runs.

**A boundary between two open panes is a draggable `separator`.**

- **One handle per adjacent open pair.** A folded pane gets none: there is nothing to
  resize, and a handle that cannot move is a tab stop that announces a value nobody
  can change.
- **The template and the handles come from one function.** A handle occupies a grid
  column, so the two have to agree about how many there are, and the symptom of
  disagreement would be a layout off by one column with no error anywhere.
- **State is a fraction per pane, not a pixel width.** The minimums stay in the
  template, so the grid still refuses to make a pane unusable, and the thing a drag
  changes is the share of what is left over. A pixel width would have to be
  recomputed on every resize of the window.
- **Clamped at a quarter of each pane's starting fraction**, so a pane cannot reach
  zero — where the handle stops tracking the pointer and dragging back feels broken.
  This is about the state staying coherent; keeping a pane *usable* is the grid
  minimum's job.
- **Keyboard first, not afterwards.** Arrow keys nudge, Home and End go to the ends
  of the travel. A drag with no keyboard equivalent fails WCAG 2.2 SC 2.5.7, and this
  repository's driver contract reaches a control by role and accessible name or not
  at all ([0034](0034-accessible-name-only.md)).
- **Double-click resets**, which is the escape hatch from a bad drag, on the thing
  that went wrong.

## Consequences

**Dragging a boundary can still move the third pane, and the first draft of this said
otherwise.** The arithmetic conserves the pair's fraction exactly, so in fractions the
far pane is untouched. In pixels it is not: once one of the pair reaches its `minmax`
minimum the grid stops shrinking it and redistributes what is left by fraction.
Measured in Chromium at 1440px — dragging the Editor/Form handle 160px right took
Form to its 24rem floor and pulled Engine from 353px to 304px, a pane nobody touched.
That is the grid declining to make the form unusable, which is what the minimum is
for. The comment claiming the far pane never moves survived writing, review and a
green suite; the browser is what disagreed.

**The minimums are now load-bearing twice**, as the floor of a drag as well as of a
window, and they can be raised into a bug. 19 + 24 + 16rem is 59rem against a 64rem
breakpoint, so there are 5rem of travel on the narrowest screen that shows three
panes; raise one minimum far enough and the row overflows the moment the side-by-side
layout appears. A test reads the breakpoint out of the stylesheet and compares, because
the two going out of step is the whole failure.

**Pointer-to-fraction is a linearisation, not a model.** It divides by the left pane's
measured width at the moment of the press. CSS grid's track-sizing algorithm with a
`minmax` minimum is not a proportion, and reimplementing it to move a handle would be
absurd; the approximation is wrong only near a minimum, where the grid refuses to move
anyway, and it cannot drift because every move measures from the anchor rather than
accumulating.

**A fraction is rounded to three decimals, before the clamp rather than after.**
Rounding afterwards moved the stop — a floor of 0.3125 came out as 0.312, half a
thousandth below the value being enforced. Harmless, and still a function not doing
what it says.

**The page gave up the last of its pane state.** `app.tsx` went past its size ceiling,
and the budget was pointing at something real rather than being in the way: which pane
is folded, how wide each is, and the template that follows are not the page's business.
They live in `panes.tsx` with the rest of that subject, which is what its docblock
already claimed.

**On a touch screen the handle needs `touch-action: none`**, or iOS claims the gesture
for scrolling and the feature works on a trackpad and is absent on the device it was
asked for. Below the breakpoint the handles are hidden rather than unrendered, so the
one-pane-at-a-time switcher does not move the focus order under somebody on every tap.

**The handle is 12px wide against SC 2.5.8's 24.** The criterion is met through its
spacing exception rather than by size: the handle runs the full height of the row with
no other control within 24px of it, and a handle wide enough to pass on size alone
would eat the layout it exists to adjust. The keyboard path and the fold button are
both there as well. Reviewed, not verified — no test here can measure a box.

## Alternatives considered

**A resize observer and pixel widths.** Rejected: every window resize would have to
redistribute saved pixels, and the first awkward case is the one this page is for —
a narrow window where the saved pixels do not fit.

**`resize: horizontal` on the panes.** Almost free, and wrong in three ways: it resizes
one element rather than moving a boundary, so the row's total changes and the layout
breaks; the handle is a corner, not an edge; and there is no keyboard path at all.

**Pointer capture instead of window listeners.** `setPointerCapture` is the tidier API
and would keep a fast drag attached to a 12px handle, which is the problem window
listeners also solve. Rejected because jsdom does not implement it, so the pointer path
would have had no test at all — and this is a change whose first version was wrong in
exactly the part no test could see.

**Leaving the template inline and adding `!important` to the media query.** The
one-line fix for the iPad bug on its own. Rejected: it wins that specific race and
leaves the next inline property shadowing the next rule, and `!important` in a
stylesheet is a note saying something else is wrong.

**Persisting the widths.** Rejected for consistency rather than difficulty — nothing in
this app persists, and one setting that did would be the odd one out. If the panes are
ever worth remembering, so are the theme, the locale and the demo.
