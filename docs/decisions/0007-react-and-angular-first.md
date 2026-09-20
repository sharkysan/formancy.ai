# 0007 — React and Angular first; Vue deferred

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** The deferral itself is not mechanically enforced — nothing
  fails if a Vue package appears. What is checkable is the state it leaves:
  `pnpm-workspace.yaml` carves out no Vue package, and `describeConformance` is
  bound in exactly two places, `packages/react/src/conformance.test.tsx` and
  `packages/angular/src/conformance.test.ts`, neither of which passes a skip
  map. The framework-neutrality this ordering was meant to buy is therefore held
  in place: both renderers run identical fixtures with nothing excused.

## Context

The original ask named Angular, React and Vue, with Angular and React first.
Three renderers at v0.1 is three times the conformance surface before the
abstraction underneath has been proven once, and an abstraction that has been
proven zero times is a guess.

## Decision

React and Angular only. Vue leaves the roadmap until v2: no Vue packages are
carved out and there is no Vue driver in the conformance run. The engine
protocol stays Vue-ready. Angular is built second, not last.

## Consequences

**What it buys.** The build order is the real content of this decision. Angular
22 is zoneless and OnPush by default, so binding an external non-signal store
naively produces either missed updates or a whole-form re-render per keystroke.
Meeting that while the React binding is days old forces the engine's
subscription API to be genuinely framework-neutral rather than React-shaped, at
a point where changing it is still cheap. Built last, that layer would instead
have become an adapter around whatever React happened to want.

**What it costs.** Vue users get nothing at v1, and a real share of the people
who would have tried formancy cannot. Accepted, because when Vue returns it is
the architecture's exam: if it is a small job the abstraction held, and if it is
a large one it leaked.

**What it forecloses.** Nothing permanent in the design. The cost is paid in
adoption rather than in structure, and it is paid for as long as the deferral
lasts.

## Alternatives considered

**All three renderers at v0.1.** Rejected: it triples the conformance surface
before there is any evidence that the shared layer is worth sharing.

**Angular last.** Rejected. Angular is the framework most likely to break the
subscription design, so finding that out after two renderers had settled on it
would mean changing both of them.
