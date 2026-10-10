# 7. Deployment view

## What exists today

Two paths, and which one somebody takes depends on whether they have a checkout.

```
from a checkout                      from the published image
compose.yaml                         compose.published.yaml
├─ postgres:17-alpine                ├─ postgres:17-alpine
│    host 5439 → container 5432      │    host 5439 → container 5432
│    healthcheck: pg_isready        │    healthcheck: pg_isready
│    volume: formancy-pg            │    volume: formancy-pg
└─ server, build: context .          └─ ghcr.io/…/formancy-server:$FORMANCY_VERSION
     Fastify on Node 22                    signed by digest, no latest tag
                                           volume: formancy-files
```

The second is the one the signing work was for: a self-hoster who builds their own
bytes has nothing to verify, and one who pulls them can check the cosign signature
and the CycloneDX attestation before starting anything
([0063](../decisions/0063-a-compose-file-for-the-published-image.md)).

**The right-hand column runs from `0.2.0` onward.** The release workflow builds, pushes
and signs the image; `v0.1.0` predates those steps, so no `v0.1.0` image exists. The file
was written ahead of the artefact deliberately — the first release to publish an image
should not also be the release that discovers nobody can run it. Checked 2026-10-09 with
`docker manifest inspect`: `v0.2.0` to `v0.4.0` are in the registry, `v0.1.0` and `latest`
are not.

Host port **5439**, not 5432, and the reason is written in the compose file: a
locally installed PostgreSQL on 5432 produces a silent collision that presents
as a wrong-password error, which costs an hour the first time.

`FORMANCY_VERSION` has no default in the published file, so compose stops rather
than starting a version nobody chose — there is no `latest` tag, because
`SOUP-DECLARATION.md` calls one uncharacterised software.

**Neither file runs an object store, and both can point at one.** The server
speaks S3 as of
[0064](../decisions/0064-an-object-store-behind-the-same-interface.md) and the
compose files pass the settings through; what they do not do is *host* a store,
because a fresh Garage node accepts no data until a layout is assigned, and that
is four commands after the container starts rather than anything compose can
declare. So the drawn default is still a local volume, and a deployment wanting
more than one replica runs Garage itself. Pointing at it blanks the volume as well —
`FORMANCY_FILES_DIR=""` in `.env`, which the server reads as no directory — because
compose can empty a variable but not remove one, and a server told about two stores
refuses to start.

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

A deployment may also name a model for its builders, and then the server is the one
place that talks to it: outbound HTTPS to `api.anthropic.com`, `api.openai.com` or
`api.x.ai`, whichever `FORMANCY_MODEL_PROVIDER` names, carrying the form a builder asked
about. The browser never calls a provider; the key never leaves the server
([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md)).

One database serves relational data, documents, the job queue, full-text
search and every rate limit's count
([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)).
No Redis and no second store, which is a deliberate property of the
PostgreSQL choice ([0024](../decisions/0024-postgres-over-mongodb.md)) and
matters most to the self-hoster who has no operations team.

## Two planes in one process

| | Public plane | Management plane |
|---|---|---|
| Who | Anyone, if the form opts in | Authenticated users and API keys |
| What | Submit, save and resume drafts, per-form OpenAPI | Form CRUD, publish, versions, submissions, export, users, keys |
| Authentication | None by default; `access.submit` defaults to `authenticated` | Session cookie (`jose` HS256) or API key (prefix + hash) |
| Authorisation | Origin allowlist and rate limits, and the proof-of-work challenge when it is configured. Every form is also handed out with a token its response is sent back with — not authorisation, but what makes a response stored once ([0169](../decisions/0169-a-response-is-stored-once.md)) | `can(actor, action, resource)` as a `preHandler`; 401 and 403 are distinguished |

The public plane is the highest-risk surface and is fail-closed by default: a
form is not publicly submittable unless it says so.

## Operational notes a self-hoster needs

- **Run exactly one replica, for the webhooks' sake.** The outbox worker's
  `claimDueDeliveries` takes no row lock, so every replica picks up the same
  due delivery and the receiver gets it once per replica — silently. The stable
  event id makes that survivable for a receiver that dedupes; it does not make
  it correct. `FOR UPDATE SKIP LOCKED` is the fix and is a contained change to
  one port method ([0049](../decisions/0049-one-polling-worker.md)). The rate
  limits were the other reason, and are not any more: below.
- **Every limit counts in the database, whichever replica answers.** One row per
  route and client in `rate_limit_counters`, an unlogged table the server adds on
  start; every limited request writes it, about half a millisecond against a
  database on the same machine (measured 2026-10-10) and a round trip more where
  it is elsewhere. A count that does not come back within a second is decided
  without one: submissions, drafts, challenges and file offers go through
  uncounted, and a login or a model request is refused with `503`. The process
  says so on standard error when the counter stops answering and when it starts
  again. The counter has four connections of its own, beside storage's up to ten,
  so `max_connections` wants fourteen a replica; they are its own so that a lock
  on its table holds up only the limited requests. A role granted table by table
  needs `SELECT`, `INSERT`, `UPDATE` and `DELETE` on it
  ([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)).
- **Name the reverse proxy, by its own address.** Every public rate limit counts the
  client's address, and the server believes no `X-Forwarded-For` until
  `FORMANCY_TRUST_PROXY` lists the proxy's address or range — so behind the proxy drawn
  above, with it unset, every respondent shares the proxy's one budget. Name only proxies
  you run: a trusted address can write any client address it likes. In a compose
  deployment that rules out the network's range, which holds the gateway Docker hands
  published-port connections over from — measured from the machine itself and from other
  containers. So the proxy gets a pinned `ipv4_address`, that address alone is named, and
  the server's port is not published behind it; the self-hosting guide has the override
  file. Checked in `packages/server/src/rate-limit-client.test.ts`; hazard D14;
  [0156](../decisions/0156-a-proxy-is-trusted-by-its-address.md).
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
- **A model is off until all three of its variables are set**, and half of them stops the
  server at startup. Set, the server needs outbound HTTPS to that one provider, each request
  sends the form it is about, every editor and admin can spend the key — ten requests a
  minute per session, whichever replica answers — and every request is in the audit log as `model.asked`,
  without its text. There is no default model: name one as the provider's documentation
  does, and change it when the provider retires it
  ([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md); hazards C8,
  C9 and D17).

## Configuration

Environment variables only; no configuration file. Secrets — the session
signing key and the database URL — have no defaults, so a deployment that
forgets one fails at startup rather than running with a well-known value.

`.env.example` is the documentation of them, and both compose files have to deliver
every one it mentions or the documentation is a description of something else.
That had already come apart once: `FORMANCY_CHALLENGE_SECRET` was documented at
length and passed through by neither file, so the proof-of-work challenge stayed
off on a deployment whose operator had set it and believed otherwise.
`packages/server/src/compose.test.ts` compares the two directions now.

The model's three variables are held the same way, and so is the model block of
`.env.example`: followed, it gives the server the model it names in both files; left out,
none.
