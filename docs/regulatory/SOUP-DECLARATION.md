# SOUP characterisation

Written for a manufacturer who is incorporating formancy into a product
developed under IEC 62304, and who therefore has to record what this software
is, what it needs, what it is known to get wrong, and what evidence exists that
it works. Read [`MDR-CONTEXT.md`](MDR-CONTEXT.md) first.

**This document describes version `0.1.0`.** Everything below is true of that
version and of no other. Pin an exact version; a range is not characterised
software, and neither is `latest`.

## Identity

| | |
|---|---|
| Name | formancy |
| Supplier | the formancy project (open source) |
| Licence | Apache-2.0 for every package ([0002](../decisions/0002-apache-2-0.md)) |
| Source | this repository, in full, including tests |
| Package version | `0.1.0`, published to npm under the `@formancy` scope |
| Spec version | `"2"` ([0051](../decisions/0051-spec-2-adds-types.md)). Version `"1"` is frozen and stays readable ([0042](../decisions/0042-freeze-the-spec.md)) |
| Development stage | v0.1 released; pre-alpha. `@formancy/builder-react` is the one package not yet published |
| Integrity | each tarball carries a SLSA v1 provenance attestation issued by GitHub's OIDC identity for the workflow run that built it, plus a registry signature. Verify with `npm audit signatures`; the pipeline is described in [`RELEASING.md`](../../RELEASING.md) |

The two version lines are independent and both matter. The package version
governs the code; the spec version governs the *documents and stored
submissions*, which is the artefact with real switching costs.

> **A manufacturer must pin the spec version as well as the package version.**
> Version 2 is a superset of version 1: it adds field types and layout kinds and
> removes nothing, so a document characterised under version 1 is unchanged and
> still valid. But a reader that speaks only version 1 cannot read a version 2
> document, and the failure is a validation error rather than a silent one
> ([0051](../decisions/0051-spec-2-adds-types.md)).
>
> **The data format is stable; the code is not.** Spec version 1 is frozen, so
> a form document and the submissions stored against it keep their shape. The
> *packages* are pre-release and their APIs will still change. A manufacturer
> should read the two version lines separately: the one that governs stored
> data is settled, the one that governs the software is not.

## Intended function

formancy renders data-collection forms from a JSON document, evaluates
conditional logic and validation rules against the answers, and — in the
server packages — stores submissions bound immutably to the exact form version
that produced them.

It is **general-purpose**. It has no clinical intended purpose, no notion of a
patient, and no domain knowledge of anything a form might collect.

What it does **not** do, and must not be assumed to do:

- It does not decide whether collected data is clinically meaningful, only
  whether it satisfies the rules the form author wrote.
- It does not identify or authenticate the person filling in a form. That is
  the surrounding application's responsibility.
- It does not provide an audit trail of who saw a submission unless the server
  packages are deployed and audit logging is configured.
- It does not encrypt data at rest. That is the database deployment's job.

## Required environment

| Layer | Requirement |
|---|---|
| Runtime (engine, spec, expressions, builder-core) | Any ECMAScript 2023 environment. **No DOM and no Node APIs are used** ([0008](../decisions/0008-layered-packages.md)) |
| Runtime (server) | Node.js `>=22.12.0`; developed and tested against Node 22.12 |
| Renderer (React) | React `^19.0.0` (peer dependency) |
| Renderer (Angular) | `@angular/core` `^22.0.0` (peer dependency), zoneless change detection |
| Database (server only) | PostgreSQL 17 or 18 |
| Module format | ESM only; no CommonJS build is published ([0038](../decisions/0038-esm-only.md)) |

## Composition and third-party dependencies

Ten packages, layered so that the isomorphic ones cannot acquire a platform
dependency ([0008](../decisions/0008-layered-packages.md)):

| Package | Runtime dependencies outside the project |
|---|---|
| `@formancy/spec` | `ajv ^8.20.0`, `@noble/hashes ^2.4.0` |
| `@formancy/expressions` | `@marcbachmann/cel-js ^8.0.0` |
| `@formancy/core` | none |
| `@formancy/builder-core` | none |
| `@formancy/conformance` | none |
| `@formancy/react` | none (React is a peer) |
| `@formancy/angular` | `tslib` (Angular is a peer) |
| `@formancy/server-core` | none |
| `@formancy/server` | `fastify ^5.12.5`, `@fastify/rate-limit ^11.2.0`, `drizzle-orm ^0.45.2`, `postgres ^3.4.9`, `jose ^6.2.12`, `@node-rs/argon2 ^2.2.1` |
| `@formancy/themes` | none (CSS only) |

The dependency count is deliberately small, and the engine — the part that
decides whether a submission is valid — has **no third-party runtime
dependency at all**.

### The one dependency to look at closely

