# 0024 — Postgres with JSONB, not MongoDB

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/server.integration.test.ts` runs the
  backend against a real `postgres:17-alpine` container, with no mocks, and
  asserts the guarantees this decision is taken for: "a valid submission is
  stored, bound to the exact version row" and "the database refuses to orphan a
  submission from its version". CI runs it through `pnpm test` in
  `.github/workflows/ci.yml`. The indexing strategy described under cost is
  designed but not built, and is therefore enforced by nothing.

## Context

A submission is a document of arbitrary shape, determined by a schema that
changes over time. That is the textbook argument for a document database, and
form.io — the product formancy is a response to — uses MongoDB. The decision
went the other way.

## Decision

Postgres with JSONB columns for schema and submission documents, reached
through Drizzle. Postgres 17 or 18; `compose.yaml` and the integration suite
both pin `postgres:17-alpine`.

The decisive argument is the transactional outbox. A submission insert, its
audit row and its webhook job must commit atomically. In Postgres with pg-boss
that is one transaction. In MongoDB it is either at-most-once delivery or a
change-stream pipeline that has to be built and then operated. "The webhook
fired but the submission rolled back" is the worst support burden a product can
have when the customer is the one running it.

## Consequences

**What it buys.** One container holds the relational data, the documents, the
job queue and full-text search, with no Redis and no Mongo beside it, which is
the difference between a self-hosted deployment someone will actually attempt
and one they will not. It also makes `submissions.form_version_id` a real
foreign key with `ON DELETE RESTRICT`, so orphaning a submission from the schema
that produced it is structurally impossible rather than merely discouraged
([0026](0026-bind-by-fk-and-hash.md)).

**What it costs.** GIN indexes on JSONB are expensive to update and weak for
range queries and sorting, which are exactly the queries a submissions table
attracts. The mitigation is to never blanket-index the `data` column: form
authors mark fields `indexed: true`, and publishing creates a per-form partial
expression index for those fields, plus one `jsonb_path_ops` GIN index for
containment. That mitigation is not implemented. The current schema indexes only
`api_keys.prefix`, because submissions are so far read only per form.

**What it forecloses.** The `Storage` port in
`packages/server-core/src/ports.ts` is nominally backend-agnostic, but
[0025](0025-immutability-in-the-database.md) and
[0026](0026-bind-by-fk-and-hash.md) push guarantees into the database itself. An
implementation over a store without transactions and referential integrity would
typecheck and then fail the integration suite, which is the intended outcome.

## Alternatives considered

**MongoDB.** Rejected on the outbox. The document model fits the data, and that
was never the question; atomicity across a submission and its side effects was.

**Postgres for relational data with Redis and a separate queue.** Rejected. It
buys a better queue at the price of three services to install, monitor and back
up consistently, and the atomicity problem returns at the boundary between them.
