# 0009 — Version the spec independently of the packages

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `specVersion` is the literal type `'1'` in
  `packages/spec/src/types.ts` and `"const": "1"` in
  `packages/spec/formancy.schema.json`, so the precompiled validator refuses a
  document claiming any other version; `diffSchemas` classifies a `specVersion`
  change as `breaking`, pinned by "a spec version bump is breaking" in
  `packages/spec/src/diff.test.ts`. The single package version line is **not
  mechanically enforced** — every `package.json` reads `0.0.0` today and nothing
  in CI compares them.

## Context

A form document and a package are not the same kind of artifact. An
organisation's forms and submissions are written against the spec, so changing
it has real switching costs: documents rewritten, stored answers rebound. A
package version costs an install. Tying the two together means every package
release looks like it might break stored data, and the only question an operator
cares about — is my data still readable — has to be answered by reading a
changelog rather than by looking at a number.

## Decision

One version number across all packages, moved together in the Angular and
Vitest style, and a separate, independent version line for the spec, carried
inside every document as `specVersion`. Packages 0.9 and 1.4 can both speak spec
`"1"`.

Spec `"0"` shipped deliberately unstable while the model was being proven, and
**froze to `"1"` on 2026-09-20** once its three open semantics were settled —
see [0042](0042-freeze-the-spec.md), which records what they were and how each
was answered.

## Consequences

**What it buys.** A support matrix of size one. Any two formancy packages at the
same version are known to work together, and nobody has to work out which minor
of `@formancy/react` pairs with which minor of `@formancy/core`. The spec line
then carries the question about data on its own.

**What it costs.** One version across all packages produces empty patch releases
for packages that did not change. Upgrading `@formancy/angular` pulls a
`@formancy/spec` whose contents are identical to the one already installed. That
is the price of the support matrix, and it is paid in release notes rather than
in anyone's data.

**What it forecloses.** Publishing the spec early. Three things about the model
turned out to be undiscoverable without a renderer and a server in the loop:
what happens to a hidden field's answer
([0013](0013-hidden-field-semantics.md)), repeating-group item identity
([0041](0041-repeater-row-identity.md)), and where a validation check runs
([0043](0043-runs-on.md)). So the spec was designed first and published last,
and the version stayed `"0"` until all three had answers.

## Alternatives considered

**Independent semver per package.** Rejected: the matrix grows with the package
count, and the first bug report that turns out to be version skew between two
formancy packages costs more than every empty patch release put together.

**One version covering packages and the spec.** Rejected: it makes a renderer
fix indistinguishable from a document format change, which is the one
distinction the number exists to carry.

**Freezing the spec at `"1"` before shipping.** Rejected: three of its semantics
were not knowable yet, and a frozen wrong answer is worse than an honestly
unstable one.
