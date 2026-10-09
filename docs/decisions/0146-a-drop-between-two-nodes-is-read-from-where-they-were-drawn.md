# 0146 — A drop between two nodes is read from where they were drawn

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Extends:** [0050](0050-arrange-in-two-places.md), which made the rendered form a drop
  target without the renderer knowing it is one
- **Verified by:** `packages/builder-core/src/arrange.test.ts` — the space between two
  nodes is aimed at the nearer of them and lands between both, never makes a row, is not a
  gap on a child or outside the children, runs across in a row and from the right in a
  right-to-left one, counts only the container's own children, and counts neither a node
  that is not drawn nor a node drawn twice; each of the last three watched failing with its
  rule removed. The same cases in `packages/builder-react/src/arrange-surface.test.tsx` and
  `packages/builder-angular/src/arrange-surface.test.ts`, three of which fail on the
  surfaces as they were. `scripts/arrange-browser-test.mjs`, in `test:browser`: Chromium
  lays out the playground, measures the space between two stacked fields and between two
  top-level sections, says what is under it, and drags into it in both renderers' markup.
  With the surfaces reverted, its four drop checks fail.

## Context

The roadmap listed one arranging gesture as missing: dropping *between* two elements rather
than onto one, "which would need gap targets the renderers do not emit."

What happened in the gap was worse than nothing. A browser reports a pointer in the space
between two fields as over their container, because nothing else is there, and the surface
took the nearest element that names a layout node — the container. Aimed at the container,
a field dropped between two others in a section landed above or below the *whole section*.
Between two top-level nodes nothing names a node at all, since the form itself carries no
layout path, so no drop was offered there. Measured in the playground's default theme on the
date above, those spaces are 18 pixels between two stacked fields, 16 between the fields of a
row and 27 between two top-level sections: wide enough to aim at, and aimed at.

Emitting gap targets, as the roadmap assumed, would mean editor markup in every form the
renderers draw. [0050](0050-arrange-in-two-places.md) keeps the renderer ignorant of the
editor — two inert attributes, read from outside — and a production form would carry drop
zones nobody can use.

## Decision

**The gap is read from where the container's children were drawn.** `gapNeighbour`, in
`@formancy/builder-core`, takes the layout path of what is under the pointer, every node
drawn inside it with its rectangle, and the pointer. When the pointer is within the
children's extent and on none of them, it returns the nearer child, and `arrangeDrop` decides
that child's edge as it would for a pointer on it. Both surfaces ask it first and fall back to
what is under the pointer, so the rule is decided once
([0091](0091-a-second-builder-is-a-binding.md)).

**A side zone is part of the element.** `arrangeDrop` offers a new row only for a pointer on
the element, so a pointer in a gap always moves. The space beside a field is between two
nodes, and giving it a second meaning near the sides of the field above would make one gesture
depend on a few pixels.

**Under nothing that names a node, the container is the form itself** — path `[]`, whose
children are the top-level nodes — and the nodes counted are those inside the element the
pointer is over. A node found there twice means two drawings of one form, as the playground
puts the React and the Angular rendering side by side, and between drawings there is no gap.
A node that is not drawn, such as a closed tab's panel, reports a zero rectangle at the origin
and is not counted, because counting it stretches the extent over a container's heading.

## Consequences

**A node can be put between two siblings without aiming at either.** Inside a container it
lands where the pointer is rather than outside the container; at the top level a drop is
offered where there was none. The renderers are unchanged, and a published form carries
nothing it did not carry before.

**It costs a rectangle per node on every `dragover`** — every node drawn inside what is under
the pointer, which at the top level is the whole drawing. The lookup that turns a field's data
path into its layout path is built once per document now rather than once per element, since
the gap asks it of every node it measures. Neither cost has been profiled.

**A gap is only as wide as the theme makes it.** Where a theme leaves no space there is
nothing to aim at, and the halves of the neighbours decide as before — in the playground's
default theme a row sits flush on the field below it.

**In a table the reading is less obvious.** Between two rows of a grid the nearer cell is the
one aimed at, and which half of it the pointer is beside decides before or after. The
indicator is drawn on that cell, so the landing is shown before the drop; it is not the only
reasonable reading of a pointer between the rows of a grid.

**The Angular surface is held under jsdom only.** No application in the repository mounts it:
the playground's preview is dropped on through the React surface whichever builder is chosen.
The browser check drives that surface over both renderers' markup, which is what decides
whether the space exists and what a browser reports there, and the Angular surface reads the
same function with the same cases.

## Alternatives considered

**Renderers emit gap targets** — an empty element, or an attribute on a wrapper, between each
pair of siblings. Editor markup in every production form, in both renderers, against 0050, and
an element between siblings takes space, so the form being arranged would be laid out unlike
the one published.

**Snap to the nearest child anywhere over the container**, heading included. A container could
then no longer be aimed at by its own heading to move something before or after it, which is
the one place that is unambiguously the container's.

**Keep aiming at the container.** That is what landed a field outside the section it was
dropped into.
