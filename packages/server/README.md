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

Beta. Has authentication, role-based authorization, per-IP rate limiting, a
per-form origin allowlist, a request body cap, file uploads, drafts that carry
their own key, audit logging and an opt-in proof-of-work challenge; has no
submission tokens. Behind a reverse proxy the rate limits count the proxy
unless `FORMANCY_TRUST_PROXY` names it. Evaluate it; do not expose it publicly.

Docs: `apps/docs` (Quickstart: self-hosting) for the full endpoint walk-through.
