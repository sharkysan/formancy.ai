# 0015 — Build `diffSchemas` before there is data to corrupt

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/diff.test.ts`, whose "diffSchemas inside
  containers" block opens with "deleting a required field inside a group is
  lossy — the reviewer repro", and whose "diffSchemas and pages" block pins that
  a page move is no change while a move into a group is a removal plus an
  addition; the fast-check properties "a schema never differs from itself" and
  "never reports a change without a severity and a path". Its one shipped
  consumer is draft migration in `packages/server-core/src/use-cases.ts`,
  covered by the "drafts" tests in `use-cases.test.ts`.

## Context

`diffSchemas` compares two schemas and classifies each change as `compatible`,
`lossy` or `breaking`. It was built in the spec package, before the server
existed and before any submission had been stored.

## Decision

Build it first. It has four consumers — draft migration
([0027](0027-lazy-draft-migration.md)), the builder's "what changed before you
publish" view, export column unioning across versions, and a CI compatibility
gate for consumers — and building it early forces the versioning model to be
thought through while the cost of being wrong is still zero.

It diffs over **data paths** rather than over the document tree, which follows
directly from [0012](0012-pages-scope-nothing.md): pages are transparent, groups
contribute a dot segment, repeaters an indexed one. A declared rename
([0011](0011-declared-renames.md)) translates the paths of everything beneath
it, so renaming a group carries its children along instead of reporting them all
as removed.

## Consequences

**What it buys.** The severity model was settled with no production data to
migrate, and an adversarial review could be run against it for free. That review
found the critical bug: the first implementation walked only the top-level field
list and was blind to changes inside nested containers, so deleting a required
field inside a group classified as `compatible`. Shipped, that would have
silently mismatched stored answers on migration, and the report would have said
everything was fine.

**What it costs.** A function with no caller for several days, which looks like
speculative work while it sits there. It also remains partly speculative: only
draft migration reads it today. CSV export unions its columns from its own walk
of each version's schema rather than from `diffSchemas`, and neither the
builder's "what changed" view nor the consumer CI gate exists yet, so two of the
four consumers that justified building it early are still arguments rather than
code.

**What it forecloses.** Classifying a change by anything other than its effect
on the data — position, label, layout. A change that moves nothing in the
submission has to report nothing, which is why reordering fields and
repaginating a form both come back empty.

## Alternatives considered

**Write it when the server needs it.** Rejected: by then there is data, and the
severity model is being designed against a migration that is already overdue.

**Diff the document tree.** Rejected: it reports page moves as changes and
misses moves into a group, which is the inverse of what the data actually did.
