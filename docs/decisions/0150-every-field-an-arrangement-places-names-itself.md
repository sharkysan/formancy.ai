# 0150 — Every field an arrangement places names itself on the preview

- **Status:** accepted; what a placed group draws decided by
  [0151](0151-a-group-placed-whole-is-drawn-as-its-fields.md)
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/react/src/field-path.test.tsx` and
  `packages/angular/src/field-path.test.ts` — for every type in the spec's `FIELD_TYPES`, a
  form placing one field of it must draw exactly one element carrying its path; the table of
  types is keyed by `FieldType`, so a type added to the spec without an entry is a compile
  error. Both failed on a static text and a repeater, and on nothing else. Both builders'
  `arrange-surface.test` — a repeater is picked up and a row's field is not, and a drop on a
  row is a drop on the repeater; the drop failed on both surfaces as they were.
  `scripts/arrange-browser-test.mjs`, in `test:browser` — the playground's static intro and
  its `items` repeater can be picked up in both renderers' markup; all four failed with the
  renderers as they were.

## Context

The arrange surface finds the field under a pointer by the inert `data-formancy-field-path`
the renderers emit, which [0050](0050-arrange-in-two-places.md) says is on every field. Two
types did not carry it, in either renderer:

- **A static text** was a bare paragraph, so the playground's intro could not be picked up on
  the preview — found trying to drag it while writing the check for
  [0146](0146-a-drop-between-two-nodes-is-read-from-where-they-were-drawn.md).
- **A repeater's fieldset** named nothing, while its rows' fields named themselves —
  `items[0].name`, which no arrangement places. The surface took the nearest element naming
  anything, so a pointer on a row stopped at the row's field, found no node and aimed at
  nothing, and the repeater could be dropped on only by its legend.

## Decision

**Both renderers emit the path on a static text and on a repeater's fieldset.** And **both
surfaces take the nearest element that names a node of the arrangement**, walking past one
that names a field no arrangement places. A test in each renderer derives the types from the
spec and requires one element naming each placed field, so the next type cannot be drawn
without it.

Three types are excluded, each with its reason in the test: `hidden` draws nothing; a `page`
cannot be placed, since an arrangement reads through it; and a placed `group` — which the
validator accepts, and which **both renderers throw on** (`Unknown field`). What a placed
group should draw is not decided here; it is recorded as debt in
[§11.2](../architecture/11-risks-and-debt.md).

## Consequences

**Everything an arrangement places can be picked up on the preview**, and a repeater from any
point inside it.

**A published form carries two more inert attributes**: on a static text's paragraph and on a
repeater's fieldset. A consumer's stylesheet or test selecting `[data-formancy-field-path]`
now matches those as well — a repeater's fieldset among them, around the row fields it
already matched.

**The guard is only as wide as its minimal fields.** Each type is drawn with the least it
needs; a variant drawn by another component — a widget — is not rendered by it, and is
covered only where that component reuses the field's shell.

## Alternatives considered

**Teach the surface to find a static text or a repeater some other way** — by its part name,
or by its position. Two answers to "which field is this" where the attribute is the one the
renderers already promise, and a second one for the next type that forgets it.

**Treat a row's field as its repeater.** It is a field of a row, not of the arrangement; the
surface would be translating a data path it was never meant to read.
