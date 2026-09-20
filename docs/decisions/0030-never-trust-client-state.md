# 0030 — Recompute every derived value on the server

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/use-cases.test.ts`, test "never
  trusts the client: hidden-branch data is stripped and computed lies are
  overwritten" — it posts a value into a branch the server evaluates as hidden
  and a forged `total`, and asserts the canonical result has neither. The same
  payload goes over HTTP into real Postgres in
  `packages/server/src/server.integration.test.ts`, test "a tampered submission
  is normalised". Both run under `pnpm test`, which CI runs on every push.

## Context

A submission arrives carrying values the client's engine computed, fields the
client considered hidden, and the client's own view of what was required. All
of it is attacker-controlled. Client-side validation is a UX feature; treating
it as a security boundary is the default mistake of every form product.

## Decision

The server resolves the version by hash policy, rebuilds the engine from that
exact version, and replays the submission through it. Every computed value is
recomputed and whatever arrived is overwritten. Visibility and requiredness are
evaluated from server context, and fields the server's own evaluation calls
hidden are stripped per [0013](0013-hidden-field-semantics.md). What is stored
is the canonical result of the replay, not the request body.

This can be a check rather than a second opinion only because of
[0006](0006-one-engine-build.md) and [0019](0019-injected-capabilities.md): the
same engine build, and a clock and randomness injected per request, so the
replay is byte-identical to what the client should have produced.

Validators will carry `runsOn: 'both' | 'client' | 'server'`. Without it a
uniqueness check, which only the server can perform, and a debounced hint,
which only the client should, cannot be expressed, and the answer becomes two
implementations that drift — the problem this project exists to prevent. That
field is decided and not yet in the schema; today only the spec's built-in
model validators exist.

## Consequences

**What it buys.** The stored row is trustworthy by construction. A client bug
cannot corrupt data, and a hostile client gains nothing by lying.

**What it costs.** Every submission pays a full engine build and replay, and
nothing caches it yet — `createSubmission` calls `createFormEngine` per
request. Caching the compiled program by schema hash is the intended answer and
is still owed.

**What it forecloses.** A client cannot send a value the schema does not
compute and expect it back. It also makes version binding mandatory rather than
advisory: a submission whose declared hash is not the current one is refused
with 409 and the current schema, because replaying it against a different
version would produce a canonical result for a form nobody filled in
([0026](0026-bind-by-fk-and-hash.md)).

## Alternatives considered

**Trust the client, validate shape only.** Rejected: it is the vulnerability.

**Validate on the server, store the request body.** Rejected: it keeps the
forged computed values, which is most of the damage.
