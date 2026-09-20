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

---

## Addendum, same day — the property panel

The panel that edits a field's properties is **generated from
`packages/spec/formancy.schema.json`**, not written out per field type.

The schema already says which properties belong to which type: that is what its
`allOf` / `if` / `then` branches are for. `editablePropertiesFor(type)` reads
them, and takes each control's label and hint from the schema's own `title` and
`description`, so the builder and the generated spec reference cannot disagree
about what a property means.

The alternative is twelve hand-written panels that rot within two releases —
somebody adds a property to the spec, nobody remembers the panel, and the
builder quietly cannot set it. Verified by tests asserting that a text field is
offered `pattern` and not `min`, a number field the reverse, and a repeater its
own four; none of those lists appears in the builder's source.

Four properties are deliberately excluded. `key` is a rename, which carries
`renamedFrom` semantics and has its own command — typing over it in a text box
is how answers get orphaned ([0011](0011-declared-renames.md)). `fields` is
structure, which the tree edits. `type` would be a different field.
`renamedFrom` is written by the session, never by a person.

`options` is offered as a named gap rather than rendered generically: it is a
list of value/label pairs, and the generic path would produce a textarea full
of JSON, which is worse than saying it is not editable here yet.

The panel reads the field from the session rather than taking it as a prop.
Handed a definition captured before the edit, its controlled inputs never see a
new value, so every keystroke resets the box and only the last character
survives — and a consumer wiring it the obvious way would reproduce that
exactly. Found by a test typing three characters and getting one.
