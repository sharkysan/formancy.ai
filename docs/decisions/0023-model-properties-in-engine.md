# 0023 — Model properties are honoured by the engine, not by renderers

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/repeater.test.ts`, the `minItems` block —
  "the engine opens with the minimum number of rows", "seeding tops up a short
  initial value rather than replacing it", "an initial value above the minimum
  is left alone" and "seeding is idempotent — building twice yields the same
  shape". `packages/conformance/fixtures/repeating-group.json` then holds it
  across renderers: its first step expects `contacts[0].name` and
  `contacts[0].email` to be visible before any `addItem`, and that fixture runs
  through both renderer drivers ([0033](0033-one-suite-n-drivers.md)).

## Context

`minItems` on a repeater was originally seeded by each renderer in a mount
effect. React's StrictMode double-invokes effects in development, so a repeater
declaring `minItems: 1` mounted with two empty rows. Nothing caught it: the bug
was found by screenshotting the playground, because both renderers were
believed to be doing the same thing and no test asked either of them what the
row count was on open.

## Decision

`minItems` describes what the data must be, so the engine honours it. The
engine tops up each repeater to its minimum while building, before any renderer
exists, and React's seeding effect was deleted.

The general principle, of which this is one instance: if a property describes
what the data must be, the engine enforces it; if it describes how something
looks, the renderer decides. A property enforced in two renderers is a property
that will eventually be enforced differently in two renderers.

## Consequences

**What it buys.** The rule lives in one place, applies wherever the engine runs
including on the server ([0006](0006-one-engine-build.md)), and StrictMode has
nothing to double because there is no effect. Seeding is idempotent, so
rebuilding an engine over its own output is a fixed point — which matters for
draft resume ([0027](0027-lazy-draft-migration.md)).

**What it costs.** The engine gained a responsibility that can be argued as
presentational: it now writes rows into the submission value that the user
never created. The counter-argument is that a repeater promising one row and
showing none is wrong in the data, not on the screen.

The clean-up is also incomplete, and in a way that proves the principle.
`packages/angular/src/form.ts` still tops up to `minItems` in an `ngOnInit`
effect over the row-count signal. While the engine seeds first the effect finds
no shortfall and does nothing, so nothing is visibly broken — but `removeRow`
enforces no floor, so deleting the last row of a `minItems: 1` repeater
re-seeds it under Angular and leaves it empty under React. Two renderers,
already diverging on the property this record moved out of them.

## Alternatives considered

**Keep seeding in the renderers, guarded against StrictMode.** Rejected: it
fixes the symptom in one renderer and leaves the duplication that caused it.

**Treat `minItems` as validation only, and reject a short array on submit.**
Rejected: it tells someone their form is wrong instead of opening with the row
the schema promised, and it would leave the server and the client disagreeing
about what an empty form is.
