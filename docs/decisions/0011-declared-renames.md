# 0011 — Field keys are identity; renames are declared

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/validate.test.ts` — "rejects renamedFrom
  naming a key that is still in use, because that is a copy", "rejects a field
  that says it was renamed from itself", and "two fields claiming the same dead
  key is rejected — a migration cannot map one column into two";
  `packages/builder-core/src/commands.test.ts` — "a second rename still points
  at the BASELINE key, never at the interim one" and "renaming back to the
  baseline clears renamedFrom entirely". The key grammar itself is pinned by "is
  the identifier grammar, pinned" in `packages/spec/src/schema.test.ts`.

## Context

A field key is what a stored answer is filed under. If a key can change
silently, every submission collected under the old key is orphaned: the data is
still in the database, but nothing in the current schema addresses it, and the
export column it filled stops appearing. This is a frequent and bitter complaint
about form.io, and the kind of loss discovered months later by someone running
a report.

## Decision

The key is immutable identity, separate from the label, which is display text
and may change freely. A rename is **declared**: the same edit that changes the
key also sets `renamedFrom: "oldKey"`, and answers already collected follow the
field.

Semantic validation in `packages/spec/src/validate.ts` refuses a declaration
whose old key still exists elsewhere in the form. If a field still uses that
key, this is a copy rather than a rename, and the two fields would fight over
the same answers. It also refuses a field renamed from itself, and two fields
claiming the same dead key, because a migration cannot map one column into two.

In the builder, `renameField` declares `renamedFrom` against the **session
baseline** rather than against the previous edit, so renaming a field three
times in one session produces one declaration rather than a chain pointing at
interim keys no submission ever used. Renaming back to the baseline removes the
declaration, and the diff goes empty.

## Consequences

**What it buys.** A rename reads as `compatible` in `diffSchemas`
([0015](0015-diff-before-server.md)) rather than as a removal plus an addition,
which is what lets a draft migrate across it.

**What it costs.** The author has to say what they mean. Renaming a key by hand
without adding `renamedFrom` is reported as losing one field and gaining
another, which is what it is. The builder declares for them, so the cost falls
on hand-edited documents and on tooling written against the spec.

**What it forecloses.** Inferring a rename from similarity — of label, of type,
of position. Guessing wrong silently moves one field's answers into another
field, which is worse than the orphaning this decision exists to prevent.

## Alternatives considered

**A synthetic field id, with the key as a display detail.** Rejected: keys are
already the export column headers and the CEL identifiers logic expressions
refer to, so a second identifier would need keeping in sync with the one
everybody actually reads.

**Inferring renames by diffing.** Rejected on the failure mode above.
