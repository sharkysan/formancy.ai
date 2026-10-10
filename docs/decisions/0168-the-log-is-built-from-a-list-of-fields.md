# 0168 — The server keeps a log, and a line is built from a list of fields

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/server.integration.test.ts`, *what reaches the log*, on
  real PostgreSQL — every route family is driven, a login that fails and one that works, a user,
  an API key used to publish, a draft written and read, an upload, a challenge, a submission,
  its listing, its export and its file, a form's examples, a model that answers 401, a body that
  does not parse, a path no route has, a URL the router cannot decode, a parameter too long for
  it and a database error whose message quotes a planted id; the values that must not be logged
  are derived from what each request carried and what the server handed back, and none of them
  is in the log, which has one request line for every request, and every audit row of the swept
  form names a request with a line — a publish's, an examples change's and a submission's on the
  routes that wrote them. Watched failing three ways: a body on the request line, an error's
  message written, and the raw path written for the route; and later with the two refusals
  before routing left to Fastify, which had no line, and with the routes not passing
  `request.id` to the use-cases, whose three rows joined to nothing. The same file holds an app
  given no log to none, and the scanned-upload cases to `upload.refused`, `scanner.unreachable`
  without the scanner's address, and `upload.unreleased`.
  `packages/server/src/server-log.test.ts` — the request line, the route as written and never
  the path, the second line for a thrown error with its kind and code and never its words, a
  refusal at `info`, the request id every audit row carries — a login's, a publish's, an access
  change's, an examples change's and a submission's, each on the route that wrote it — an audit
  row that cannot be written, the level, a route's own 5xx at `error`, a refusal before routing,
  a `503` while closing, a client that left, only listed fields each by its kind, `unlisted`,
  identifier shapes, the database's notices, a child's bindings; `server-core`'s `audit.test.ts`
  the three use-cases naming the request they are given, and none when given none. The three
  workers' tests plant a parameter in a failed pass and find a line without it;
  `log-settings.test.ts` holds the setting's refusals; `model-route.test.ts` the provider's
  words kept out; `compose.test.ts` the variable passed through both compose files, which failed
  until it was. `apps/docs/src/console.test.ts` still holds every library to no console at all
  (0115).

## Context

`@formancy/server` constructed Fastify with `logger: false`. No submission could reach a request
log, because there was none — and nothing told an operator why a request had failed. A
self-hoster debugging a webhook that never arrived, a `500`, or a respondent refused for
somebody else's traffic behind an unnamed proxy (hazard D14) had the audit log, which records
what was done to data, and nothing else. Hazard C3 called that residual larger than the
constraint it bought.

What the process did write was worse than nothing. The outbox worker, the file collector and
the challenge sweeper each printed a failed pass's error to standard error whole, and a Drizzle
query error's message is the failing query followed by its parameters. postgres.js printed every
notice the database sent, as a whole object, to standard output. And a deployment that added a
logger itself — Fastify's own pino, `logger: true` — would have had a 5xx's error written with
its message and stack, the raw URL of every request with its query string, and redaction as its
own problem: nothing in this repository redacted anything.

The Fastify this server depends on, 5.12.5, deprecates `disableRequestLogging` in favour of a
`LogController` a server may subclass to change the lines Fastify itself writes about a
request.

## Decision

**The server keeps a log, on by default, and a line is built from a list of fields rather than
copied from whatever a call hands over.** `server/server-log.ts` is a logger of its own behind
Fastify's logger interface, and a `LogController` that writes Fastify's lines about a request
through the same rule.

- **One line per request**, when it has been answered: the time, the level — `error` for a 5xx,
  `info` otherwise — `event: "request"`, Fastify's request id, the method, the route **as the
  route table writes it** (`/f/:path/drafts/:draftId`, never the path that was asked for), the
  status and the milliseconds it took. A path no route has gets a line with no route. Every audit
  row the request writes carries the same id: the three use-cases that write their row inside
  their own transaction — a publish, a change of examples, a submission — are handed
  `request.id` by the route, as the audit writer reads it for the rest.
- **Including the requests Fastify's own line misses**, which it writes once an answer has been
  sent: a URL it cannot decode or a parameter too long for the router, which it refuses before
  routing — answered through `frameworkErrors`, so it gets a refusal's line and its own; a request
  arriving while the server closes, refused with a `503` before routing, whose line has its id and
  its status and nothing else, since nothing else reaches the line; and a request whose client
  left before its answer was sent — its response closing before it finished — written as
  `request.abandoned`, with its route and how long it waited and no status, since none arrived.
- **One line per error that answered a request**: `request.refused` at `info` for a 4xx and
  `request.failed` at `error` for a 5xx, with what was thrown named by its **kind** — its class —
  and its **code**, the first one along its causes, so a Drizzle error keeps PostgreSQL's
  SQLSTATE.
- **Everything else a route or a worker says is an event from a closed list**: an audit row that
  could not be written (with the row's action, never its subject), an upload refused by the
  scanner, a scanner that could not be asked, a file whose lease could not be given back, a model
  that could not be asked (with the status its provider answered), a worker's failed pass, a
  database notice (by its SQLSTATE). A line at `warn` or above that names no listed event —
  Fastify's own warnings — is written as `unlisted`, without its words; below `warn` it is not
  written.

**How a field that is not on the list is kept out:** `written` builds each line from `LOG_FIELDS`
and nothing else. A key a call hands over that is not listed is never read; a listed field is
kept only when its value is of that field's kind — an audit action from `AUDIT_ACTIONS`, a status
an integer from 100 to 599, a route a path with no query, a kind or a code an identifier — and
the words of a call are never written: not pino's message argument, not an error's message or
its stack, not Fastify's `Route GET:/the/raw/url not found`. So bodies, query strings, headers
(`Authorization`, cookies, `x-formancy-api-key`, the challenge, a draft's key), file names,
answers, passwords, draft keys and emails have no field to go in.

**The workers' failures go through the same rule**, handed the app's log by `main.ts`; a worker
started without one writes its failure to standard error by the rule, where it complained
before. The database's notices are handed to it as well.

**`FORMANCY_LOG_LEVEL`** takes pino's level names — `fatal`, `error`, `warn`, `info`, `debug`,
`trace` — or `off`. Unset or empty is `info`. Anything else, `INFO` and `silent` included, stops
the server at startup, as every other setting does.

**Only the server's process turns it on.** `createApp` given no `log` keeps none, so a host that
embeds it decides what its own output is for, and the libraries still write nothing (0115).

## Consequences

**An error says what was thrown, not where or why — and that is the cost.** No message and no
stack reach the log, because both can carry what the request carried. A fault in a route is a
line saying `TypeError` on `POST /f/:path/submissions` with a `500`; finding the line of code
means reproducing it. A database error keeps its SQLSTATE, which says most of what an operator
needs. A model provider's own words and a scanner's go nowhere: the log says the provider
answered `401`, or that clamd could not be asked — not that it refused a connection at a
particular address, which the scanner's error said and the log now does not.

**The log cannot say which form.** The route is the pattern, so every form's submissions are one
route, and a `404` for a form nobody published looks like any other. A path parameter can be a
draft's id or a file's, and a file's id is what lets its bytes be sent while it is offered, so
none is written. The audit log, which records a subject, is where a form is named.

**A field is added by editing the list**, with the kind of value it may hold. That is the point,
and it is also friction: the next useful thing to log is a change to a list and a test, never a
call.

**`kind` and `code` are what the thrown error calls itself.** They are kept only in the shape of
an identifier, which no email, sentence or URL has; a dependency that put an answer in its
error's code, in capitals and digits, would have it written. The sweep catches that on the routes
it drives, and no further.

**One line per request at `info` is a lot of lines.** A public form writes one for every draft
save, every challenge and every submission. `warn` keeps the requests answered with a 5xx, the
errors that answered them and the events at `warn` and above — not a 4xx, which is the client's,
and not a client that left, whose line is at `info`.

**What this does not touch.** A `500` still answers its client with the error's message —
Fastify's default error reply — so a database error's query and parameters reach whoever made
the request; `server.integration.test.ts` asserts a disk's `ENOSPC` reaching the client. The
process still writes outside the rule: a few fixed sentences at startup, and an error that stops
it, which Node prints as it prints any. Fastify's request id is a counter that restarts with the
process, so it joins a line to an audit row within one process and not across replicas.

## Alternatives considered

**pino with `redact`.** Fastify's own logger, with paths to censor. A list of what to remove:
anything nobody listed is written, an error's message and stack go through pino's `err`
serializer whole, and a path cannot reach a value inside a string — the parameters inside a
query error's message.

**pino with an allow-list in its formatters.** It works: `formatters.log` to pick fields,
`formatters.bindings` for the request id, a `logMethod` hook to drop the message, serializers for
errors. That is one rule in four hooks whose order is pino's internals, beside a `LogController`
that is needed anyway for Fastify's own lines — the rule split across two configurations. The
logger here is one function, a list and Fastify's interface, with no new dependency: pino is
still Fastify's.

**A regular expression over each line** for emails, tokens and keys. It knows the shapes it was
written for. An answer has no shape.

**Off by default, documented.** What C3 described: no diagnostics, and a deployment that turns a
logger on takes on redaction alone.

**The raw path, with the query string removed.** It names the form. It also names a draft's id
and a file's — the second is what lets its bytes be sent while it is offered — and any parameter a
later route adds, without anybody deciding to log it.

**Messages at `debug`.** A level that writes what a request carried is the one somebody turns on
to debug an incident in production, and the log then holds the content. No level writes words.

**Fastify's `onRequestAbort` hook for a client that left.** Fastify runs it only when Node marks
the request aborted, which Node does not for a request whose body has been read: measured on
Fastify 5.12.5 and Node 22, a `GET` whose client left ran the hook and a `POST` did not — and a
model's turn, the slow request a person most often gives up on, is a `POST`. A response closing
before it has finished catches both, and is what the model route already cancels a provider's
call on.

**Hooks — `onResponse` and `onError` — with `disableRequestLogging`.** The option is deprecated in
the Fastify this server depends on, and `onError` runs before the error handler has set the
status, so the error line would have to work out for itself the status Fastify was about to
choose — a second copy of a decision Fastify makes.
