# 0094 — The second builder reaches parity, and the drop geometry is shared rather than copied

- **Status:** accepted
- **Date:** 2026-10-02
- **Extends:** [0091](0091-a-second-builder-is-a-binding.md), whose claim this is the last
  test of, and [0050](0050-arrange-in-two-places.md), which decided the rendered form is a
  drop target. [0046](0046-keyboard-before-drag.md) is why there was a keyboard path to be a
  second route to
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/arrange.test.ts` (9 cases on the geometry, with
  no DOM). Observed failing five ways: no minimum width, no cap on the side zone, side zones
  offered inside a row, the axis fixed to `block`, and the self/ancestor refusal removed.
  `packages/builder-angular/src/arrange-surface.test.ts` (12 cases, the React suite's
  assertions), observed failing five ways against the component.
  `packages/builder-react/src/arrange-surface.test.tsx` (22 cases, unchanged) is what proves
  the extraction was behaviour-preserving — it was not edited, and it still passes.
  `apps/docs/src/builder-layering.test.ts` holds that none of this drags a framework into
  `builder-core`.

## Context

`@formancy/builder-angular`'s README named exactly one thing it did not have: dragging on the
rendered form, the surface `builder-react` puts over a live preview. It also said *"everything
it would call is in `@formancy/builder-core` already, so it is a directive rather than a
design"*.

That was half true, and the half that was wrong is the interesting part. The session commands
were shared. **Where a drop lands was not** — it was 80 lines inside
`builder-react/src/arrange-surface.tsx`: which part of an element is a side zone, how wide an
element has to be before its sides are worth aiming at, the cap that stops a very wide field
being all edge, that a node already inside a row has no side zones because left and right
already mean before and after, and which axis the indicator runs along.

Every one of those is a decision about what a pointer means, and a user asks it by pointing
at one place. Two implementations would be two answers, and the difference would show up as
"the drag works differently in the Angular builder" — the exact class of complaint
[0091](0091-a-second-builder-is-a-binding.md) exists to prevent.

## Decision

**`arrangeDrop` moves to `@formancy/builder-core`, and takes geometry as plain numbers.**

It is given the document, the layout, the dragged and hovered layout paths, a rectangle, a
pointer position, and whether the hovered node already sits side by side with its siblings. It
returns a move with its axis, a wrap with its side, or nothing. No DOM: this package compiles
with no DOM library ([0008](0008-layered-packages.md)), so the rectangle is a structural
`Box` rather than a `DOMRect` — structural so that passing a real `DOMRect` needs no cast.

**`sideBySide` is asked of the caller rather than derived from the document**, and that is the
one piece of knowledge that stays per framework. Whether a node was laid out side by side is a
fact about what the renderer *did* — a table child that spans is wrapped in a `layout-cell`, so
its parent is the cell and the table is one step further up — and predicting it here would mean
reimplementing the renderer inside the builder.

**Each builder keeps its own event plumbing.** Reading a pointer, marking elements draggable,
drawing the indicator attribute, and announcing the outcome through a live region are done in
React's idiom and in Angular's, because that is what a binding is.

## Consequences

**The claim in 0091 holds, and the measurement is less flattering than the slogan.** What
decides anything is now 67 lines of shared code with no framework in it. What each builder
needs on top is about 190 lines of event plumbing — 181 in React, 198 in Angular. So a second
builder is a binding rather than a second builder, as 0091 said; but a binding for this
feature is **not** nearly free, and the honest figure is roughly the same amount of code
again. 0091 accepted that cost explicitly and this is the bill arriving.

**The React surface got smaller and was not otherwise touched.** 315 lines to 255, and its 22
cases were not edited — which is the only reason to believe the extraction changed nothing.

**A side zone is now testable without a layout engine.** jsdom gives every element a zero
rectangle, so the React suite could never see a side zone at all: its drag tests aim at
`box.left ± 1` and rely on the sign. The geometry cases pass real numbers and assert the
boundaries directly, including the cap and the minimum.

**And one comment this inherited was wrong.** `SIDE_ZONE_MINIMUM`'s note claimed it was what
kept a zero-sized element from being treated as all edge. It is not: with a width of zero the
zone is zero too and neither comparison at the edges holds, so the drop is a move whatever that
constant says. Found by removing the check and watching the zero-size case stay green. The
correction is in the code, because believing the wrong guard protects something is how the
real one gets deleted as redundant.

**The Angular builder is still demonstrated nowhere.** No application mounts
`@formancy/builder-angular`. That is a gap this record does not close and should not be read as
closing: parity with the React builder is a property of the tests, not something an evaluator
can see. Recorded in `docs/architecture/11-risks-and-debt.md` and on the roadmap.

*Since this was written, the renderer half was closed:* the playground mounts
`@formancy/angular` beside React over one schema
([0095](0095-one-schema-two-renderers.md)). The builder half stands.

## Alternatives considered

**Copy the geometry into the Angular surface**, which is what the README's "it is a directive
rather than a design" implied was left. Rejected: the two would drift, and the drift is
invisible until somebody drags in both builders and notices the side zone is a different width.
This is the same argument that moved the condition compiler and the two drop models in 0091.

**Pass the element and let `arrangeDrop` measure it.** Rejected because it puts `HTMLElement`
in `builder-core`'s signature, which is the DOM dependency 0008 forbids — and the forbidding is
load-bearing here rather than tidy, since `builder-core` is also what a non-browser tool would
use to edit a document.

**Derive `sideBySide` from the layout document.** Rejected: it would require the builder to know
how each renderer lays a container out, which is the coupling the headless design exists to
avoid. The caller is already holding the element and can answer in four lines.

**Make the Angular surface a directive** rather than a component, as the README guessed.
Rejected on one concrete thing: the live region. The surface has to render a `role="status"`
element of its own, and a directive has nowhere to put it without reaching into the host's
template — so it would announce nothing, and a drag that changes the document silently is a
change somebody using a screen reader with a pointer never hears about.
