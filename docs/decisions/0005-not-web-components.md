# 0005 — Do not distribute the renderers as Web Components

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** Not mechanically enforced. Nothing in the repository fails if
  someone adds a custom-element package. What the decision protects is visible
  in the registry tests — "a per-type entry replaces the default renderer for
  that type" in `packages/react/src/form.test.tsx` and "the registry resolves
  per-path over per-type over the defaults" in
  `packages/angular/src/form.test.ts` — which pass only because the application,
  and not the library, decides what markup a field renders.

## Context

Web Components were the obvious way to serve several frameworks from one
implementation, and in 2026 the usual objection to them no longer holds. React
19 scores 100% on custom-elements-everywhere, and declarative shadow DOM reached
Baseline widely available on 2026-08-20. Interop is genuinely solved. This had
to be rejected on the merits or not at all.

## Decision

The renderers are ordinary framework packages. No part of formancy is
distributed as a custom element.

## Consequences

**What it buys.** The markup stays the application's. A design system hands in a
component registry and replaces the entire visual layer, which is the second of
the problems this project exists to fix, and it is not a thing a shadow root can
be asked to allow.

**What it costs.** A Vue, Svelte or Solid user gets no renderer until somebody
writes one. A Web Component would have served all of them at once, and this
trades that reach for control of the markup.
[0035](0035-publish-the-suite.md) is the deliberate answer: the conformance
suite is published so that someone else's renderer can be certified rather than
trusted.

**What it forecloses.** One implementation. Every behavioural change is now
considered once per binding ([0004](0004-headless-core.md)).

## Alternatives considered

**Web Components with shadow DOM.** Rejected. Encapsulation is the point of a
shadow root: the consumer cannot reach the markup. That is the exact inverse of
the requirement. There is still no standard escape hatch — open-stylable shadow
roots, WICG/webcomponents#909, remains an open discussion — so Tailwind
utilities do not cross the boundary and shadcn or Radix composition is
impossible. It is form.io's mistake in a different dialect.

**Web Components without shadow DOM.** Rejected, and more firmly. Dropping the
shadow root removes the only reason to use the platform. There is then no
encapsulation and no server rendering, and what remains is imperative element
classes plus a wrapper per framework, which is strictly worse than
[0004](0004-headless-core.md).

**Waiting until server rendering is ready.** Rejected. @lit-labs/ssr still
describes itself as not quite ready for public consumption, and
angular/angular#52275, hydration for server-rendered web components, is still
open. Customers will server-render public intake forms, so a renderer that
cannot do that is not a renderer.
