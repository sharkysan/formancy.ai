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

- **Run exactly one replica.** Two things break behind more than one, for
  unrelated reasons, and both are silent.
  `@fastify/rate-limit`'s default store is in-memory and therefore per-process,
  so the limit is multiplied by the replica count. And the outbox worker's
  `claimDueDeliveries` takes no row lock, so every replica picks up the same
  due delivery and the receiver gets it once per replica. The stable event id
  makes that survivable for a receiver that dedupes; it does not make it
  correct. `FOR UPDATE SKIP LOCKED` is the fix and is a contained change to one
  port method ([0049](../decisions/0049-one-polling-worker.md)).
- **Uploaded files are never served from the application origin inline.** A
  separate hostname is the right answer and a single-container deployment does
  not have one, so files come back with `Content-Disposition: attachment`,
  `nosniff` and a sandboxing CSP, and only to an authenticated caller — being
  allowed to submit a form is not being allowed to read what everybody else
  attached to it. Stored cross-site scripting via uploaded HTML or SVG is the
  most commonly exploited vulnerability in this product category, and forcing a
  download is the accommodation
  ([0055](../decisions/0055-files-are-claimed.md)).
- **Uploads are off until `FORMANCY_FILES_DIR` is set**, and in a container it
  has to be a mounted volume or the files go with the container. Not defaulted,
  because a volume is the one thing a self-hoster has to think about. The local
  store is also the second reason to run one replica: two containers with two
  volumes each accept uploads the other cannot serve.
- **Outbound webhook requests must resolve DNS themselves** and connect to the
  validated address with the original Host and SNI preserved. "Validate the URL
  then fetch it" is defeated by DNS rebinding, which is the difference between
  a mitigation and theatre. A self-hosted instance sits inside a private
  network, and webhook URLs are attacker-influenceable.
- **`FORMANCY_WEBHOOK_ALLOW_PRIVATE` turns that guard off installation-wide.**
  It exists because a receiver running as a sidecar on the same host cannot
  otherwise be delivered to at all, which is a worse outcome than an opt-in
  nobody has to touch. It is per deployment and never per form: the form
  document is the surface the guard is defending against, so putting the switch
  in it would hand the attacker the switch. `FORMANCY_WEBHOOK_ALLOW_HTTP` is
  the same shape, for plain http.
- **Deliveries are attempted within five seconds of being queued**, eight times
  over roughly a day with exponential backoff and full jitter, and then marked
  `dead` rather than deleted. A dead row is the evidence that something was
  supposed to be sent and never arrived; find them with
  `SELECT * FROM deliveries WHERE state = 'dead'`. Re-queueing one is a SQL
  statement today — there is no replay button yet.
- **The application database role needs `INSERT` and `SELECT` on `audit_log`
  and nothing else.** Append-only is a grant, not a convention.

## Configuration

Environment variables only; no configuration file. Secrets — the session
signing key and the database URL — have no defaults, so a deployment that
forgets one fails at startup rather than running with a well-known value.
