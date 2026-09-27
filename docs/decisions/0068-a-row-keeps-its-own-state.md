# 0068 — A row keeps its own state

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/engine-row-order.test.ts` (9 cases: the removal bug
  in both directions, a move forwards and backwards, touched-ness travelling with the
  row, ids travelling with the row, a no-op move notifying nothing, an out-of-range
  index throwing, and a move being visible as a value change).
  `packages/react/src/row-order.test.tsx` and `packages/angular/src/row-order.test.ts`
  (6 and 6 cases: the buttons' accessible names carry the position, they are absent at
  the ends, they reorder, and a move made outside the form still redraws). Reverting the
  row-id subscription in either renderer fails the redraw case; reverting `remap` fails
  the removal cases.

## Context

The engine had `addRow` and `removeRow` and no way to reorder. `layout.tsx` said outright
that rows do not reorder while a form is being filled in, and the v0.1 cut had put
reordering out of scope. Rows have carried a stable `_id` from the start, and
`value.ts` says renderers may key by identity "across reorders" — so the data model was
built for this and nothing used it.

**Adding the method turned up a bug in the one that already existed.** Touched-ness gates
error presentation: `aria-invalid` and visible error text appear only on a field that is
both invalid *and* touched, so a pristine form does not open by shouting. It is stored as
a set of wires — `items[1].name` — which means it is keyed by a row's **position**, and a
position is not an identity.

Measured, before anything was written:

1. Two rows, both required and empty.
2. Visit the first, try to submit.
3. Remove the first row.
4. The surviving row — which nobody ever visited — reports `touched: true`,
   `errors: ['required']` and `aria-invalid="true"`.

A person is shown an error on a field they have not reached, and a screen-reader user is
told a field is invalid before arriving at it. `removeRow` had always done this. Nothing
caught it because the test that would have is about two rows and one removal rather than
about one row.

Reordering is the same defect with a bigger blast radius: a removal shifts a suffix by
one, a move shifts the whole span between two positions, so every row passed would
inherit a stranger's state. Adding `moveRow` on top of position-keyed state would have
turned a rare confusion into a routine one.

## Decision

**`moveRow(path, from, to)` on the engine, and state is remapped with the rows in both
operations.**

The remapping lives in `interaction.ts`, where the set does. The engine decides *which*
rows moved; it should not have to know how touched-ness is stored in order to say so.
`remap` takes a transform from wire to wire, or to nothing for a row that is gone.

**Errors need no remapping**, because they are recomputed from values: a row that moves is
re-validated where it lands. Touched-ness is the only position-keyed state today, and the
helper is written so a second one goes in one place.

**A move is a value change**, so it notifies like any other and anything derived from
`items[0]` recomputes. A move to where the row already is changes nothing and notifies
nothing — a cancelled drag should not re-render every row of every subscriber.

**An out-of-range index throws**, as `removeRow` does. A silent clamp would move a row
somewhere the caller did not ask for, and a drag ending off the end of the list is exactly
how that gets called.

**Buttons, not a drag, and that ordering is the point.** WCAG 2.5.7 requires a non-drag
equivalent for any drag operation, so a drag affordance can only ever be a second route to
these. This repository built the builder's move palette before its drag surface for the
same reason. The accessible name carries the position and says where the row goes — "Move
Item 2 of 3 up" is a sentence somebody can act on without counting rows first.

**Absent at the ends rather than disabled.** A disabled button is still in the tab order in
some browsers and announces a control that does nothing; a row that cannot move up simply
has no such button.

## Consequences

**Both renderers had the same latent bug, with the same comment.** `useRepeater` memoised
its row ids on `rowCount` because "the engine mints an id when a row is created, so the
count changing is exactly when the ids change" — true until rows could be reordered.
Angular's `injectRepeater` said it too, and `rowCount.set` with an equal value notifies
nothing, which is correct and was also why a move did not redraw. Both now read through a
subscription, and reverting either fails a test.

**Focus is still lost on a reorder, and that is a limitation rather than a decision.** A
row's container is keyed by the row's stable id and travels. Its children are keyed by the
positional wire, which changes when the row moves, so every control inside is recreated
and focus goes nowhere.

Keying children by the field's key within the row fixes it, and was **reverted** after
being made. In Angular the same change lets the framework reuse a component whose path is
read once in `ngOnInit` and never rebound, so after a row removal it binds to the old wire
and shows the previous row's answer — caught by an existing conformance fixture, which is
the system working. One renderer keeping focus and the other not is exactly the
framework-specific divergence this architecture exists to prevent
([0033](0033-one-suite-n-drivers.md)), so both wait for reactive path binding in Angular.

A test in each renderer pins the limitation, so fixing it fails them and prompts their
removal along with the comments explaining the revert.

**No drag affordance yet**, deliberately. The keyboard route is the one that has to exist;
a drag surface is a second route to `moveRow` and belongs with the datagrid control, where
a table of rows makes dragging the obvious gesture.

## Alternatives considered

**Keying touched-ness by row id instead of by position.** The principled fix: identity is
what the state belongs to. Rejected as much larger than it looks — every wire in the
engine is positional, so this would mean a second addressing scheme for one set, and
`isTouched(path)` callers would all need translating. The remap achieves the same
observable behaviour at the two moments positions change.

**Clearing touched-ness for the whole repeater on any row change.** Simple, and wrong in
the other direction: submitting touches every field so that all remaining errors appear at
once, and clearing on a removal would hide errors the person has already been shown.

**Leaving `removeRow` as it was and only adding `moveRow` correctly.** Rejected: the bug is
the same bug, and shipping a fix for the new operation while the existing one kept
mislabelling rows would leave the harder-to-find half in place.

**A drag affordance in this change.** Rejected on sequencing, not on merit. Building the
drag first is how a product ends up with a reorder only a pointer user can reach, and the
repository has already decided that once.
