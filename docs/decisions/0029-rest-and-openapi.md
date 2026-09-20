# 0029 — REST with OpenAPI, not tRPC and not GraphQL

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** The REST half is held by
  `packages/server/src/server.integration.test.ts`, which drives the whole
  surface over HTTP against a real Postgres. The OpenAPI half is **not
  mechanically enforced, because it is not yet built**: `@fastify/swagger` is
  not a dependency of `@formancy/server`, no document is emitted or committed,
  so there is nothing for CI to diff. `apps/admin/src/api.ts` is still a
  hand-written client and says so in its header.

## Context

A self-hosted backend's API is a public product surface, not an internal detail
of the admin application. It will be called from Python scripts, wired into
n8n, and consumed by integrations nobody told us about. The shape of that
surface decides who can use formancy without writing TypeScript.

## Decision

REST, described by OpenAPI 3.1. `@fastify/swagger` emits the document,
`openapi-typescript` and `openapi-fetch` turn it into typed clients, and the
emitted document is committed as a snapshot so CI can diff it and a change to
the public surface shows up in review as a diff rather than as a surprise.

The per-form API needs no runtime code generation. One generic route family
under `/f/:path` resolves the current version, and the submission route rebuilds
the engine from that version's schema to validate the body, so every published
form is a working endpoint the instant it publishes. The intended companion is
`GET /f/:path/openapi.json`, a per-form document cached by schema hash that
works when pasted into Postman; that route does not exist yet.

## Consequences

**What it buys.** A curl command is the whole integration story for a language
we have never thought about. Publishing a form is the only deployment step —
there is no per-form code to generate, build or ship.

**What it costs.** REST needs more hand-written route plumbing than tRPC would:
every handler in `app.ts` narrows its own body and maps outcomes to status
codes. Worse, type safety is generated rather than inherent, so the generation
step has to actually run in CI or the types drift. That cost is already being
paid — the document does not exist, and the admin's client is a hand-maintained
mirror of the routes that nothing checks.

**What it forecloses.** Request shapes that only make sense to a TypeScript
caller. The version a client rendered travels as the `x-formancy-schema-hash`
header rather than as an inferred argument ([0010](0010-canonical-hash.md)).

## Alternatives considered

**tRPC.** Rejected specifically because it is TypeScript-to-TypeScript. It
would make every non-TypeScript consumer a second-class citizen, which for a
submission API is most of them.

**GraphQL.** Rejected: the wrong shape for a submission API, where the client
does not choose the fields — the schema does — and an operational burden on a
self-hoster who did not ask for a query planner.
