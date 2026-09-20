# 4. Solution strategy

The five ideas the rest of the design follows from. Each links to the decision
record that argues it.

## 1. One engine, two runtimes

Behaviour lives in a headless package with no framework, DOM or Node
dependency, and the *same compiled build* runs in the browser and on the
server ([0004](../decisions/0004-headless-core.md),
[0006](../decisions/0006-one-engine-build.md)).

This is what makes "client and server cannot disagree" a structural property
rather than a testing goal. Everything awkward about the engine — the injected
clock, the regular-expression format checks, the absence of `node:crypto` — is
the price, paid deliberately.

## 2. Determinism, so a replay is a check

The engine reads no ambient clock and no ambient randomness; both are injected
and frozen for the duration of a pass, and the server pins them per submission
([0019](../decisions/0019-injected-capabilities.md)).

Without this, server revalidation would be a second opinion that could
legitimately differ from the first. With it, the server recomputes everything
the client computed and overwrites it
([0030](../decisions/0030-never-trust-client-state.md)), and any difference is
a defect rather than a timing artefact.

## 3. A non-Turing-complete expression language

CEL cannot loop or recurse, so termination is guaranteed by construction rather
than by a sandbox ([0016](../decisions/0016-cel.md)). More importantly, its AST
yields exact static variable references — which is what makes the dependency
graph knowable ahead of time, so cycles are rejected **when the form is saved**
rather than discovered when someone is filling it in
([0018](../decisions/0018-static-dependencies.md)).

That converts a runtime hazard into an authoring-time error message, which is
the right place for it when the author is not a programmer.

## 4. Identity-stable snapshots as the reactivity contract

A field's snapshot changes identity only when that field's observable state
changes ([0020](../decisions/0020-identity-stable-snapshots.md)).

One property satisfies two very different reactivity systems: React's
`useSyncExternalStore` needs it to avoid tearing and to work without consumer
memoisation, and Angular's zoneless `OnPush` needs it to see the change at all.
Designing for both at once is why Angular was built second rather than last.

## 5. Specify behaviour once, as data

Correctness is a set of JSON fixtures executed against every implementation —
the engine in Node, the engine in a browser, both renderers, and the server
([0033](../decisions/0033-one-suite-n-drivers.md)). The driver may find
elements only by role and accessible name
([0034](../decisions/0034-accessible-name-only.md)).

This is the answer to the chosen architecture's largest risk, which is that the
two renderers drift. It also makes accessibility structural: markup that a
screen reader cannot navigate is markup the test suite cannot drive.

---

## Two organising rules that follow

**If a property describes what the data must be, the engine enforces it; if it
describes how something looks, the renderer decides.** A property enforced in
two renderers will eventually be enforced differently in two renderers
([0023](../decisions/0023-model-properties-in-engine.md)). This is why `minItems`
seeding, label resolution, id generation and ARIA composition all live in the
engine.

**Fail open on metadata, fail closed on validation.** A visibility rule that
throws shows the field; a validation rule that throws rejects the submission
([0022](../decisions/0022-fail-open-fail-closed.md)). Confusion is recoverable;
unchecked data in a database is not.
