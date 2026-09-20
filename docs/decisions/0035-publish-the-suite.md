# 0035 — Publish the conformance suite so others can self-certify

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/conformance/src/index.test.ts` — "exports exactly
  the conformance contract" pins the published surface as a sorted list, so an
  export added or removed by accident fails rather than ships, and the fake
  driver is asserted out of it. `packages/conformance/package.json` ships `dist`
  and `fixtures`, sets `publishConfig.access` to public, and runs `publint` and
  `attw` under `check:pkg`, which CI runs as a release gate.

## Context

[0005](0005-not-web-components.md) means a Vue, Svelte or Solid user gets
nothing until somebody writes a renderer. [0004](0004-headless-core.md) means
writing one is a small job — roughly a thousand lines that adapt the engine's
subscription model and resolve components. What is missing is the way that
person knows their renderer is correct.

## Decision

Publish `@formancy/conformance` to npm: the fixtures, the `RendererDriver`
interface and the runner. A community author implements the interface and runs
the same suite the first-party renderers run, under whatever test framework they
already have, since the framework is injected as data rather than imported.

## Consequences

**What it buys.** Framework coverage the project does not pay for, which no
incumbent offers. It also disciplines the first-party work: a suite meant to be
run by strangers cannot quietly depend on internal knowledge, so the failure
output has to name the fixture, the step and the accessibility-tree snapshot,
and a skip has to be loud enough that nobody advertises conformance they do not
have.

**What it costs.** The driver interface becomes public API and cannot change
casually. The fixture format likewise. Both are now things that need deprecation
cycles, and a step kind that would have been a one-line addition to an internal
suite is a versioned change to a contract other people's test runs depend on.

## Alternatives considered

**Keep the suite internal.** Rejected: it certifies the two renderers this
project already controls and does nothing for the frameworks it deliberately did
not build ([0007](0007-react-and-angular-first.md)).
