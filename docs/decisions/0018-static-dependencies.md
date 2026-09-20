# 0018 — Extract dependencies statically and reject cycles at save time

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/graph.test.ts` — "rejects a cycle with the
  full trace, in order, for the builder to display" and "rejects a
  self-dependency as a cycle of one"; `packages/core/src/engine-logic.test.ts`
  and `engine-rows.test.ts` assert `createFormEngine` throws on a cyclic schema,
  including a cycle that closes through a repeater;
  `packages/server-core/src/use-cases.test.ts` — "a cyclic logic graph is
  rejected at publish, never persisted"; and
  `packages/server/src/server.integration.test.ts` — "a cyclic schema is refused
  at publish and never persisted", which then asserts the form path returns 404.
  The extraction itself is covered by
  `packages/expressions/src/references.test.ts`.

## Context

A form in which field A's value depends on B and B's depends on A cannot settle.
Discovering that while someone is filling the form in leaves two options, an
infinite loop or an arbitrary iteration cap, and either way a person sees
nonsense they have no way to act on. The author, who is usually not a
programmer, has no mental model of evaluation order.

## Decision

At schema compile time every expression is parsed, type-checked and walked to
collect the paths it references. Those references form a directed graph, which
is topologically sorted and cycle-checked at save time. A form that can loop is
never persisted, and the error carries the cycle in order so the authoring tool
can show the trace.

## Consequences

**What it buys.** A runtime hazard becomes an authoring-time error message,
which is the correct place for it when the author is not a programmer. This is
only possible because of [0016](0016-cel.md): the AST yields exact references,
so the answer is known before any data exists.

The graph then pays for itself at runtime. Computed rules run in topological
order, so one pass settles instead of iterating towards a fixed point. A write
invalidates only the field snapshots it touched and nothing is recomputed until
something reads it. And a repeater's rules are compiled once against the
template form of their target, `items[].qty`, so a single graph node stands for
that member across every row and adding a row costs the fields in that row
rather than the whole form.

**What it costs.** Expressions cannot reference paths computed at runtime. There
is no way to say "read the field whose key is in this variable". Dynamic
indirection is simply not expressible, and that is a real limit accepted in
exchange for the guarantee.

Extraction must also err in one direction only. Over-reporting a dependency
costs a redundant recomputation; under-reporting produces a computed value that
is silently stale. That asymmetry is why comprehension scoping — knowing that
`items.all(x, x.price > 0)` reads `items` and not `x` — carries a test group of
its own rather than a single case.

## Alternatives considered

**Detect cycles at runtime with an iteration cap.** Rejected: it reports the
problem to the person least able to fix it, and the cap is an arbitrary number
that will be wrong for some legitimate form.

**Record dependencies dynamically, by observing reads during evaluation.**
Rejected: the graph is then known only after the form has been used, a cycle is
still a runtime discovery, and a branch not yet taken hides its edges entirely.
