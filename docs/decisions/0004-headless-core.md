# 0004 — A headless isomorphic core with framework-native bindings

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core` has no framework or DOM dependency and no
  `@types/node`, so `pnpm --filter @formancy/core typecheck` fails if one is
  introduced; the same fixtures pass through both renderer drivers in
  `packages/react/src/conformance.test.tsx` and
  `packages/angular/src/conformance.test.ts` with no framework-specific skips.

## Context

A form platform that serves more than one framework has to decide where the
behaviour lives. form.io — the product formancy is a response to — put it in an
imperative core and wrapped that core in thin per-framework shells. The result
is the thing being escaped: the wrappers are not idiomatic, they do not compose
with the framework's own reactivity, and the markup belongs to the library
rather than to the application.

Four candidate strategies existed:

1. One imperative core plus thin wrappers (form.io's answer).
2. Web Components, so there is one implementation and no wrappers.
3. A compiler that generates each framework's components from one source
   (Mitosis).
4. A headless core that owns behaviour, plus a small binding layer per
   framework that owns reactivity and nothing else.

The constraint that decides it is that the *same* validation and logic must
also run on the server ([0006](0006-one-engine-build.md)). That rules out any
strategy where behaviour is entangled with a rendering technology.

## Decision

The engine is a headless, isomorphic package with no framework, DOM or Node
dependency. Each framework gets a thin binding layer — roughly a thousand lines —
whose only jobs are adapting the engine's subscription model to that framework's
reactivity, resolving components from a registry, and managing focus. Markup and
styling belong to the application.

## Consequences

**What it buys.** The engine is testable without a browser and runs unchanged on
the server. A renderer is small enough that a third party can write one, which
is what makes [0035](0035-publish-the-suite.md) worth doing. Applications keep
their own markup, which is the second of the four problems this project exists
to fix.

**What it costs.** Two binding layers to maintain, and every behavioural change
has to be considered against both. There is no `@zag-js/angular` or
`@ark-ui/angular` to build on, so Angular's layer is entirely in-house — a real
cost that the estimate had to carry, and the reason Angular was built second
rather than last ([0007](0007-react-and-angular-first.md)).

**What it forecloses.** The engine cannot use anything ambient: no `document`,
no `crypto`, no `URL`, no `TextEncoder`. Each of those was hit in practice and
each forced a better answer — hashing moved to `@noble/hashes`, format checks
became explicit regular expressions. The absence of `@types/node` is deliberate,
so the compiler enforces this rather than a reviewer.

## Alternatives considered

**Thin wrappers around an imperative core.** Rejected: it is the architecture
whose consequences motivated the project.

**Web Components.** Rejected on its own terms — see
[0005](0005-not-web-components.md).

**Mitosis.** Rejected. Version 0.14.0 after six years and roughly seven npm
dependents; the generated Angular is not signals-idiomatic, which reproduces
exactly the non-idiomatic-wrapper problem being escaped, and it puts a compiler
between the maintainers and every stack trace.
