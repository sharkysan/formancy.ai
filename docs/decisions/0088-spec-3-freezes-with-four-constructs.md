# 0088 — Spec 3 freezes with four constructs, not one

- **Status:** accepted
- **Date:** 2026-09-29
- **Extends:** [0051](0051-spec-2-adds-types.md), which said what a later version means;
  this one says what went into this later version and why they travelled together
- **Deciders:** Daniel Bacher
- **Verified by:** the per-construct suites — `signature.test.ts`, `tagpicker.test.ts`,
  `check-rule.test.ts` and `skip-rule.test.ts` in `@formancy/spec`, each holding that its
  construct is refused in a version 2 document **by name and with the version it needs**.
  `apps/docs/src/claims.test.ts` fails when `MIGRATIONS.md`'s *"What version 3 added"*
  section does not name every one of them, derived from the code rather than from a list
  somebody maintains.

## Context

Version 3 opened with `signature` and closed with four constructs in it: the `signature`
field type, the `tagpicker` widget, and the `check` and `skip` rule kinds — plus
`optionsSource` widening to a list-valued field.

That was a decision, taken four times. The roadmap has said since version 2 that **field
types should arrive in batches, not one at a time**, because each version bump is an event
for every consumer: a pinned reader, a regulatory characterisation, a line in
`MIGRATIONS.md`, and a deployment that has to upgrade its readers before its documents.
Shipping `signature` in 3 and `tagpicker` in 4 a fortnight later spends two of those where
one would do.

Each construct was in turn the one that could have been deferred, and each time the
question was the same: is there anything else that would need a version anyway? While the
answer was yes, the version stayed open.

## Decision

**Version 3 is frozen as of `0.3.0`**, and holds exactly what the list above says.

The batching rule is now written down as what it is: a version stays open while something
else that needs one is close, and closes when nothing is. `skip` was the last of those —
conditional page routing had been deferred only because a wizard was something an author
could not make, and [0081](0081-a-page-absorbs-the-form-it-joins.md) removed that reason.

**What is NOT in version 3, and would have been the fifth:** nothing that was named. The
roadmap's remaining items are a builder route to the two new rule kinds (no format change),
XLIFF (a file format, not a document one), and un-paging a form (a command). None needs a
version, which is the signal that this one is done.

## Consequences

**Three frozen versions, and each has to keep working.** A version 1 document still
validates, a version 2 document still validates, and both still upgrade in one line. The
cost of that is paid in `validateSchema`: the gate is per construct now rather than per
version, which it had to become the moment there were three
([0083](0083-a-signature-is-points-or-a-name.md) records the moment it was found).

**A `0.2.0` deployment cannot read what `0.3.0` writes.** This is the sharpest such step so
far, because the builder now writes version 3 by default — a form authored after this
release is unreadable by a reader pinned to the previous one, loudly. `MIGRATIONS.md` says
upgrade the readers first, and the refusal is a validation error rather than a dropped
answer, which is the only reason this is affordable at all.

**Version 4 starts empty, and should stay empty for a while.** The rule that produced a
four-construct version 3 is the same rule that says the next one waits: an open version is
a place to put the next thing that needs one, and closing it early is what makes the
following change expensive.

## Alternatives considered

**Freeze after `signature`**, in a release of its own. Rejected on the batching rule, and
the three constructs that followed within days are the evidence for it: `tagpicker`,
`check` and `skip` would have been versions 4, 5 and 6, each with its own migration note
and its own upgrade for every pinned reader.

**Leave version 3 open indefinitely** and freeze only when a consumer asks. Rejected
because "open" is not a state a document can be written against with confidence: a form
declaring an unfrozen version is a form whose meaning could still change, and the whole
value of the version line is that it cannot.

**Fold the two rule kinds into version 4** and freeze 3 with the two field constructs.
Rejected as the worst of both: two versions, two migrations, and a reader that speaks 3 and
not 4 for no reason a user could describe.
