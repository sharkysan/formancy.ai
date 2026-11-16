# 0239 — Spec 6 freezes with the property it was opened for, and nothing opens version 7 yet

- **Status:** accepted
- **Date:** 2026-11-16
- **Extends:** [0238](0238-a-time-or-an-instant-declares-its-precision.md), which opened the
  version this closes, and [0201](0201-spec-5-freezes-with-the-batch-it-opened-for.md), whose
  freeze this repeats
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/claims.test.ts`, *and says every version the code speaks is
  frozen, and none is open* — every version in `SPEC_VERSIONS` has a FROZEN heading in
  `MIGRATIONS.md` and none says OPEN; it failed with version 6's heading still OPEN. Beside it,
  *and names one version as the one this package writes* holds that only version 6's section says a
  new document declares it. `packages/spec/src/precision.test.ts`, *in a version 5 document is
  refused, naming the property*, refuses the version's one construct in a version 5 document;
  `spec-version.test.ts` fails on a field type or widget in no version's list; and
  `version-ledger.ts` is a `Record` over each type a document is made of, so a property added with
  no version does not compile.

## Context

Version 6 opened on 2026-11-16 for one property: `precision` on a `time` or `datetime` field, how
many digits follow the seconds, from 0 to 9 (0238). It is built: the validator, the engine, the
publish check across widths, a typed control in both renderers, and both builders, whose condition
editors write a literal at the field's width and which carry a field's bounds, default and rule
literals when its precision changes, or refuse.

The rule from 0088, 0140 and 0201 is the question: is anything else close that needs a version?
The roadmap's remaining item is XLIFF, an exchange file rather than a document construct. What
this work named and left — a comparison through a list rule's own variable that publish does not
see, `timestamp()` comparing to the millisecond, Formancy Data reading a column's precision — is a
check, a library's behaviour and another repository's reader. None changes what a document may say.

## Decision

**Version 6 is frozen**, and holds one property: `precision` on a `time` or `datetime` field. It
adds no field type, widget, rule kind or layout kind. It is frozen in the change that first
releases it, `0.14.0`, so no release carries it open.

**No version is open.** Version 7 opens when a construct needs one, and not before, for the reason
0140 gave: an open version is a format nobody can write a document against with confidence.

## Consequences

**A 0.13.0 reader cannot read what 0.14.0 writes**, loudly, as at every version so far: this source
writes `"6"` for every new form, whether or not a field declares a precision, and 0.13.0 and
earlier refuse every document declaring it. `MIGRATIONS.md` says to upgrade the readers before
the documents.

**A manufacturer can characterise against version 6** from 0.14.0, the first release that reads
and writes it.

**What the property does not do is frozen with it.** A rule comparing two widths through a list
rule's own variable, `steps.all(s, s.at >= startedAt)`, publishes. Teaching publish to see it needs
no version, being a check and not a construct, but once 0.14.0 has published such a document,
refusing it then meets 0236's question again: a document published today refused tomorrow. Its
remedy is written wherever this is documented: one precision for the fields compared there, or
`timestamp()` for two dates and times.

**The next construct costs a version event**, with its migration note and an upgrade for every
pinned reader — the cost the batching rule accepts on purpose.

## Alternatives considered

**Release 0.14.0 with version 6 open.** Every form a host authored with it would declare a version
that may still gain constructs, and the SOUP declaration would characterise a release whose own
new documents are of an unfrozen format. Nothing is waiting to join it, so holding it open buys
nothing.

**Keep version 6 open for the list-rule check, or for Formancy Data.** A check is not a construct,
and what Formancy Data has still to do is read a column's precision, which version 6 can already
say; holding a format open for either changes nothing a document may say.

**Freeze version 6 and open version 7 at once.** Rejected in 0140 for the reason it gives: the
source would write an unfrozen version again from the next day.
