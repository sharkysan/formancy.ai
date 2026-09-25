---
title: "Quickstart: self-hosting"
description: Run the formancy backend locally with Docker and Postgres, and walk its two HTTP planes end to end.
---

:::caution[Pre-alpha]
This backend is pre-alpha. It has authentication, role-based authorization,
per-IP rate limiting, a per-form origin allowlist, a request body cap, file
uploads and audit logging — but no proof-of-work challenge, no submission
tokens and no virus scanning of what people attach. Treat it as something to evaluate, not something to expose to the
public internet.
:::

## Run it

```bash
docker compose up -d          # Postgres on host port 5439

DATABASE_URL=postgres://formancy:formancy@localhost:5439/formancy \
FORMANCY_AUTH_SECRET=$(openssl rand -base64 33) \
FORMANCY_ADMIN_EMAIL=root@example.com \
FORMANCY_ADMIN_PASSWORD=a-long-first-password \
  pnpm --filter @formancy/server dev    # API on :4380
```

The server creates its own tables on first start, so there is no migration step
to run before you can try it.

:::note[Why port 5439?]
`5432` is taken on a great many developer machines by a locally installed
Postgres, and that collision presents as an authentication failure against the
wrong database — a confusing ten minutes. The compose file maps 5439 instead.
:::

### Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `FORMANCY_AUTH_SECRET` | in production | Signs session tokens; ≥ 32 characters. If unset, an ephemeral one is generated and every session dies on restart — the server warns when it does this. |
| `FORMANCY_ADMIN_EMAIL` / `..._PASSWORD` | first run | Creates the first admin, and **only** while no such user exists. It cannot re-seed an admin into a running installation. |
| `PORT` / `HOST` | no | Defaults `4380` / `0.0.0.0` |

## Two planes

The API is split deliberately.

**The public plane** needs no identity, because it is what a person filling in a
form needs: read the form, save a draft, submit.

**The management plane** is everything an operator does, and requires either a
session token or an API key. `401` means you have no identity; `403` means you
have one that lacks the permission — the difference tells a client whether to
log in or to give up.

### Roles

| | `viewer` | `editor` | `admin` |
| --- | --- | --- | --- |
| read forms, read submissions | ✅ | ✅ | ✅ |
| publish forms, export CSV, write drafts | | ✅ | ✅ |
| create users and API keys | | | ✅ |

An action nobody has been granted is denied. Permissions are granted by
presence, never by omission.

## A walk through both planes

### Log in

```bash
TOKEN=$(curl -s -X POST localhost:4380/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"root@example.com","password":"a-long-first-password"}' \
  | python -c 'import sys,json; print(json.load(sys.stdin)["token"])')
```

A wrong password and an unknown email return the identical `401` body, and both
run a password verification. The difference would otherwise be a way to
enumerate who has an account.

### Publish a form (management)

```bash
curl -X POST localhost:4380/forms \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"path":"contact-us","schema":{
        "specVersion":"0","id":"contact","title":"Contact us",
        "model":{"fields":[{"key":"email","type":"text","label":"Email","required":true}]}}}'
# → 201 {"version":1,"schemaHash":"52b5…"}
```

Publishing is the **save gate**. The document is validated structurally, then
compiled by the engine itself — so a form whose logic could loop, or that reads
a field which does not exist, is refused here (`422`) and never persisted.
Publishing the identical document twice does not manufacture a second version.

### Read the form (public)

```bash
curl localhost:4380/f/contact-us
# → {"version":1,"schemaHash":"52b5…","schema":{…}}
```

### Submit (public)

The client must declare the schema hash it actually rendered:

```bash
curl -X POST localhost:4380/f/contact-us/submissions \
  -H 'content-type: application/json' \
  -H 'x-formancy-schema-hash: 52b5…' \
  -d '{"email":"someone@example.com"}'
# → 201 {"id":"…","data":{"email":"someone@example.com"}}
```

Three things happen that are easy to miss:

- The server **replays the engine** over your payload. Computed values are
  recomputed and overwrite whatever you sent; fields the server evaluates as
  hidden are stripped. A client cannot smuggle data into a hidden branch.
- What is stored is that canonical result, bound to the exact schema version
  that produced it.
- An invalid submission comes back `422` with the *same* error shape the
  client's engine produces, so server errors render through the same code path
  as local ones.

A stale hash gets `409 FORM_VERSION_CHANGED` with the current schema attached,
so the client can re-render and keep what it can rather than guess why it was
refused.

### Drafts (public)

```bash
curl -X PUT localhost:4380/f/contact-us/drafts/draft-1 \
  -H 'content-type: application/json' -d '{"email":"half-way@"}'

curl localhost:4380/f/contact-us/drafts/draft-1
```

Resuming a draft after the form was republished migrates it **lazily** — see
[Versioning](/concepts/versioning/) for the severity rules.

### Submissions and export (management)

```bash
curl -H "authorization: Bearer $TOKEN" localhost:4380/f/contact-us/submissions
curl -H "authorization: Bearer $TOKEN" localhost:4380/f/contact-us/submissions/export.csv
```

The CSV unions its columns across every schema version the form has had, so
data outlives the field that collected it. Values that a spreadsheet would
execute as a formula are neutralised on the way out.

### Machine access

```bash
curl -X POST localhost:4380/api-keys \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"ci","role":"editor"}'
# → 201 {"id":"…","secret":"fmc_…"}
```

That response is the only time the secret exists in full: storage keeps a prefix
for lookup and a hash for verification. Present it as `x-formancy-api-key`.

## Endpoint summary

| Method | Path | Plane | Permission |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | public | — |
| `POST` | `/users` | management | `user.create` |
| `POST` | `/api-keys` | management | `apiKey.create` |
| `POST` | `/forms` | management | `form.publish` |
| `GET` | `/forms` | management | `form.read` |
| `GET` | `/f/:path/versions` | management | `form.read` |
| `GET` | `/f/:path/submissions` | management | `submission.read` |
| `GET` | `/f/:path/submissions/export.csv` | management | `submission.export` |
| `GET` | `/f/:path` | public | — |
| `POST` | `/f/:path/submissions` | public | — |
| `PUT` `GET` | `/f/:path/drafts/:draftId` | public | — |

## The audit log

Every publish, permission change, login (including the failures), submission,
**submission read and export** is recorded. `GET /audit` reads it back, newest
first, and needs an admin.

The reads are the point: a log of mutations tells you who changed the form, not
who downloaded four thousand people's answers. What it never holds is the
answers themselves — identifiers and counts only, because a log read by more
people and kept longer than the data it describes should not be a second copy
of it.

The table is append-only, enforced by a trigger. **Give the application's
database role `INSERT` and `SELECT` on `audit_log` and nothing else**: the
trigger is the belt, the grant is the braces, and the grant is the part only
you can do.

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM formancy;
```

## The admin app

`pnpm --filter @formancy/admin dev` serves a schema editor with live preview,
publish, version history and a submissions table on `:4382`, proxying `/api` to
the server. The backend sets no CORS headers on purpose — cross-origin policy is
its own piece of work, and a permissive development default would outlive
development.
