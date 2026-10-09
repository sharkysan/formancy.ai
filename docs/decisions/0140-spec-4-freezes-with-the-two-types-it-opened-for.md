# 0140 — Spec 4 freezes with the two types it was opened for, and nothing opens version 5 yet

- **Status:** accepted
- **Date:** 2026-10-09
- **Extends:** [0088](0088-spec-3-freezes-with-four-constructs.md), whose batching rule this
  applies again, and [0104](0104-spec-4-opens-with-a-widget-not-a-type.md), which opened the
  version this closes
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/spec-version.test.ts` — every field type and widget is in a
  version's own list, so one added to the vocabulary and to no list fails, which is what makes
  the freeze mechanical; adding a type to `FIELD_TYPES` alone was watched failing.
  `apps/docs/src/claims.test.ts` — every version the code speaks has a *FROZEN* heading in
  `MIGRATIONS.md` and none says *OPEN* (watched failing with version 4's heading put back), and
  the version 4 section names every type and widget the code attributes to it. The
  per-construct suites — `ranking.test.ts`, `matrix.test.ts`, `rating-slider.test.ts`,
  `mask.test.ts`, `option-image.test.ts` — each refuse their construct in a version 3 document,
  with an error that names the construct.

## Context

Version 4 opened with two widgets and a property
([0104](0104-spec-4-opens-with-a-widget-not-a-type.md)) and was kept open for the two survey
constructs that are types: a ranking and a matrix. Both are built
([0138](0138-a-ranking-stores-the-order-chosen.md),
[0139](0139-a-matrix-answers-one-question-per-row.md)). In between it gained the `mask`
property and pictures on options.

The rule from version 3 is the question: is anything else close that needs a version? The
roadmap's remaining item is XLIFF, an exchange file rather than a document construct. Nothing
named needs one.

## Decision

**Version 4 is frozen**, and holds the `ranking` and `matrix` field types, the `rating` and
`slider` widgets, and the `step`, `mask` and option `image` properties. It is first released
with 0.4.0.

**No version is open.** Version 5 opens when a construct needs one, and not before: an open
version is a format nobody can write a document against with confidence, and keeping one open
"in case" is what 0088 rejected.

**The freeze is a test, not only a heading.** While version 4 was open, a construct in no
version's list was taken to be in the newest — right for an open version, and exactly the leak
a frozen one must not have: a type added to the vocabulary and to no list would be accepted in
a version 4 document, which the readers already shipped as version 4 cannot read. So the whole
vocabulary of types and widgets must now be the version lists, and growing it means opening the
next version first.

## Consequences

**A 0.3.0 reader cannot read what 0.4.0 writes**, loudly, as at every version so far.
`MIGRATIONS.md` says to upgrade the readers before the documents.

**The next construct costs a version event.** Anything that changes what a document may say —
a type, a widget, a property, a rule kind — opens version 5, with its migration note and its
upgrade for every pinned reader. That is the cost the batching rule accepts on purpose.

**Properties and rule kinds have no whole-vocabulary check.** They are gated construct by
construct; a property added without its version gate would be caught by the per-construct
tests only if somebody wrote one. The safety analysis (E5) says so.

**Two things found while closing it were defects in the version itself**, and are fixed before
the freeze rather than after it: a ranking accepted pictures on its options that it never drew,
and the version check attributed every type after version 2 to version 3, so a version 3
document carrying a version 4 type was accepted.

## Alternatives considered

**Keep version 4 open for whatever comes next.** Rejected for the reason 0088 gives: "open" is
not a state a document can be written against with confidence, and a manufacturer
characterising version 4 needs it to stop moving.

**Freeze and open version 5 at once**, so there is always a place for the next construct. It
would make the source write an unfrozen version again from the day after the release, which
is the state this ends.

**Leave the freeze as prose.** Every earlier freeze was, and the fallback in the version check
was found wrong the moment a fourth version added a type. A heading cannot fail.
