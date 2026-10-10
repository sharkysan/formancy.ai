# 0170 — A limit is counted once, in the database every replica shares

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/shared-rate-limits.integration.test.ts`, on real
  PostgreSQL, with two `createApp` instances each on connections of its own: a submission
  budget of three is spent across both and the fourth is refused on either; two clients and two
  routes are still counted apart, and the table's keys name the route; the login limit and the
  model's per-session limit are shared, and a second session keeps its own; a one-second window
  answers `Retry-After: 1` on the other replica and ends for both; with the table locked, a
  submission is admitted and a login refused within the bound, the process says so once and
  says so again when counting resumes; an expired counter is deleted on the back of a later
  count; the table is unlogged, and is added on start to a database without it. With
  `createApp` ignoring the store, eight of those cases fail; the route left out of the key, a
  logged table, no sweep, a window counted in seconds, a line per failed count and no bound on
  the wait each fail a named case. `packages/server/src/rate-limit-store.test.ts` reads the
  limits from the routes as Fastify registers them — through its `fastify.initialization`
  diagnostics channel, so no list in the test can go stale — and holds that each names
  `timeWindow` and declares what it does uncounted, that each counts in the store `createApp`
  was given, and that each does what it declares over a database nobody is listening for; and,
  by name, that a respondent is admitted, a login refused with nothing about the database in the
  answer, the model refused and not asked, the operator told once, and a sweep that fails said
  rather than left to end the process. Dropping the store from `createApp` fails it for every
  limited route; a login or the model admitting, a limit written by hand without saying, a window
  named `timeWindowMs`, and the store's own error handed to the plugin each fail a named case, and
  a sweep's rejection left unhandled fails the run. **That `main.ts` passes the store is a measurement, not a
  gate** — no test imports a composition root — taken on 2026-10-10 and set out below.

## Context

Every rate limit counted in `@fastify/rate-limit`'s default store, which keeps its counts in a
map in the process. Behind N replicas each process counts only the requests it answers, so every
limit allowed N times what it said: thirty submissions a minute per address behind two replicas
was sixty, ten guesses at a password twenty, and the model's ten requests a minute per session —
which the operator pays for, hazard C9 — ten per replica. The deployment view draws N replicas
behind a reverse proxy, and arc42 §11 carried it as *documented rather than fixed*.

The limits, as `createApp` and the route plugins register them: a submission, a draft's start,
write and read, a challenge and a file offer on the public plane, keyed by the client's address
([0156](0156-a-proxy-is-trusted-by-its-address.md)); the login, keyed by address; and the model's
`POST /model/complete`, keyed by session once `requires` has found it
([0165](0165-a-deployments-model-is-asked-through-its-server.md)). Each route has its own budget,
and a `GET` route's automatic `HEAD` another.

What the plugin, 11.2.0, takes, read from its installed type definitions and its source: a
`store` option, a class the plugin constructs once and asks for a `child` per limited route,
whose `incr(key, callback, timeWindow, max)` answers the count and the milliseconds left. Its
`child` receives the route as `routeInfo`, which its own Redis store reads and its types do not
declare. Both of its stores keep a fixed window that starts at a key's first request. A store
that fails is an error the plugin throws, a 500 carrying the store's message, unless the route
says `skipOnError`, when the request goes through as though nothing had been counted.

The deployment already runs PostgreSQL, and only PostgreSQL: one database for everything, no
Redis ([0024](0024-postgres-over-mongodb.md)).

## Decision

**Every limit counts in PostgreSQL.** `createPostgresRateLimitStore(sql)` is the plugin's store
over a table, `rate_limit_counters`: one row per route and client, keyed
`POST /f/:path/submissions 203.0.113.1`, counted by one upsert that takes the row's lock, so two
replicas counting one client at once are counted one after the other and neither increment is
lost. `createApp` takes it as `rateLimitStore`; `main.ts` always passes it, because the server it
runs always has a database. No setting turns it off. The plugin's in-memory store is the second
implementation of the same port: what `createApp` counts in when it is given none — one process,
an embedding, the tests.

**The window is the plugin's, on the database's clock.** It starts at a key's first request and
lasts the route's `timeWindow`, as both of the plugin's stores keep it; its end is
`now() + timeWindow` in the database, one clock for every replica, kept to the microsecond and
answered to the plugin in milliseconds, rounded up, which the plugin turns into whole seconds of
`Retry-After`.

**A count that does not come back within a second is a count that failed**, and what happens then
is each limit's own declaration, made by `limited(budget, 'admit' | 'refuse')` in
`rate-limits.ts`, which every route's limit is written with and which cannot be called without it:

- **Admitted, uncounted:** a submission, a draft's start, write and read, a challenge, a file
  offer. Every one of them needs the database for its own work, so when the database is down it
  fails on its own and refusing first adds nothing; and when only the counter fails — a lock held
  on its table, a grant missing on it — refusing would make a fault in the defence an outage of
  every form, with the respondent refused for something nobody did.
- **Refused with a 503:** a login and a model request. Guessing a password is what the login limit
  is for, the one an attacker gains most from switching off, and login needs the database anyway,
  so refusing costs nothing a working database would have given. The model's route needs no
  database at all — a session is a signed token and its audit row never throws — so admitting it
  would make a database outage an unlimited spend on the operator's key.

The 503 says the request could not be counted, as `RATE_LIMIT_UNAVAILABLE`, and nothing about the
database: the store's own error names the address it could not reach. A count abandoned at the
bound is not cancelled — cancelling costs a connection to a database that is not answering — so
it runs when it can and may count its request late. The process says when the counter stops
answering and when it starts again, on standard error, once each, not once a request.

**Expired counters are deleted on the back of a count**, at most once in ten minutes, without
waiting for it: no timer of its own, nothing for `main.ts` to start or stop, and two replicas
sweeping is deleting a row twice, which is deleting it once. **The table is `UNLOGGED`**, with no
index but its key.

## Measured once

On 2026-10-10, in this repository's sandbox: PostgreSQL 17.11 (`postgres:17-alpine`) in Docker
29.8.1 on the same machine, `fsync` and `synchronous_commit` on; Node 22.22.1; twenty cores
shared with other work, load average between three and seven. Two runs, the second in
alternating order; each figure is the range over them.

| What | Median | 99th percentile |
|---|---|---|
| The count alone, one connection, 5,000 in a row, unlogged | 0.49–0.76 ms | 1.5–12 ms |
| The same, logged | 0.79–1.10 ms | 2.2–27 ms |
| 32 at once over four keys, unlogged | 2.3–3.0 ms, 8,800–12,500 a second | 6.3–14 ms |
| The same, logged | 3.4–4.5 ms, 4,800–6,000 a second | 25–32 ms |
| A refused submission through `createApp`, counted in the process | 1.21–1.60 ms | 3.2–4.4 ms |
| The same, counted in the database | 1.84–2.06 ms | 4.3–4.8 ms |

**A limited request costs about half a millisecond more at the median** — between a quarter and
nine-tenths over the three pairs of runs — against a database on the same machine; a database
across a network adds its round trip to every limited request. The slowest single count in some
120,000 took 390 ms, on a host shared with other work: the bound is two and a half times that and
some thirty times the worst 99th percentile.

Then the composition root, which no test imports: the server built from this change, two
`node dist/main.mjs` processes on one database, nothing else set. Thirty-one submissions
alternating between them: thirty admitted, the thirty-first refused, one row counting 31. With
the database container paused, a login answered `503` with `RATE_LIMIT_UNAVAILABLE` in 1.003
seconds, and a submission was admitted past its limit and then waited on its own query, as it
did before this change; each process wrote one line saying the counter had stopped answering, and
the one asked again after the database came back wrote one saying it was answering again.

## Consequences

**Every limited request is a write to the database.** About half a millisecond at the median,
measured on one machine; a round trip more where the database is elsewhere.

**While the counter cannot answer, the public plane has no limit**, and the database being slow
is exactly what a flood would choose. The challenge, the origin allowlist, the body cap and a
draft's key do not depend on it; a flood that slows the database past the bound gets through
uncounted and makes it slower. Each request waits up to the bound first — a second, where the
driver would wait thirty to connect. The operator is told, on standard error, which nothing reads
unless the deployment does.

**While the counter cannot answer, nobody can log in and the builders cannot ask the model.**
Sessions already issued keep working. A deployment whose database is down was not logging anybody
in anyway; one whose counter alone fails — a role granted table by table without the new one —
finds out at its first login.

**A crash empties the table**, and a standby promoted to primary starts with it empty, because an
unlogged table is neither in the write-ahead log nor on a standby. Each client gets a fresh window,
once. What was bought: a count that does not wait for the log to reach the disk — measured above
at one and a half to two and a half times the counts a second under load, and a fifth to just
over a half of the 99th percentile — and no write-ahead traffic to standbys and backups for every limited
request.

**A count abandoned at the bound lands late**, if it lands: the request it belonged to was
admitted or refused without it, and it counts in whichever window it lands in. One request
counted late, and in the strict direction.

**The window is fixed, as the plugin's own was.** A client can spend a budget at the end of one
window and another at the start of the next — twice the limit across a boundary — exactly as it
could before; nothing here made it worse or better.

**The table holds about ten minutes of clients** between sweeps, one row per route and client:
an attacker with many addresses grows it by one row per address per route until the next sweep.

**The plugin's types do not describe what a store's `child` receives.** The store reads `routeInfo`
as the plugin's source passes it; an upgrade that moved it would put every route's counts under one
key, and *still count each route apart* is the case that fails.

**An embedding that calls `createApp` without the store counts per process**, as every deployment
did before. `AppOptions` says so, and `MIGRATIONS.md` says what to pass.

**Nothing else about who is counted changed.** People who share one address still share one budget,
and the proxy is still the operator's to name. Nor does this make more than one replica safe on its
own: the outbox still delivers a webhook once per replica
([0049](0049-one-polling-worker.md)).

## Alternatives considered

**Redis, which the plugin supports out of the box.** The least code here, and a second service for
every self-hoster to run, secure and back up, for a table's worth of counters. One database is a
property this deployment keeps on purpose (0024).

**Count in each process and reconcile now and then.** Cheaper per request, and N times the limit
again inside each interval — the burst a limit exists for is shorter than any interval worth
syncing on.

**Divide each limit by the number of replicas.** The server does not know the number, and a proxy
that does not spread one client's requests evenly makes the division wrong for exactly that client.

**Sticky sessions at the proxy.** The deployment's to configure and the server's to trust blindly,
lost on every failover, and no help to the model's limit, which is per session rather than per
address.

**A sliding window or a token bucket.** Closer to the limit at a window's edge, and more state and
more SQL per request, for a property the plugin's own stores never had.

**Fail one way for every limit.** Closed, a fault in the counter is an outage of every form. Open, a
slow database is a free hand at a password and at the operator's key.

**Cancel a count abandoned at the bound.** It frees a connection a slow statement holds, and costs
another to a database that is not answering in order to say so.

**A timer of its own for the sweep**, like the challenge sweeper's. A second thing for `main.ts` to
start and stop, for a table only this store writes; on the back of a count, the sweep happens
whenever there is anything to sweep.

**A connection pool of the counter's own**, so a flood holding every storage connection could not
starve it. More connections per replica against the database's limit, and a request it admitted
would wait for the storage's pool next anyway.

**A logged table.** Survives a crash, which a counter has no use for, at between two-fifths and
two-thirds of the counts a second under load, and a write-ahead entry for every limited request.

**A setting to keep counting in the process**, for a single replica that would rather not pay half
a millisecond. It is the one value that brings the defect back silently the day a second replica
starts, and the cost it saves was measured as smaller than the request it counts.
