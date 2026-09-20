# 0017 — Wrap the CEL implementation behind our own facade

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `@marcbachmann/cel-js` is declared in exactly one manifest,
  `packages/expressions/package.json`, and `.npmrc` sets `node-linker=isolated`
  with `auto-install-peers=false`, so an import of it from any other package
  does not resolve and `pnpm build` and `pnpm typecheck` fail. The policy the
  facade carries is tested directly:
  `packages/expressions/src/limits.test.ts`, `budget.test.ts`,
  `metering.test.ts`, `capabilities.test.ts`, and the allow-list cases in
  `check.test.ts` ("rejects `random()` in a visible expression"). Inside the
  package the one-file rule is **not** mechanically enforced: nothing fails if a
  second module imports the library. Only `src/cel.ts` does, and that is held by
  review.

## Context

The implementation chosen in [0016](0016-cel.md) is `@marcbachmann/cel-js`. It
is MIT licensed, has no dependencies, is fast, and exposes both an environment
checker and structural parser limits, which is more than the alternatives
offered. It also has roughly 190 stars and one maintainer. For a component this
load-bearing — every rule in every form, on both sides of the wire — that bus
factor is a real risk and not a theoretical one.

## Decision

Handle it architecturally rather than by hoping. `@formancy/expressions` exposes
formancy's own `parse`, `check`, `compile` and `evaluate`. Nothing above L1
imports the CEL library ([0008](0008-layered-packages.md)), and
`packages/expressions/src/cel.ts` is the only module that names it, so moving to
`@bufbuild/cel` or to a fork is a one-file change.

## Consequences

**What it buys.** The larger justification is not the swap but the policy, which
needs somewhere to live. The facade is where structural limits on AST node
count, nesting depth, literal sizes and comprehension nesting are applied; where
a deterministic step budget bounds an evaluation against real data, with an
optional wall-clock deadline that requires an injected monotonic clock because
the package refuses to read one of its own; where the allowed function set is a
property of the expression kind, so a `visible` expression cannot perform a
lookup even though a `computed` one may; and where anything non-deterministic is
refused ([0019](0019-injected-capabilities.md)). A thin pass-through would have
had nowhere to put any of that, and it would have ended up duplicated in every
caller or in none.

The facade also made a real bug findable. An adversarial review of this package
found that `split()` was unmetered: a small, legal, type-correct expression could
build a collection proportional to a field's length and then walk it for free.
Internal collections are now charged per element, and the repro is kept in
`metering.test.ts`.

**What it costs.** An indirection layer to maintain, and one that must stay thin
on purpose. The facade's own surface has to be kept small enough that "swapping
implementations is a one-file change" remains true rather than becoming a claim
nobody has tested — and nobody has tested it, because no second implementation
has been wired up.

## Alternatives considered

**Import the CEL library directly wherever an expression is needed.** Rejected:
a replacement becomes a migration instead of an edit, and the safety policy has
no single place to live.

**Depend on it and accept the bus factor.** Rejected: the mitigation costs one
file, and the exposure is the whole product.
