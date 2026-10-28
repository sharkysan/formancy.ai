# 0208 — The published JavaScript carries no JSDoc, and core's budget is a gate

- **Status:** accepted
- **Date:** 2026-10-28
- **Extends:** [0038](0038-esm-only.md), whose *Verified by* line said no bundle gate existed
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/bundles.test.ts`. *Hold every budget they have* fails when a
  bundle with a budget measures more than the Limit its §9.3 row states — watched failing with
  core's limit set to 17 kB against its 17.8 — and excuses only React, by a named reason. *Are the
  figures a fresh measurement gives* holds each figure to the built output, re-measured here. The
  declarations still carry their documentation: 190 JSDoc blocks in core's `.d.mts`, 67 in React's,
  counted after the change.

## Context

The bundler kept every JSDoc comment in the JavaScript it emitted. That is where the documentation
of an exported function lives in the source, so the published files carried it twice — in the
declarations, where an editor reads it, and in the JavaScript, where nothing does but the network.
Measured: about a third of what a consumer downloaded. `@formancy/core` stood at 25.8 kB against an
18 kB budget, and the source had grown a habit around it — internal modules written in block
comments, and a public function's long explanation split into a block comment and one JSDoc line.

## Decision

**Every package built with tsdown emits its JavaScript with no JSDoc**, through rolldown's
`comments: { jsdoc: false, legal: true, annotation: true }`. Legal comments stay, and so do the pure
annotations a consumer's bundler tree-shakes by. The declarations are built separately and keep
every comment, so an editor shows what it showed before.

**Core's budget is a gate.** Its 18 kB was set long before the bundle met it, so holding the bundle
to it is not a threshold chosen to pass; the test reads the limit from §9.3's own table. React's
4 kB is excused, by name: it was written for a tree-shaken entry and the row measures the whole
barrel, and which it meant is not settled (§11.2).

Re-measured on 2026-10-28: core 25.8 → 17.8 kB, React 26.1 → 15.2, the spec barrel 30.1 → 16.3,
`/words` 13.1 → 9.5.

## Consequences

**A comment's kind no longer changes what is shipped.** Writing internal comments as block comments
to keep them out of the bundle is unnecessary from now on; the existing ones stay, and their
explanations that said otherwise are corrected.

**Core can no longer grow past 18 kB unnoticed.** The next construct that needs more fails the gate,
and the choice — make room, or raise the budget in §9.3 with a reason — is made on purpose.

**The Angular packages are unchanged.** They are built by ng-packagr, not tsdown, and none has a
budget in §9.3.

## Alternatives considered

**Minify the published JavaScript.** Smaller still, and a consumer's stack trace and a debugger
stepping through a dependency read mangled names. Consumers minify for themselves.

**Keep writing block comments.** It worked for one module at a time, and it put a build concern
into every comment a person writes.
