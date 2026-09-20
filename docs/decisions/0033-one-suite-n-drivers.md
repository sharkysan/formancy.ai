# 0033 — Specify behaviour once as data, run it through every implementation

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/conformance/src/builtin-fixtures.test.ts` re-parses
  every shipped fixture and names the suite case by case, so a case that quietly
  stopped being embedded fails; `packages/react/src/conformance.test.tsx` and
  `packages/angular/src/conformance.test.ts` bind that same suite with no
  framework-specific skips; `packages/conformance/src/suite.test.ts` holds that
  an empty fixture list, a stale skip name and a skip without a real `skip()`
  all fail; `packages/conformance/src/runner.test.ts` holds "reports a driver
  that throws as a crash, not as a failed assertion". CI runs all of it.

## Context

The largest risk in the architecture chosen by [0004](0004-headless-core.md) is
that the two renderers drift. Two test suites written by the same person at
different times will diverge, and the divergence will be invisible, because both
suites pass. A green React run says nothing whatever about Angular.

## Decision

Correctness is specified once, as data. A fixture is a JSON file holding a
schema and a list of steps — set a value, expect these fields visible, submit,
expect these errors. Each fixture runs through every implementation behind one
`RendererDriver` interface: the engine in Node, the engine in a browser, the
React renderer, the Angular renderer and the server's revalidation endpoint. Two
of those drivers are wired today, React and Angular; the interface is what makes
the remaining three a file each rather than a second suite.

## Consequences

**What it buys.** A behaviour is written down once and verified in every place
it is implemented, so a renderer that behaves differently fails a test it did
not write. The suite had to earn that standing first. An adversarial review
found the critical bug in this package: a confusion between an assertion failing
and the driver crashing, which made some failures look like passes. A crash is
now a status of its own, and a teardown that throws after a step has already
failed cannot rewrite the verdict.

**What it costs.** A fixture can only express what the driver interface can
express, so the interface becomes a design constraint on the renderers. That is
mostly the point — see [0034](0034-accessible-name-only.md) — but it does mean
behaviour outside the interface is tested per renderer or not at all. Adding a
step kind edits a published format rather than a test file.

**What it forecloses.** A fixture is JSON and stays JSON. The moment a case may
carry a callback it can only run where that callback runs, which is precisely
the freedom to drift this exists to remove. Assertions are on message codes and
never on wording, so the suite survives a copy edit and can be run in a second
locale.

## Alternatives considered

**A test suite per renderer.** Rejected: it is the failure mode, not an
alternative to it. Both suites pass and neither notices the other.

**Fixtures written as code rather than data.** Rejected: a case that may contain
a callback can only run where that callback runs, which leaves each
implementation certified by cases only it can execute.
