<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/server

The self-hostable formancy backend: Fastify routes and Postgres storage over
`@formancy/server-core`.

```bash
docker compose up -d     # Postgres on :5439
DATABASE_URL=… FORMANCY_AUTH_SECRET=… pnpm --filter @formancy/server dev
```

## Two load-bearing decisions

**Invariants live in the database, because application code can be bypassed.**
A published `form_versions` row can never be updated — a trigger raises instead
— and a submission's foreign key to its version is `ON DELETE RESTRICT`, so
orphaning a submission from the schema that produced it is structurally
impossible. Both are proven by integration tests that try to break them against
a real Postgres.

**Two planes, split on purpose.** The public plane (resolve, submit, drafts)
needs no identity, because that is what a person filling in a form needs. The
management plane (publish, catalog, submissions, export, users, keys) requires a
session token or an API key. `401` means you have no identity; `403` means you
have one that lacks the permission.

## Tests

Integration tests run against a disposable Postgres via Testcontainers rather
than mocks — versioning and submission bugs only manifest under real SQL
semantics. Docker must be running.

## Status

Pre-alpha. Has authentication and role-based authorization; does **not** yet
have rate limiting, anonymous-submission hardening, audit logging or file
uploads. Evaluate it; do not expose it publicly.

Docs: `apps/docs` (Quickstart: self-hosting) for the full endpoint walk-through.