`@marcbachmann/cel-js` evaluates every conditional and validation expression.
It is MIT-licensed, zero-dependency and fast, and it has roughly 190 GitHub
stars and a single maintainer. That bus factor is recorded and handled
architecturally rather than hoped away: nothing above the expression layer
imports it, so replacing it is a change to one package
([0017](../decisions/0017-expression-facade.md)).

Its conformance against the official CEL specification was **measured rather
than assumed**, because the library's own claim is the unquantified phrase
"most of the CEL spec". The result is pinned in a test and written up in
`packages/expressions/CEL-CONFORMANCE.md`
([0036](../decisions/0036-pin-the-cel-corpus.md)).

## Known anomalies and limitations

IEC 62304 §7.1.2 asks for the supplier's published anomaly list. There is no
released version and therefore no release-notes anomaly list yet; what follows
is the honest equivalent.

**Measured functional gaps.** Against the official CEL corpus: 2,344 cases
total, 704 in scope and run, **586 passed and 118 failed**, 2 refused
deliberately by formancy's own policy, 1,638 excluded as out of scope. The 118
failures are real gaps in the expression evaluator, enumerated in
`packages/expressions/CEL-CONFORMANCE.md`. A manufacturer whose forms use
expressions should read that file rather than this summary.

**Declared scope limits**, refused by the validator rather than mishandled:

- Nested repeaters are rejected ([0012](../decisions/0012-pages-scope-nothing.md)).
- Pages below the top level are rejected.
- Async validators, remote option sources, signature
  and date-time types are **not implemented**; the type names are reserved so
  that adding them later is a compatible change, not a breaking one.
- Multi-tenancy is absent entirely.

**Not implemented in v0.1 but designed**: file storage, webhook delivery and
actions, rate limiting and challenge on the public submission plane.

**Accessibility**, stated precisely because vague claims here are worse than
none: the conformance suite structurally requires that every control be
reachable by role and accessible name ([0034](../decisions/0034-accessible-name-only.md)),
and axe-core runs after every mount and every DOM-mutating change. Automated
checking is a floor and not a claim — axe detects roughly 57% of
machine-detectable issues by Deque's own published figure, and only about 30%
of WCAG 2.2 criteria are machine-testable at all. **No manual screen-reader
audit has been performed, and no VPAT has been published.** A manufacturer
requiring an accessibility conformance statement must perform that work.

## Verification evidence

| Evidence | Where |
|---|---|
| 1,155 automated tests across ten packages, all passing at this commit | `pnpm test` |
| 29 of those run against a real PostgreSQL instance via Testcontainers, rather than a stub | `packages/server/src/server.integration.test.ts` |
| One behavioural conformance suite executed against the engine, both renderers and the server | `packages/conformance` ([0033](../decisions/0033-one-suite-n-drivers.md)) |
| Property-based invariants over hide/unhide, repeater identity and evaluation order | `packages/core` |
| The official CEL corpus, with results pinned | `packages/expressions/CEL-CONFORMANCE.md` |
| Performance budgets, measured: keystroke ≈0.38 ms against a <1 ms budget; graph compile ≈1.7 ms against a <30 ms budget | `packages/core/bench/perf.mjs` |
| Package-publication gates: `publint`, `@arethetypeswrong/cli`, `size-limit` | `pnpm check:pkg` |
| Line coverage, reported per package and uploaded per commit | `pnpm turbo run test:coverage`, and Codecov |
| Build provenance for every published tarball | `npm audit signatures` against the installed version |

Per-package counts at this commit: core 225, expressions 189, builder-react
160, conformance 115, spec 112, builder-core 96, server-core 75, server 61,
react 64, angular 42. A further 45 cover the two applications, which are not
distributed as packages and are listed separately for that reason.

Coverage is reported rather than targeted, and what it counts is stated in
`vitest.coverage.ts`: barrels and composition roots are excluded, with the
reasoning written beside the exclusion, because a coverage figure is only
evidence if the reader can see what it measured. The two lowest figures are the
applications; every distributed package is above 85% of statements.

## Maintenance and support

No commercial support, no service-level agreement, and no security-response
commitment beyond `SECURITY.md`. Governance is documented honestly in
`GOVERNANCE.md` as a single maintainer.

Obtaining a fixed version does not depend on this repository staying up: the
packages are on the public npm registry, each Apache-2.0, each with a
provenance attestation tying it to the commit it was built from — so a
manufacturer can establish what they installed without trusting the supplier's
own claim about it.

A manufacturer relying on this in a regulated product should plan for the
possibility of maintaining it themselves. Apache-2.0 permits that, the
repository contains the complete test suite, and
[the architecture documents](../architecture/01-introduction-and-goals.md) exist partly so that a successor
maintainer can understand the design without the original author.
