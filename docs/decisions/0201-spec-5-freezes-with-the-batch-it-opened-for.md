# 0201 — Spec 5 freezes with the batch it was opened for, and nothing opens version 6 yet

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0194](0194-spec-5-opens-with-a-fields-description.md), which opened the version
  this closes, and [0140](0140-spec-4-freezes-with-the-two-types-it-opened-for.md), whose freeze
  this repeats
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/claims.test.ts`, *says every version the code speaks is frozen,
  and none is open* — every version in `SPEC_VERSIONS` has a FROZEN heading in `MIGRATIONS.md` and
  none says OPEN; it failed with version 5's heading still OPEN. The version 5 constructs are each
  refused in a version 4 document by their own suites — `description`, `autocomplete`,
  `placeholder`, `default`, `rule-message`, `exclusive` and `shuffle` tests in `packages/spec` —
  and `version-ledger.ts` is a `Record` over each type a document is made of, so a property added
  with no version does not compile.

## Context

Version 5 opened for a batch the gap survey named (0194): help text, an autofill hint, a
placeholder, a default value, a rule's own message, and a choice's extras — "Other, please
specify", an exclusive "None", and a shuffled order. Each is built
([0194](0194-spec-5-opens-with-a-fields-description.md)–[0200](0200-options-can-be-shown-in-a-shuffled-order.md)),
except "Other, please specify", which turned out not to be a construct: a document already says it
with an option, a text field and a `visible` rule (0199).

The rule from 0088 and 0140 is the question: is anything else close that needs a version? The
roadmap's remaining items are a builder command for "Other", XLIFF and server work. None changes
what a document may say.

## Decision

**Version 5 is frozen**, and holds, all as properties:

- on a field: `description`, `autocomplete`, `placeholder`, `default` and `shuffle`;
- on an option: `exclusive` and `keepPlace`;
- on a rule: `message`.

It adds no field type, widget, rule kind or layout kind. It is in no release yet; the first that
carries it is the one after 0.7.0.

**No version is open.** Version 6 opens when a construct needs one, and not before, for the reason
0140 gave: an open version is a format nobody can write a document against with confidence.

## Consequences

**A 0.7.0 reader cannot read what the next release writes**, loudly, as at every version so far:
a form authored in the builder declares 5. `MIGRATIONS.md` says to upgrade the readers before the
documents.

**A manufacturer can characterise against version 5** once a release carries it. Until then it is
frozen source, not a release.

**The next construct costs a version event**, with its migration note and an upgrade for every
pinned reader — the cost the batching rule accepts on purpose.

## Alternatives considered

**Keep version 5 open for the builder's "Other" command.** A command is not a construct; holding a
format open for one changes nothing a document may say and keeps the format moving for nothing.

**Freeze version 5 and open version 6 at once.** Rejected in 0140 for the reason it gives: the
source would write an unfrozen version again from the next day.
