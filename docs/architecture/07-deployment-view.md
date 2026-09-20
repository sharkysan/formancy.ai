# 7. Deployment view

## What exists today

```
developer machine
├─ docker compose up -d
│    └─ postgres:17-alpine   host port 5439 → container 5432
│                            healthcheck: pg_isready
│                            volume: formancy-pg
└─ pnpm --filter @formancy/server dev
     └─ Fastify on Node 22
```

Host port **5439**, not 5432, and the reason is written in the compose file: a
locally installed PostgreSQL on 5432 produces a silent collision that presents
as a wrong-password error, which costs an hour the first time.

**There is no server container image yet.** It arrives with the distribution
work, along with the cosign signature and the CycloneDX SBOM. Recorded here
rather than drawn as though it exists.

## The intended deployment

```
                      ┌────────────────────────────┐
     browsers ───────▶│  reverse proxy / TLS        │
                      └──────────────┬─────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │      formancy server (Node)      │  × N replicas
                    │  ┌──────────────┬─────────────┐  │
                    │  │ public plane │ mgmt plane  │  │
                    │  └──────────────┴─────────────┘  │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │          PostgreSQL 17/18        │
                    │  forms · form_versions           │
                    │  submissions · submission_revs   │
                    │  drafts · files · actions        │
                    │  action_runs · idempotency_keys  │
                    │  audit_log · users · api_keys    │
                    │  form_permissions · pgboss.*     │
                    └──────────────────────────────────┘
                                     │
                              (v0.2) object storage
                                     for uploaded files
```

One database serves relational data, documents, the job queue and full-text
search. No Redis and no second store, which is a deliberate property of the
PostgreSQL choice ([0024](../decisions/0024-postgres-over-mongodb.md)) and
matters most to the self-hoster who has no operations team.

## Two planes in one process

| | Public plane | Management plane |
|---|---|---|
| Who | Anyone, if the form opts in | Authenticated users and API keys |
| What | Submit, save and resume drafts, per-form OpenAPI | Form CRUD, publish, versions, submissions, export, users, keys |
| Authentication | None by default; `access.submit` defaults to `authenticated` | Session cookie (`jose` HS256) or API key (prefix + hash) |
| Authorisation | Origin allowlist, submission token, rate limits | `can(actor, action, resource)` as a `preHandler`; 401 and 403 are distinguished |

The public plane is the highest-risk surface and is fail-closed by default: a
form is not publicly submittable unless it says so.

## Operational notes a self-hoster needs

- **`@fastify/rate-limit`'s default store is in-memory and therefore
  per-process.** Behind more than one replica it does not do what it appears to
  do. This is a silent footgun and is called out in the documentation rather
  than left to be discovered.
- **Never serve uploaded files from the application origin.** A separate
  hostname, or forced `Content-Disposition: attachment` with `nosniff` and a
  restrictive CSP. Stored cross-site scripting via uploaded HTML or SVG is the
  most commonly exploited vulnerability in this product category. (Files are
  v0.2; the rule is recorded now because it constrains the design.)
- **Outbound webhook requests must resolve DNS themselves** and connect to the
  validated address with the original Host and SNI preserved. "Validate the URL
  then fetch it" is defeated by DNS rebinding, which is the difference between
  a mitigation and theatre. A self-hosted instance sits inside a private
  network, and webhook URLs are attacker-influenceable.
- **The application database role needs `INSERT` and `SELECT` on `audit_log`
  and nothing else.** Append-only is a grant, not a convention.

## Configuration

Environment variables only; no configuration file. Secrets — the session
signing key and the database URL — have no defaults, so a deployment that
forgets one fails at startup rather than running with a well-known value.
