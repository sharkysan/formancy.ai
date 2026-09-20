# 0036 — Run the official CEL corpus and pin the result

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/expressions/src/cel-spec-corpus.test.ts` —
  "COUNTS (a change here is a review item, not a silent drift)" asserts the
  whole summary object, and the surrounding cases assert that the corpus has not
  shrunk, that every case is classified rather than skipped, that the run is
  deterministic and that no included group is entirely unrun. The audit is
  written up in `packages/expressions/CEL-CONFORMANCE.md`; CI runs the test.

## Context

`@marcbachmann/cel-js`, the implementation wrapped by
[0017](0017-expression-facade.md), describes itself as implementing "most of the
CEL spec" and publishes no score. Building conditional logic
([0016](0016-cel.md)) on an unquantified claim is not acceptable when the same
expressions decide whether a submission is valid.

## Decision

Run the official `@bufbuild/cel-spec` corpus against the facade and pin the
resulting counts in a test, so a change in any direction is visible: 2344 cases
in the corpus, 704 run, 586 passed, 118 failed, 2 refused by policy, 1638
excluded as out of scope. Every exclusion is counted under a stated reason
rather than skipped.

## Consequences

**What it buys.** A number a reviewer can check instead of a vendor's adjective.
The audit is written up honestly in `CEL-CONFORMANCE.md` rather than reduced to
a percentage, which matters because the failures do not mean one thing. Fifty of
them are undeclared variables, where CEL's runtime absorbs an unknown and
formancy rejects it when the author presses save — behaviour the project wants
and would not trade. The two refused by policy are refusals the facade makes
deliberately, which the corpus scores as failures; saying so is the whole reason
for writing it up rather than quoting a figure.

**What it costs.** A pinned count means every dependency bump touches this test,
and anyone who widens the expression surface has to re-run the audit and update
the prose that explains each class. That is the intended cost. An unnoticed
regression in expression semantics is exactly what this is guarding, and a test
that tolerated drift would not guard it.

**What it forecloses.** The counts cannot be quietly improved by narrowing what
is run, because the excluded total is pinned alongside the passing one and no
included group may go entirely unrun. Raising the score means passing more
cases, not measuring fewer.

## Alternatives considered

**Trust the upstream claim.** Rejected: "most of the spec" is not a statement
anything can be verified against.

**Write our own expression tests only.** Rejected: they would cover the cases
already thought of, which is the same blind spot as a renderer testing itself
([0033](0033-one-suite-n-drivers.md)).

**Report a single percentage.** Rejected: it hides that most of the shortfall is
formancy being deliberately stricter than CEL, and it would fall as the facade
got safer.
