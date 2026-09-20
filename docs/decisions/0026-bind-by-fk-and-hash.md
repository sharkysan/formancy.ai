# 0026 — Bind a submission to its version by foreign key and by hash

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `submissions.form_version_id` in
  `packages/server/src/db.ts` is declared `ON DELETE RESTRICT`, and
  `form_versions.schema_hash` is written by `publishForm` from `schemaHash()` in
  `packages/spec/src/hash.ts`. Two tests in
  `packages/server/src/server.integration.test.ts` hold it: "a valid submission
  is stored, bound to the exact version row" joins the submission back to its
  version and compares the stored hash with the one the client declared, and
  "the database refuses to orphan a submission from its version" asserts that
  deleting the version fails.

## Context

A stored submission has two unrelated needs. It must be joinable back to the
schema that produced it, cheaply and with referential integrity. And it must be
possible to tell that the pair has been tampered with. One column does not serve
both. A foreign key proves nothing about content, and a hash cannot be joined
on.

## Decision

Store both. `form_version_id` is a real foreign key with `ON DELETE RESTRICT`,
which gives joins and makes orphaning structurally impossible. `schema_hash`, a
SHA-256 over the canonical serialisation ([0010](0010-canonical-hash.md)), gives
tamper evidence: if the submission and the version it points at disagree,
something changed that should not have.

The client also declares what it rendered, in an `X-Formancy-Schema-Hash`
header. The specified default `staleVersionPolicy` is `acceptCompatible` — any
older version whose diff to current is compatible is accepted — and everything
else returns `409 FORM_VERSION_CHANGED` with the current schema in the body, so
the client can re-render rather than guess.

## Consequences

**What it buys.** An auditor can reconstruct exactly what a person saw, and can
tell whether anyone has edited the record since. The 409 carries the new schema,
which turns a version race into a re-render instead of a lost submission.

**What it costs.** Two bindings that must agree, and a hash that every writer
has to compute the same way. That discipline is what
[0010](0010-canonical-hash.md) buys by refusing to silently drop `undefined`,
`NaN` and `Infinity` rather than letting JSON decide.

Two gaps are worth naming. The hash currently lives only on the version row and
is reached by a join; the submission row does not yet carry its own copy, so
tamper evidence today rests on the version row being immutable
([0025](0025-immutability-in-the-database.md)). And the shipped server
implements the strict end of the policy: every mismatched hash is refused, with
the comment in `packages/server-core/src/use-cases.ts` saying so. Accepting
compatible older versions is specified and not yet built.

## Alternatives considered

**The foreign key alone.** Rejected: it survives a hand-edited row without
complaint, which is the case that matters.

**The hash alone.** Rejected: no referential integrity, no index, and a
submission whose version has been deleted looks identical to one whose hash was
never computed.
