# 0046 — Build the builder's keyboard path before its drag surface

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-react/src/builder.test.tsx` drives the
  whole editor through `userEvent` and never a pointer except to click a
  palette entry: one tab stop, arrow navigation in reading order, `aria-level`
  per depth, `m` opening described destinations, moving, cancelling, `Delete`,
  a refusal that explains itself, `Ctrl+Z`, and focus surviving the removal of
  the focused row. `packages/builder-core/src/session.test.ts` pins that every
  position in a container is offered and that every offered target is accepted.

## Context

WCAG 2.2 SC 2.5.7 requires every dragging movement to have a single-pointer or
keyboard alternative that achieves the same outcome. The plan called this out
as the legal requirement that makes the builder larger than it looks, and said
to build the keyboard command path *before* the drag affordance.

The reason is not sequencing hygiene. A drag surface built first is a drag
surface demonstrated first, and the keyboard path becomes a follow-up ticket
competing with features — arriving late, thinner, and as a parallel
implementation that drifts.

## Decision

`@formancy/builder-react` ships with no drag surface at all. The structure
editor is an ARIA tree with roving tabindex, arrow navigation, and commands on
the focused item. When a drag surface arrives it will call the same session
commands, as a second way to reach them.

Destinations are described in words — "Billing address, between Street and
City" — because a keyboard alternative made of `{ parent: ['billing'], index: 1 }`
satisfies the letter of the criterion and helps nobody.

## Consequences

**What it buys.** The alternative is the implementation, so it cannot lag
behind the pointer path or be quietly dropped. Every command is reachable and
announced, and the tests are the conformance evidence.

**It found two defects that a pointer-first build would have hidden.**

`validTargets` offered only the *last* position in each container, because it
decided legality by appending. With a drag surface that is invisible — you drop
where you like and the code computes an index. Through a keyboard palette it is
the whole feature: you could move a field to the end of a group but never
between two of its fields. Legality is now tested once per container and every
position is offered, which is also cheaper than testing each index, since
nothing the validator checks depends on where among its siblings a field sits.

The descriptions named the wrong neighbours when moving within one container,
because the index counts the list after the field is lifted out and the
sentence was built from the list before. Nobody would notice dragging. Someone
listening would be told "between Customer and Billing address" about a
destination that is after Billing address, with Customer — the field in their
hand — named as a landmark.

**What it costs.** No pointer affordance yet, which is the interaction most
people expect from a form builder and the one a demo wants. That is a real gap
in the product until the drag layer lands.

Two smaller ones, both found by testing: the component must not take focus when
it mounts, or it steals it from whatever the person was doing — so it moves
focus within the tree and never into it. And a removed row detaches its own
focused element, so the tree has to deliberately keep focus across a command or
it silently stops responding to the keyboard after the first `Delete`.

## Alternatives considered

**Drag first, keyboard after.** Rejected: it is the failure mode the criterion
exists to describe, and the two defects above are what it would have shipped.

**A generic "move up / move down" pair instead of a destination list.**
Rejected. It cannot express moving into or out of a container, so a keyboard
user could not build a nested form at all — an alternative that does less is
not an alternative.
