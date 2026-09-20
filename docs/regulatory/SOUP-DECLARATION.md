# SOUP characterisation

Written for a manufacturer who is incorporating formancy into a product
developed under IEC 62304, and who therefore has to record what this software
is, what it needs, what it is known to get wrong, and what evidence exists that
it works. Read [`MDR-CONTEXT.md`](MDR-CONTEXT.md) first.

**This document describes commit `6d5e702`.** Everything below is true of that
commit and of no other. Pin an exact version; a range is not characterised
software.

## Identity

| | |
|---|---|
| Name | formancy |
| Supplier | the formancy project (open source) |
| Licence | Apache-2.0 for every package ([0002](../decisions/0002-apache-2-0.md)) |
| Source | this repository, in full, including tests |
| Package version | `0.0.0` — **pre-release; not yet published to npm** |
| Spec version | `"0"` — **explicitly unstable** ([0009](../decisions/0009-independent-spec-version.md)) |
| Development stage | walking skeleton complete; v0.1 not released |

The two version lines are independent and both matter. The package version
governs the code; the spec version governs the *documents and stored
submissions*, which is the artefact with real switching costs.

> **This is the most important caveat in this document.** Spec version 0 is
> declared unstable by the project itself, and the format of stored submissions
> may change before it freezes to `"1"`. Building a regulated product on it is a
> decision to take deliberately and to write down, not one to make by default.

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
- File upload, async validators, remote option sources, rich text, signature
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
| 793 automated tests across eight packages, all passing at this commit | `pnpm test` |
| 21 further integration tests against a real PostgreSQL instance via Testcontainers | `packages/server/src/server.integration.test.ts` |
| One behavioural conformance suite executed against the engine, both renderers and the server | `packages/conformance` ([0033](../decisions/0033-one-suite-n-drivers.md)) |
| Property-based invariants over hide/unhide, repeater identity and evaluation order | `packages/core` |
| The official CEL corpus, with results pinned | `packages/expressions/CEL-CONFORMANCE.md` |
| Performance budgets, measured: keystroke ≈0.38 ms against a <1 ms budget; graph compile ≈1.7 ms against a <30 ms budget | `packages/core/bench/perf.mjs` |
| Package-publication gates: `publint`, `@arethetypeswrong/cli`, `size-limit` | `pnpm check:pkg` |

Per-package counts at this commit: spec 109, expressions 189, core 210,
conformance 115, react 52, builder-core 51, angular 34, server-core 33.

## Maintenance and support

No commercial support, no service-level agreement, and no security-response
commitment beyond `SECURITY.md`. Governance is documented honestly in
`GOVERNANCE.md` as a single maintainer.

A manufacturer relying on this in a regulated product should plan for the
possibility of maintaining it themselves. Apache-2.0 permits that, the
repository contains the complete test suite, and
[the architecture documents](../architecture/01-introduction-and-goals.md) exist partly so that a successor
maintainer can understand the design without the original author.
