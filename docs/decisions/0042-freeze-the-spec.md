# 0042 — Freeze the spec at version 1

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `specVersion` is the literal type `'1'` in
  `packages/spec/src/types.ts` and `"const": "1"` in
  `packages/spec/formancy.schema.json`, so the precompiled validator refuses a
  document claiming any other version. `diffSchemas` still classifies a version
  change as `breaking`, pinned by "a spec version bump is breaking" in
  `packages/spec/src/diff.test.ts` — which now has to reach past the type to
  construct a spec 2, because the type will not produce one.

## Context

The spec shipped as `"0"` with a loud instability notice, on the reasoning that
three things about the model were undiscoverable without a renderer and a
server actually using it ([0009](0009-independent-spec-version.md)). Freezing
before they were answered would have frozen a guess; leaving it unstable
indefinitely means nobody can build on it, since the data format is the
artefact with real switching costs.

All three now have answers, and each was answered by building the thing that
revealed the question:

| Question | Answer |
|---|---|
| What happens to a hidden field's answer? | `clearOnHide`, and the server applies the same reading rather than trusting the client ([0013](0013-hidden-field-semantics.md)) |
| How does a repeating-group row keep an identity that is not its position? | `_id`, minted by the engine, carried in the data ([0041](0041-repeater-row-identity.md)) |
| Where does a validation check run? | `runsOn` on validate rules, and deliberately nowhere else ([0043](0043-runs-on.md)) |

The presentation sections landed alongside them
([0014](0014-presentation-sections.md)), and Angular passing the same
conformance fixtures as React with no framework-specific skips is what shows
the model is not shaped like one framework
([0033](0033-one-suite-n-drivers.md)).

## Decision

`specVersion` is `"1"`, and version 1 is frozen: a document that validates
today validates against every future release that speaks spec 1.

There is **no dual acceptance and no 0-to-1 migration.** Nothing was ever
published under spec `"0"` — no npm release, no claimed scope — so there are no
version-0 documents in the world to migrate. Version 1 replaces version 0
rather than joining it.

## Consequences

**What it buys.** The thing the version line exists for: somebody can write
forms now and know they keep working. Every downstream promise — that a
submission is readable against the schema that produced it, that a published
version is immutable, that a diff means something — is worth less while the
format underneath can still move.

**What it costs.** The obvious one: anything wrong in the model is wrong until
spec 2, and a spec bump is a major event with a migration to write. Three
specific bets are now locked in — that a page contributes nothing to a data
path ([0012](0012-pages-scope-nothing.md)), that `_id` is reserved
([0041](0041-repeater-row-identity.md)), and that CEL is the expression
language ([0016](0016-cel.md)). Each is defensible and each is now expensive to
revisit.

The freeze also creates a mild trap in the test suite: a test that needs a
"breaking" diff can no longer manufacture one by changing the spec version,
because both sides are `'1'` now. Two tests did exactly that and both silently
stopped testing anything when the constant changed. They now construct a spec
`'2'` through a cast, with a comment saying why.

**What it does not buy.** The *packages* are not frozen and are nowhere near
1.0; their APIs will still change. Conflating the two is the misreading this
decision is most likely to produce, which is why `MIGRATIONS.md` and the
documentation site both say it in as many words.

## Alternatives considered

**Freeze earlier, before the presentation sections.** Rejected at the time and
still the right call: retrofitting internationalisation into every label is the
kind of change that forces a version bump immediately after promising not to.

**Accept both `"0"` and `"1"`.** Rejected. It is compatibility with a
population of documents that is known to be empty, in exchange for a permanent
branch in the validator and two shapes for every reader to handle.

**Stay on `"0"` until async validators exist.** Rejected. They need a new rule
kind, which is a spec 2 change whenever it happens; `runsOn`
([0043](0043-runs-on.md)) is what makes that change additive rather than
structural. Waiting for a feature that will bump the version anyway is waiting
forever.
