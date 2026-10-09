# 0148 — The arrange surface's marks follow the DOM, not its own render

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-react/src/arrange-surface.test.tsx` — an element
  something else puts into the preview can be picked up, and is let go of when arranging
  stops; `packages/builder-angular/src/arrange-surface.test.ts` — the first of those. Each
  fails on the surface as it was. `scripts/arrange-browser-test.mjs`, in `test:browser` —
  after a drop, as many nodes in each preview can be picked up as before it, and the
  canton a rule shows can be picked up; with the surfaces as they were, the Angular
  preview's first check fails at 33 before and 0 after, and the React preview's canton
  arrives unmarked.

## Context

The arrange surface puts `draggable` and a mark on every element of the preview that names a
layout node, because the markup is the renderer's and the renderer knows nothing about editing
([0050](0050-arrange-in-two-places.md)). It did so when the surface itself rendered — in React,
an effect on the document and its children; in Angular, an effect on the session's view.

The preview is not always redrawn then. Writing the browser check for
[0146](0146-a-drop-between-two-nodes-is-read-from-where-they-were-drawn.md) made two drags on
one page, and the second did nothing in the Angular preview: the playground holds that preview
inside the React surface, a drop changes the document, the surface re-marks in its render, and
Angular then replaces its markup on its own schedule with elements nobody marked. Measured in
Chromium, the Angular preview went from 33 nodes that could be picked up to none after one drop.
The same happens without a second framework. A hidden field leaves the DOM, and when a rule
shows it, its own slot mounts it without the surface rendering: in the React preview, the
canton appeared unmarked once Switzerland was chosen. A tab strip does not do it — both
renderers keep every panel in the DOM and only hide the closed ones.

## Decision

**The marks are kept up with the DOM.** While arranging is on, each surface observes the
elements arriving in the tree under it — a `MutationObserver` on `childList` across the
subtree — and marks those that name a node. The marks are attributes, so putting them on does
not trigger the observer again. What was marked is a set, pruned of elements no longer in the
document, and everything in it is let go of when arranging stops. Both surfaces do it, for the
reason both have one ([0091](0091-a-second-builder-is-a-binding.md)).

## Consequences

**Whatever draws the preview, and whenever, what it draws can be picked up** — the other
framework's preview in the playground, or a field a rule has just shown.

**It costs a scan of the surface's tree for each batch of arrivals while arranging is on.** A
batch is what a browser delivers to an observer at once, not each element, and the scan skips
what is already marked; nothing here has been profiled.

**A mark can briefly lag an arrival.** The observer is told after the change, in a microtask,
so an element added and pressed within the same task would not yet be draggable. No gesture
does that, and the check that found the defect drags after the preview has settled.

## Alternatives considered

**Mark on pointer-down**, the element pressed and nothing else. Smaller, but it depends on when
each browser decides an element is draggable relative to the press, which is not specified and
was not measured here.

**Ask the host to tell the surface when the preview changed.** The host does not know either —
in the playground, Angular's scheduling decides it — and an API somebody must remember to call
is the shape the defect already had.

**Have the renderers emit `draggable`.** Editor markup in every production form, against 0050.
