# 3. Context and scope

## Business context

```
                    ┌──────────────────────────┐
   form author ────▶│                          │
   (builder UI)     │        formancy          │
                    │                          │
  app developer ───▶│  spec · engine · render  │◀─── person filling in a form
  (npm packages)    │  builder · server        │     (browser)
                    │                          │
                    └────────┬─────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        PostgreSQL     object storage    webhook
        (submissions,  (uploaded files,  receivers
         versions,      v0.2)            (v0.2)
         audit, jobs)
```

| Party | Exchanges |
|---|---|
| **Application developer** | Consumes the npm packages. Supplies a schema and their own components; receives engine state and ARIA wiring |
| **Form author** | Edits a schema through the builder or the admin app. Receives validation errors at authoring time, including cycle traces |
| **Person filling in a form** | Sends answers; receives visibility, requiredness, calculated values and validation messages |
| **Self-hoster** | Operates the container. Supplies configuration; receives submissions, exports and audit records |
| **PostgreSQL** | Stores forms, immutable versions, submissions, drafts, audit rows and the job queue. One database; no Redis and no second store ([0024](../decisions/0024-postgres-over-mongodb.md)) |
| **Webhook receivers** | Receive submission events over HTTPS, signed with Stripe's scheme and carrying an event id stable across retries, so a receiver can verify and dedupe with code it already has ([0048](../decisions/0048-webhook-delivery.md)) |

## Technical context

| Interface | Protocol | Notes |
|---|---|---|
| Packages → application | ESM imports, typed | No CommonJS build ([0038](../decisions/0038-esm-only.md)) |
| Browser → server, public plane | HTTP, unauthenticated by opt-in | Submission and draft endpoints. `X-Formancy-Schema-Hash` declares what the client rendered |
| Admin → server, management plane | HTTP, authenticated | Session cookie or API key; `can(actor, action, resource)` on every route |
| Per-form API | HTTP, generated without codegen | `/f/:path/*` resolves the version and injects the schema-derived validator; `/f/:path/openapi.json` describes it ([0029](../decisions/0029-rest-and-openapi.md)) |
| Server → PostgreSQL | SQL over the `postgres` driver via Drizzle | Submission, audit row and job enqueue commit in one transaction |

## What is deliberately outside the boundary

- **Identity.** formancy is an OIDC *client*, never an identity provider. Local
  accounts exist for `docker compose up` ergonomics and are not the intended
  production mode.
- **Markup and styling.** The renderers emit the application's components and
  no CSS at all. The two shipped themes are separate packages that nothing
  depends on, and exist to demonstrate that claim rather than to satisfy it
  ([0008](../decisions/0008-layered-packages.md)).
- **Clinical or domain meaning.** The engine validates what the form author
  wrote and knows nothing about what is being collected. See
  [`../regulatory/MDR-CONTEXT.md`](../regulatory/MDR-CONTEXT.md).
- **Encryption at rest and transport security.** Deployment responsibilities.
