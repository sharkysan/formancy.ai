# 0051 — Spec 2 adds field types; spec 1 documents keep working

- **Status:** accepted
- **Date:** 2026-09-22
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0042](0042-freeze-the-spec.md), which froze version 1
  and did not say what a later version would mean
- **Verified by:** `packages/spec/src/spec-version.test.ts` (20 cases: what each
  version defines, a version 2 construct in a version 1 document refused by
  name, the upgrade, and the refusal to go back), and the two directions of
  `specVersion.changed` in `packages/spec/src/diff.test.ts`.

## Context

form.io's builder offers checkboxes-as-a-group, file upload, formatted text,
tabs and layout tables. formancy offered none of them, and adding them means
adding field types and layout kinds to a document format that was frozen four
days earlier.

The freeze promised that "a document that validates today validates against
every future release that speaks spec 1". Adding a type keeps that promise:
every existing document still validates, because nothing was removed. So the
tempting reading is that new types are *additive within version 1* and the
version line does not move.

That reading is wrong, and the reason is worth writing down.

## Decision

**The version line is a contract for readers, not a description of documents.**
It answers "can I understand this?", and the answer changes the moment the
format grows a construct a reader has never heard of.

An implementation that speaks spec 1 and meets a `selectboxes` field does not
half-understand it. It does not understand it at all: it would render nothing,
collect nothing, and drop the answer — quietly, because a missing field looks
exactly like a field somebody left blank. A document that can do that to a
conforming reader is not a document of that version, however compatible the
rest of it looks.

So: **`specVersion: "2"`**, and:

- **Version 2 is a superset.** It adds `selectboxes`, `file` and `richtext`
  field types and `tabs` and `table` layout kinds, and removes nothing. Every
  version 1 document is a valid version 2 document, and `upgradeSpecVersion` is
  one line — deliberately. If it ever needs to rewrite a document, the version
  it is rewriting for was not a superset and this claim has stopped being true.
- **A version 2 construct in a version 1 document is an error**, raised in
  `validate.ts` by name with the fix in the message, not by ajv. Threading the
  version through every branch of the JSON Schema would produce "must match
  exactly one schema in oneOf", which helps nobody.
- **`diffSchemas` reads the direction.** 1 → 2 is `compatible`: every answer
  keeps its path and nothing rebinds. 2 → 1 is `breaking`, because what the
  newer version added has nowhere to go.
- **There is no downgrade.** `upgradeSpecVersion` refuses to go backwards
  rather than dropping what it cannot express. The plausible-looking answers —
  remove the field, or turn it into a text box — are both data loss wearing the
  word "conversion".
- **The builder offers only what the document's version defines**, says which
  types it is holding back, and offers the upgrade as a command. A shorter
  palette with no explanation reads as a broken builder.

## Consequences

**What it buys.** Version 1 documents and the submissions stored against them
are untouched, which is the promise the freeze exists to make. A reader can
decide from one string whether it understands a document, which is the promise
the version line exists to make. And the two promises stop competing.

**What it costs.** A second version to support forever, and a second column in
every compatibility conversation. `@formancy/spec@0.1.0` — which is on npm —
cannot read a spec 2 document, and the error it gives is a schema error rather
than "you need a newer package". That is the honest consequence of the decision
and the reason the next release should say so loudly.

It also means the freeze's bar is now visible: **adding a type costs a version
bump.** That is deliberate. It makes the field-type list something to think
about rather than somewhere to put every idea, which is the discipline form.io
did not have and is why its component list is what it is.

## Alternatives considered

**Additive within version 1.** Rejected, above. It is the reading that lets the
version line quietly stop meaning anything: after the third addition nobody can
say what "spec 1" guarantees, and the first implementer outside this repository
finds out by dropping somebody's answer.

**Version the packages instead.** Rejected: the two lines are independent by
design ([0042](0042-freeze-the-spec.md)) precisely so the code can move without
frightening people about their data. Using the package version to describe a
document format change would collapse that distinction on its first real test.

**A capability list rather than a version** — a document declaring which
constructs it uses, so a reader can check just those. Rejected as more
machinery than the problem has: two versions is a string comparison, and a
capability set is a negotiation. Worth revisiting if there is ever a version 4.
