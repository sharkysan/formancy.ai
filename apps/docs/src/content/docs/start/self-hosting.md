---
title: "Quickstart: self-hosting"
description: Run the formancy backend locally with Docker and Postgres, and walk its two HTTP planes end to end.
---

:::caution[Beta, and not for a public deployment]
This backend has authentication, role-based authorization, per-IP rate limiting, a
per-form origin allowlist, a request body cap, file uploads, drafts that carry their own
key, audit logging and an opt-in proof-of-work challenge
(`FORMANCY_CHALLENGE_SECRET`, below), and it scans every upload before keeping it when you
run ClamAV (`FORMANCY_CLAMD_HOST`, below) — but no submission tokens.

It writes a [request log](#the-request-log) to standard output — a line per request and
per error, built from a list of fields, so no answer or credential can reach it — and the
[audit log](#the-audit-log) records what was done to whose data.

Treat it as something to evaluate, not something to expose to the public internet.
:::

## Run it

Two ways in, and which one you want depends on whether you have the repository.

### From the published image

:::caution[From 0.2.0 onward]
The release workflow builds, pushes and signs the image. `v0.1.0` predates those steps
and signed only the SBOM, so there is no `v0.1.0` image — if `docker pull` answers
`manifest unknown`, the release has not landed yet and [a checkout](#from-a-checkout) is
the way in. Stated rather than left to be discovered as an error.
:::

No checkout, no build toolchain, no Node on the host — the release publishes the
server image to GitHub Container Registry and signs it by digest:

```bash
curl -O https://raw.githubusercontent.com/sharkysan/formancy.ai/main/compose.published.yaml
curl -O https://raw.githubusercontent.com/sharkysan/formancy.ai/main/.env.example
cp .env.example .env          # then follow what it says

FORMANCY_VERSION=v0.2.0 docker compose -f compose.published.yaml up -d
```

`v0.2.0` is the oldest release with an image; pin the one you want. `FORMANCY_VERSION` has no
default and compose stops without it, because there is no `latest` tag to fall
back on. That is deliberate: the
[SOUP declaration](https://github.com/sharkysan/formancy.ai/blob/main/docs/regulatory/SOUP-DECLARATION.md)
tells a manufacturer to pin an exact version and says `latest` is not
characterised software, so a compose file that quietly defaulted to one would be
this project contradicting its own advice in the most convenient place to do it.

**Verify the image before you run it.** A signature nobody checks is decoration,
and the commands are in
[`RELEASING.md`](https://github.com/sharkysan/formancy.ai/blob/main/RELEASING.md).

### From a checkout

```bash
docker compose up -d          # builds the server; Postgres on host port 5439

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
| `FORMANCY_FILES_DIR` | no | Where uploaded bytes go on local disk. Unset — or empty — means this deployment accepts no files, which is a supported state — see [Files](/docs/concepts/files/). One replica only. Both compose files set it to their volume unless `.env` says otherwise. |
| `FORMANCY_S3_ENDPOINT` | no | An S3-compatible object store instead of a directory, which is what more than one replica needs. Setting it makes the four below required and refuses a non-empty `FORMANCY_FILES_DIR` alongside it. Empty is unset. |
| `FORMANCY_S3_BUCKET` / `..._REGION` | with the endpoint | No defaults: a guessed bucket uploads into nothing, and the region is part of the request signature rather than a label — a wrong one is rejected. |
| `FORMANCY_S3_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | with the endpoint | No defaults. Wrong credentials would otherwise look like a store where every file is missing. |
| `FORMANCY_MAX_FILE_BYTES` | no | The operator's ceiling over every form's own `maxFileSize`, in bytes. Defaults to 10 MB. A whole number from 1 to 2147483647 — the largest size the files table records — or the server does not start. |
| `FORMANCY_CLAMD_HOST` | no | A ClamAV daemon asked about every upload before its bytes are kept. Unset means nothing is scanned; set, a file is refused when clamd finds something **or cannot be reached** — see [Files](/docs/concepts/files/#scanning-what-is-uploaded). |
| `FORMANCY_CLAMD_PORT` / `..._MAX_BYTES` | no | clamd's port, 3310 by default, and its `StreamMaxLength`, 100 MiB by default. A larger file is refused before it is sent. |
| `FORMANCY_CHALLENGE_SECRET` | no | Turns the proof-of-work challenge on for anonymous submissions; ≥ 32 characters. Unset means public forms are defended by the rate limits, the origin allowlist and the body cap alone. Separate from `FORMANCY_AUTH_SECRET` so that rotating one does not cost everybody their session. |
| `FORMANCY_TRUST_PROXY` | behind a proxy | The reverse proxies whose `X-Forwarded-For` names the client: an address, or a comma-separated list of addresses and CIDR ranges. Unset trusts none, so behind a proxy every respondent shares one rate-limit budget. Name the proxy's own address, not the compose network's range: the range holds the gateway Docker forwards published ports from — see [behind a reverse proxy](#behind-a-reverse-proxy). |
| `FORMANCY_MODEL_PROVIDER` | no | `anthropic`, `openai` or `xai`: a model for the builders, asked through this server so its key never reaches a browser. With it, the two below are required; without it, neither may be set, and a half configuration stops the server at startup. See [a model for the builders](#a-model-for-the-builders). |
| `FORMANCY_MODEL_API_KEY` / `FORMANCY_MODEL` | with the provider | The provider's key, and the model as the provider's documentation names it. There is no default model. |
| `FORMANCY_LOG_LEVEL` | no | How much the [request log](#the-request-log) writes: `info` by default, which is every request; `warn` or `error` for only what went wrong; `off` for nothing. `fatal`, `debug` and `trace` are the other names, pino's. Anything else, `INFO` included, stops the server at startup. |
| `FORMANCY_WEBHOOK_ALLOW_HTTP` / `..._ALLOW_PRIVATE` | no | Opt out of the webhook SSRF guard, per deployment and never per form. `ALLOW_PRIVATE` gives it up entirely. |
| `PORT` / `HOST` | no | Defaults `4380` / `0.0.0.0` |

## Behind a reverse proxy

Put the server behind one for TLS, as the
[deployment view](https://github.com/sharkysan/formancy.ai/blob/main/docs/architecture/07-deployment-view.md)
draws it — and then tell the server it is there. Every limit on the public plane counts
the client's address, and behind a proxy every request arrives from the proxy's. Until the
server believes the `X-Forwarded-For` header the proxy adds, all your respondents share one
budget, and the thirty-first submission in a minute is refused whoever sends it.

```bash
FORMANCY_TRUST_PROXY=172.30.0.10                    # the proxy's address
FORMANCY_TRUST_PROXY=172.30.0.10,198.51.100.0/24    # several proxies, or a range of them
```

The proxy has to add the header — in nginx,
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` — and every proxy in the
chain is named: a CDN in front of nginx is two.

### Name the proxy, and nothing around it

**Name only proxies you run.** Anything at a trusted address can write whatever client
address it likes into `X-Forwarded-For`, so trusting an address somebody else can send from
lets them choose the address their limit counts — a fresh one per request, which is no
limit. That is why `true` is refused, and a range of every address with it. A client that
reaches the server from an address you have not named is counted by that address, whatever
it writes.

In a Docker deployment the address somebody else can send from is the one you would least
suspect. **The compose network's range holds its gateway, and Docker hands connections over
from the gateway.** Measured on 2026-10-09 with Docker 29.8 on Linux: a connection to the
published port from the machine itself — over loopback or over the machine's network address
— reached the server from the network's gateway, and so did one from a container on any
other Docker network. With the network's range named, 31 submissions from the machine,
each writing a different `X-Forwarded-For`, were all admitted, where the thirty-first should
have been refused. Under Docker Desktop and rootless Docker, connections from other machines
may arrive from the gateway too — not measured here, so assume they do.

So name the proxy's own address, make that address stay put, and stop publishing the
server's port. Which address that is depends on where the proxy runs.

**A proxy in the same compose project.** Give the network a subnet and the proxy an address
in it, and take the server's port away: the proxy reaches the server at `server:4380`, so a
published port is only a way around it. A `compose.override.yaml` beside `compose.yaml` is
read without being asked; with the published file, name both
(`-f compose.published.yaml -f compose.override.yaml`).

```yaml
services:
  server:
    ports: !reset []              # reached through the proxy and nothing else
  proxy:
    image: nginx:1.27-alpine      # its configuration and certificates as usual
    ports: ["443:443"]
    networks:
      default:
        ipv4_address: 172.30.0.10
networks:
  default:
    ipam:
      config:
        - subnet: 172.30.0.0/24   # any range no other network on the machine uses
```

Then `FORMANCY_TRUST_PROXY=172.30.0.10` in `.env`, and `docker compose down` before
`docker compose up -d`, because a network takes a subnet only when it is created. Without
`ipv4_address` the proxy has whichever address is free when it starts, which is why it is
written down. Measured the same day, with Compose 5.5 and nginx 1.27: `127.0.0.1:4380`
refused the connection; a client reaching the server directly
— from the machine at the container's address, or from another container on the network —
was counted by the address it arrived from, whatever it wrote; two clients behind the proxy
were counted apart, and the one that sent 31 was refused at the thirty-first; and the proxy
came back from being recreated at the same address.

**A proxy on the machine itself** — nginx or Caddy installed on the host, forwarding to
`127.0.0.1:4380`. Its connections arrive from the gateway, so the gateway is the address to
name, and naming it trusts everything else that arrives from there. Publish the port on
loopback alone, as the compose files already do for Postgres — `ports: !override
["127.0.0.1:4380:4380"]` in the override — pin the subnet as above, and name the gateway,
which is the subnet's first address: `172.30.0.1` there. Measured: with the port on
loopback, a container on another network could no longer connect to it. What remains is
that **every process on that machine can choose the address it is counted by** — measured
too, 31 from loopback with the gateway named, all admitted. That is the price of this
arrangement, and a proxy inside the compose project does not pay it.

### What the server refuses

Addresses and CIDR ranges are all it reads; anything else stops it at startup with a
sentence saying what to write. Three of the refusals are things Fastify, which the server is
built on, would accept:

- **A hop count.** Fastify takes one and ignores it, because a count cannot tell the proxy
  from a client that connects directly — and a setting that reads as configured and does
  nothing is worse than none.
- **`true`**, which believes anybody.
- **A name for a range** — `loopback`, `linklocal`, `uniquelocal` — **or a netmask** where a
  prefix length goes. A name is a range nobody reading the setting can see, and
  `uniquelocal` is every private address — on Docker's default address pools, every Docker
  network's gateway with it.

[0156](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0156-a-proxy-is-trusted-by-its-address.md)
has the reasoning.

### What this does not change

- The limits are still counted **per process**, so behind more than one replica each counts
  only its share of the traffic.
- People who really do share one address — an office, a school, a phone network behind
  carrier-grade NAT — share one budget, which no setting here can separate.
- **A trusted proxy is believed about more than the client.** Fastify also takes
  `X-Forwarded-Host` and `X-Forwarded-Proto` from a hop it trusts, as `request.host` and
  `request.protocol`, and a proxy that does not set them passes on what the client wrote —
  nginx configured as above does, measured. No route reads either today (checked
  2026-10-09): only the rate limits read the client's address. But the first route that
  builds a link or decides whether a request came over HTTPS from them would take a
  client's word for it, unless the proxy sets both headers itself.

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

Add `-H "x-formancy-schema-hash: <hash>"` to say which version this edit started
from, and the publish is refused with `409 FORM_VERSION_CHANGED` if somebody
else published in the meantime — the builder sends it so two people editing one
form cannot silently overwrite each other. The header is optional: a script
publishing a document it composed has no version to declare, and omitting it is
last-write-wins. [Versioning](/docs/concepts/versioning/) has the rest, including
the `409 already_published` you get for republishing an older version verbatim.

### A 201 may carry warnings

```bash
# → 201 {"version":2,"schemaHash":"7ac1…","warnings":[
#        "Rule on \"note\" (visible) reads \"address.nope\", which no field provides. …"]}
```

The publish **succeeded** — the version is there and the form is live. The
warnings are things worth checking that are not grounds to refuse, and there are
two kinds: a rule whose condition reads a data path the model does not define,
and an example the form keeps that held against the version it had and does not
hold against this one ([below](#a-forms-examples)).

That rule evaluates to nothing, so it never does anything, and nothing else will
ever tell you. An unknown *top-level* field is refused outright (`422`) because
the engine compiles each rule against the fields that exist; what gets through is
a member of a group or of a repeater row — `address.nope`, `item.nope` — which
type-check, because a member of a map is dynamic. Those are also the ones a
rename inside a group leaves behind.

It is a warning rather than a refusal because tightening what a reader accepts
would make documents that are valid today invalid tomorrow, and published spec
versions are frozen ([0097](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0097-a-publish-may-warn.md)).

**If you want a gate, this is the hook.** Fail your deploy when `warnings` is
non-empty:

```bash
curl -sS -X POST localhost:4380/forms -H "authorization: Bearer $TOKEN"   -H 'content-type: application/json' -d @form.json   | jq -e '(.warnings // []) | length == 0'
```

The key is omitted entirely when there is nothing to say, which is why the `//
[]` is there. Nothing in formancy fails anything over a warning.

### A form's examples

A form can keep examples with their answers written down — answers to set, and
what the form should make of them — and the fictional sample they all start
from. They are the one check that can tell a condition written backwards from
the one that was meant, because both spellings are valid
([0110](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0110-a-form-is-checked-against-examples.md)).
The server keeps them beside the form, never inside a version, since a version
is immutable and examples change while the form does not:

```bash
curl -sS -X PUT localhost:4380/f/contact-us/examples \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"scenarios":[{"name":"Switzerland asks for a canton","changes":{"country":"CH"},"valid":true,"visible":{"canton":true}}],"sample":{"email":"jane@example.ch"}}'
# → 200 {"scenarios":[…],"sample":{…}}

curl -sS localhost:4380/f/contact-us/examples -H "authorization: Bearer $TOKEN"
# → 200 {"scenarios":[…],"sample":{…}}   ({"scenarios":[]} for a form with none)
```

A `PUT` replaces the list and the sample whole. Both routes take `form.publish`
— editors and admins, not viewers — and need a form the server has published:
`404 unknown_form` otherwise. A list with anything that is not an example is
refused with `422 invalid_examples` and a sentence per item saying which and
why, and nothing of it is kept; so are two examples with one name and a sample
that is not answers by field. Paths are not checked against the published form,
because an example may be written for a field the next version adds. Every
change is in the audit log as `form.examples.changed`, with how many examples
and whether there is a sample — never what they say.

What is kept is read back the way a `PUT` is read. A row changed in the
database by hand into something that is not an example is left out of
`scenarios`, and the `GET` names it in `unreadable`, one sentence each; the
next `PUT` keeps only what it is sent, so it drops it.

**Publishing runs them.** Each publish runs the form's examples against the
version it has and the one being published, as the server replays a submission
and from the kept sample, and names on the `201` each that stops holding:

```bash
# → 201 {"version":4,"schemaHash":"…","warnings":[
#        "The example \"Switzerland asks for a canton\" held against version 3 and does not hold against version 4: \"canton\": expected to be visible, and it is hidden."]}
```

It never refuses: a rule changed on purpose stops its old example holding, and
the decision is yours. An example that did not hold against the old version
either is not named, and neither is one that holds again. A first publish has
none to run, and republishing the current document says nothing about them.
What is kept and is not an example is not run, and one warning names it
([0166](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)).
The `jq` gate above fails on these too.

:::caution[Needs a server newer than v0.4.0]
`v0.4.0` and every image before it has no `/f/:path/examples` route, and its
publish runs no examples.
:::

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
[Versioning](/docs/concepts/versioning/) for the severity rules.

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
| `POST` | `/forms` | management | `form.publish` (optional `x-formancy-schema-hash`) |
| `GET` | `/forms` | management | `form.read` |
| `GET` | `/f/:path/versions` | management | `form.read` |
| `GET` | `/f/:path/submissions` | management | `submission.read` |
| `GET` | `/f/:path/submissions/export.csv` | management | `submission.export` |
| `GET` | `/f/:path` | public | — |
| `POST` | `/f/:path/submissions` | public | — |
| `PUT` `GET` | `/f/:path/drafts/:draftId` | public | — |
| `POST` | `/f/:path/files` | public | — (same gate as submitting) |
| `PUT` | `/f/:path/files/:fileId` | public | — (the address the offer returned) |
| `GET` | `/f/:path/files/:fileId` | management | `submission.read` |
| `PUT` `GET` | `/f/:path/examples` | management | `form.publish` |
| `PUT` | `/f/:path/access` | management | `form.publish` |
| `GET` | `/model` | management | `form.publish` |
| `POST` | `/model/complete` | management | `form.publish` (ten a minute per session) |

## Files

Uploads are off until `FORMANCY_FILES_DIR` names somewhere to put bytes. A form
with a file field still renders and still submits without it; the field says
plainly that there is nowhere to put one.

In a container that directory has to be a mounted volume, or the files
disappear on the next deploy — `compose.yaml` wires one up. [Files](/docs/concepts/files/)
covers the lifecycle, what is refused and where, and why a file is *claimed*
inside the submission's transaction rather than simply uploaded.

### Switching to an object store through compose

Both compose files pass the five `FORMANCY_S3_*` settings through, and both point
`FORMANCY_FILES_DIR` at their volume. Compose can blank a variable but not remove one, so
switching is the object-store block of `.env.example` uncommented — which blanks the
directory as well as naming the store:

```bash
FORMANCY_FILES_DIR=""
FORMANCY_S3_ENDPOINT=http://garage:3900
FORMANCY_S3_BUCKET=formancy
FORMANCY_S3_REGION=garage
FORMANCY_S3_ACCESS_KEY_ID=GK…
FORMANCY_S3_SECRET_ACCESS_KEY=…
```

The server reads the empty directory as unset and is left one store. Leave the first line
out and it is told about two, refuses to start, and compose restarts it into the same
refusal for as long as you let it.

:::caution[Needs a server newer than v0.4.0]
`v0.4.0` and every image before it read `FORMANCY_FILES_DIR=""` as a directory: with the
endpoint set they refuse two stores, and without it they switch uploads on in the
container's working directory, which the image's user cannot write. Until a release
carries the fix, an object store through compose means
[a checkout](#from-a-checkout).
:::

Neither compose file runs the store itself: a fresh Garage node accepts no data until a
layout is assigned, which is a few commands after it starts rather than anything compose
can declare. Moving existing files from the volume to the bucket is also yours to do — the
server looks for every file in the one store it has.

## The request log

The server writes a JSON line to standard output for every request, once it has been
answered, and one for every error that answered a request. `docker compose logs server`
reads them.

```json
{"time":"2026-10-10T14:48:53.098Z","level":"info","event":"request","reqId":"req-1","method":"POST","route":"/auth/login","status":401,"ms":45}
{"time":"2026-10-10T14:48:53.109Z","level":"info","event":"request","reqId":"req-2","method":"GET","route":"/f/:path","status":404,"ms":4}
{"time":"2026-10-10T14:48:53.119Z","level":"info","event":"request.refused","reqId":"req-3","method":"POST","route":"/auth/login","status":400,"kind":"FastifyError","code":"FST_ERR_CTP_INVALID_JSON_BODY"}
{"time":"2026-10-10T14:48:53.121Z","level":"info","event":"request","reqId":"req-3","method":"POST","route":"/auth/login","status":400,"ms":3}
```

- **`route`** is the route as the server registers it — `/f/:path/drafts/:draftId` — never
  the path that was asked for, so no form's path, draft's id or query string is in it. A path
  no route has gets a line without one.
- **`reqId`** is the id the request's [audit row](#the-audit-log) carries, so the two can be
  read together. It is a counter that starts again when the process does.
- **An error** is `request.refused` at `info` when the client caused it (a 4xx) and
  `request.failed` at `error` when the server did (a 5xx), naming what was thrown by its
  class (`kind`) and its `code` — for a database error, PostgreSQL's SQLSTATE.
- **Other events** say something went wrong beside an answer: `audit.unwritten` (with the
  audit row's `action`), `upload.refused`, `scanner.unreachable`, `upload.unreleased`,
  `model.unreachable` (with the provider's status as `upstream`), `outbox.failed`,
  `collector.failed`, `sweeper.failed`, and `database.notice` (by `code`, at `debug`). A
  warning from Fastify itself is `unlisted`.

**What is never written:** a request's body, its query string, its headers —
`Authorization`, cookies, `x-formancy-api-key`, the challenge, a draft's key — a file's name,
an answer, a password, an email, and the words of any error: its message and its stack. A line
is assembled from the fields above and nothing else, each kept only when its value is the kind
that field holds, so none of those has anywhere to go
([0168](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0168-the-log-is-built-from-a-list-of-fields.md)).

That costs you something when a request fails. A `500` names the class of what was thrown and
the route, not the line of code or the sentence it said; a scanner or a model provider that
could not be reached is said to have failed, not why. And the log cannot say which form a line
was for — the audit log names a subject. Note that a `500` still sends the client the error's
message, which is Fastify's default reply and not the log.

`FORMANCY_LOG_LEVEL` sets how much is written; `off` writes none of it. A few plain sentences
at startup — that the server is listening, which model it asks, that it generated an ephemeral
`FORMANCY_AUTH_SECRET` — are not part of the log and are written whatever the level, and so is
an error that stops the server.

## The audit log

Every publish, permission change, change to a form's examples, login (including
the failures), submission, **submission read and export** is recorded. `GET /audit` reads it back, newest
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

## A model for the builders

The builders can describe a form in words, ask for a language's missing messages and draft
examples, all through a model. A deployment can have its server hold that model, so the key
stays on the server and never reaches a browser
([0165](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0165-a-deployments-model-is-asked-through-its-server.md)).
It is off until you set all three:

```bash
FORMANCY_MODEL_PROVIDER=anthropic     # or openai, or xai
FORMANCY_MODEL_API_KEY=…              # that provider's key
FORMANCY_MODEL=claude-opus-5          # the model, as the provider names it
```

Claude is Anthropic's, through its own SDK; OpenAI's models and xAI's Grok go through
OpenAI's SDK, at each one's own address — xAI documents its API as compatible with OpenAI's
client. `claude-opus-5` is Anthropic's Opus as its model list named it on 2026-06-24; check
the provider's list before copying an id. With Anthropic the server asks for adaptive
thinking, so the model must have it: Claude Opus 4.6, Sonnet 4.6 or later.

**There is no default model**, on purpose. A default goes stale when the provider retires
it — every request then fails, after an upgrade you did not make — and which model runs is
what you pay for. A wrong or retired id is found at the first request, not at startup.

**What leaves, and where to.** With a model set, the server makes HTTPS requests to that
provider's API — `api.anthropic.com`, `api.openai.com` or `api.x.ai` — and nowhere else for
it. Each request carries the form it is about: the whole document, its rules included, when a
form is written or changed, and part of it and none of its rules when a language is
translated or examples are drafted — the
[agents guide](/docs/start/agents/#through-formancys-server-the-deployment-path) says which
part. Never a submission, unless somebody types one into an instruction. OpenAI and xAI are
asked not to store the request; what any provider keeps under its own terms is the
provider's. The admin says which provider and model a request goes to before anybody asks.

**What it answers.** `POST /model/complete` takes `{ "kind": …, "user": … }`, where `kind` is
`authoring`, `translation` or `scenarios` — the three requests the builders make — and
answers `{ "text": … }`, or `{ "declined": … }` when the provider refused. The server writes
the system part for each kind itself and never reads one from the request, which narrows the
endpoint to formancy's three kinds of request without closing it (below). It takes
`form.publish` — editors and admins, not viewers — ten requests a minute per session, and a
body cap of its own, which holds what the builders send about the largest form the server
publishes when its questions are about a sentence long; the translation of a form whose
questions are long and have many answers can be larger, and is refused with a `413`. Each
answer may be up to 64,000 tokens. When the browser goes away, even before its session was
checked, the server abandons the call to the provider. A failure is a `502` with a sentence
for the person: the key refused, the server being limited, the model refused, or unreachable.
`GET /model` says which provider and model, or `404` when there is none.

**What it costs, and who can spend it.** Every editor and admin, and every API key with one
of those roles, can spend the key, within the limits above, and the limit is counted per
replica. Under formancy's briefing somebody can still ask the model for something else; the
endpoint is narrowed, not closed. Every request is in the audit log as `model.asked` — who,
which kind, the provider and model, how long the request was, how it ended and the
provider's status when it failed — never the text. There is no spending cap here; set one with
the provider.

**The providers' SDKs read the environment too.** Each adapter names the address, the
credential, the organisation and project, and the log level itself, so `ANTHROPIC_BASE_URL`,
`OPENAI_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`,
`ANTHROPIC_LOG` and `OPENAI_LOG` change nothing. `ANTHROPIC_CUSTOM_HEADERS` and
`OPENAI_CUSTOM_HEADERS` would add headers to every request, and nothing undoes them, so the
server does not start with the one its provider's SDK reads set; xAI goes through OpenAI's.

Both compose files pass the three variables through when they are set.

:::caution[Needs a server newer than v0.4.0]
`v0.4.0` and every image before it has no model and ignores all three variables.
:::

## The admin app

`pnpm --filter @formancy/admin dev` serves a schema editor with live preview,
publish, version history and a submissions table on `:4382`, proxying `/api` to
the server. When the server has [a model](#a-model-for-the-builders), the build tab draws the
prompt pane and the Translations tab can ask for a language's missing messages, both through
the server. Once a form is published, the build tab lists [its examples](#a-forms-examples),
runs them after every edit as the publish will, saves a removal back to the server — after a
save that fails it says so and shows the server's list again — and —
with a model — drafts more from what you say the form should do; the prompt pane's review
names any example a model's edit would stop. The backend sets no CORS headers on purpose — cross-origin policy is
its own piece of work, and a permissive development default would outlive
development.
