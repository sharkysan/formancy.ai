# 0172 — A 5xx says its status and nothing of what was thrown

- **Status:** accepted; a value a `text` column cannot hold, which it left a `500`, decided by
  [0173](0173-a-nul-character-names-nothing-and-a-body-with-one-is-refused.md); an error thrown
  while a reply's headers were written, which reached its client past the hook, and a fault
  answered under a 4xx, which kept its words, decided by
  [0175](0175-a-name-goes-into-a-header-encoded.md)
- **Date:** 2026-10-11
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/error-replies.test.ts` — a database error whose message is
  a query and a planted parameter is answered
  `{ "statusCode": 500, "error": "Internal Server Error", "message": "Internal Server Error" }`,
  with nothing of the query, the parameter or its SQLSTATE in the body, and the log still has its
  `request.failed` line on its route with `DrizzleQueryError` and `22P02`; an app given no log
  answers the same; a fault's code, `ENOSPC`, is in the log and not the reply; an error that names
  its own `503` keeps its status and its code and loses its sentence; a code in no code's shape is
  dropped; a promise rejected with a bare sentence, and an error naming a status with no name,
  are answered with no words of theirs; a route's own `501` keeps its words; and a `400` from
  Fastify for a body that does not parse, and a `409` thrown with its message, are answered as
  Fastify always answered them. All seven 5xx cases fail without the hooks, each with the thrown
  words in the body — the bare sentence as the whole of it. The route's own
  case fails with every 5xx replaced, both 4xx cases with every error from 400 replaced, the
  fault's case with every code kept, and the shape case with any string kept as one. An error
  handler of our own in place of the two hooks — the first alternative below, sketched without
  the line — failed seven cases across this file, `server-log.test.ts` and
  `rate-limit-store.test.ts`: five on a `request.failed` line no longer written, two on a code
  the sketch did not keep. `server.integration.test.ts`, on real PostgreSQL: a
  write that fails with `ENOSPC` after a release that fails too is answered without the disk's
  code or its sentence, and the log names `ENOSPC` — the assertion this case made the other way
  round until now, and which failed against the old reply with the disk's code and path in it;
  and `rate-limit-store.test.ts` still finds `RATE_LIMIT_UNAVAILABLE` in a refused sign-in's reply.
  **The two changes decided with it:** `postgres-storage.test.ts` answers a file and a delivery
  for an id that is not a uuid without asking a database nobody is listening for, and asks it for
  one that is — failed before, the storage asking; `server.integration.test.ts` answers `GET` and
  `PUT /f/claim/files/not-a-file-id` with `404 unknown_file`, a response naming such a file with
  `422` and `unknown_file:not-a-file-id`, and a replay of `/deliveries/not-a-delivery-id` with
  `404` — each a `500` before. `rate-limit-store.test.ts` finds a limit on every route a request
  without a session reaches but a form's read, which failed with the bytes route unlimited and
  fails again with its limit taken off, and finds the bytes admitted uncounted, which fails with
  the limit declared `refuse`.

## Context

The request log stopped writing an error's words
([0168](0168-the-log-is-built-from-a-list-of-fields.md)) and said what it did not touch: a `500`
still answered its client with the error's message. That is Fastify's default reply to an
error, `{ statusCode, code, error, message }`, whatever was thrown. For a database error the
message is the failing query and its parameters — what the request sent, and what the server
added beside it: ids, timestamps, the stored form of an answer. For a disk it is the path it
could not write. `server.integration.test.ts` asserted a full disk's sentence reaching whoever
had sent the file, and 0168, SAFETY-ANALYSIS C3 and arc42 §11.2 carried it as accepted.

A review of the log found the way to it. A file's id is a `uuid` column, and an id PostgreSQL
cannot read as one is not "no such file" there: the comparison itself fails, `22P02`, and the
request was a `500` whose body quoted the query and the id. Three ways reached it from outside —
reading a file, sending its bytes, and a response naming its attachments, the last two public —
and a fourth on the management plane, replaying a delivery. The in-memory storage every other
suite runs on finds no row and answers `undefined`, as the port says, so the two storages
disagreed and nothing but real SQL could see it. The same review found the route that receives
a file's bytes without a limit: the guard 0170 added named it, beside a form's read, as the one
public route allowed none, and no document said that was a decision.

What constrains the fix is where Fastify writes its line about an error. `request.failed` and
`request.refused`, with the error's kind and code, are `RequestLines.defaultErrorLog` in
`server-log.ts` — a `LogController` method Fastify 5.12.5 calls from one place, its default
error handler (`lib/error-handler.js`, lines 78–81). An error handler set with `setErrorHandler`
runs instead of that one, and the line goes with it.

## Decision

**A 5xx keeps the shape of Fastify's reply and says only its status.** `error` and `message` are
both the status's own name — `Internal Server Error`, `Service Unavailable` — and `code` is there
only when the error named its own status, and only in the shape the log keeps a code in. An error
that names its status was made to be answered, by this server or by Fastify, and its code is
part of the answer: `RATE_LIMIT_UNAVAILABLE` is how an integrator tells a sign-in that could not
be counted from a server that failed
([0170](0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)). One that names
none is a fault from below, and its code — `ENOSPC`, an SQLSTATE — is the operator's, in the log.
**A 4xx is answered as before**: its sentence was written for the client. **A route's own 5xx**,
answered rather than thrown, keeps the words the route chose.

**Two hooks, and Fastify's default handler left alone** (`server/error-replies.ts`). The default
handler sets the status and writes the line, as it always has; `onSend` replaces the body of an
error's reply once the status is final; `onError` remembers the error, which is how `onSend`
knows the body is an error's rather than a route's. Both are added on the root instance before
any route, and neither depends on the log, so an app given none withholds the same words.

**Decided with it:**

- **An id a `uuid` column cannot hold names no row.** The PostgreSQL storage answers `undefined`
  for a file's or a delivery's id that is not a uuid, without asking, which is what the port
  says and the in-memory storage does; the port now says it in words. One check, in the adapter
  whose column it is, rather than one at each of four routes and in `server-core`, which knows
  nothing of uuids.
- **The bytes of a file are limited like their offer**: the offer's budget, counted apart, and
  admitted uncounted when the counter cannot answer — 0170's rule for a route that needs the
  database for its own work, applied to the one public route it had left out. An offer makes a
  place, not one attempt at it: each attempt is read whole, up to the deployment's ceiling on a
  file, before the route can refuse it.

## Consequences

**Nothing a 5xx answers came from what was thrown**, and the operator's line about it is the
line it was, with no change to `server-log.ts` beyond sharing its rule for a code.

**A client is told less.** A person who reports a `500` can quote its status and nothing else;
the reply carries no request id, so their report meets the log by route and time. A client can
no longer tell a full disk from a database that refused, which it could not act on differently
anyway. `RATE_LIMIT_UNAVAILABLE`'s sentence — the request could not be counted, try again — is no
longer answered; its status and its code are. The admin's sign-in reads the status and says what
it said. Its model pane shows a failure's `message`, and says `Service Unavailable` where it said
the request could not be counted.

**The rule depends on Fastify running `onSend` for an error's reply**, which it does in 5.12.5 and
which these tests hold. One path does not: an error thrown while an error's reply is being sent —
by an `onSend` hook, say — is written by Fastify's fallback directly, with its own message. This
server's hook does not throw; the rate limit plugin's adds headers. Nothing checks every
plugin's.

**A 4xx still carries what was thrown.** That is right for the refusals Fastify and this server
write, and would be wrong for a library's error naming a 4xx of its own — a model provider's SDK
names the provider's `401` — were one to escape a route. The model's adapters catch theirs and
answer a failure, which the route words itself; nothing holds every future route to that.

**Every reply passes one more hook**: a comparison for every reply below 500, a map lookup above
it. Not measured.

**An id spelled as PostgreSQL would also read it** — braced, or without hyphens — finds no file
now where the database would have found one. No id was ever handed out in either spelling.

**The bytes route can refuse a respondent**: thirty a minute from one address, counted apart from
the offers, so one respondent sending thirty-one files in a minute — or a retry loop — is told
`429`, and everybody behind one unnamed proxy shares the budget (SAFETY-ANALYSIS D14). While the
counter cannot answer it has no limit, as every public route has none then (D19).

**A value a `text` column cannot hold is still a `500`.** PostgreSQL refuses a NUL byte in text,
`22021`: measured on 2026-10-11, a form's path with one in it, on the public read that has no
limit, and a sign-in's email with one are each a `500` and a `request.failed` line at `error`.
Neither carries any words now. Other columns were not surveyed, `jsonb` among them. arc42 §11.2
carries it.

## Alternatives considered

**An error handler of our own.** The idiomatic place to decide a reply, and the one Fastify's
documentation shows. It runs instead of the default handler, so the line goes — tried, and five
cases failed on that alone — or the handler writes it itself, which needs `RequestLines` handed to it and
a copy of Fastify's rule for an error's status, `setErrorHeaders` and `setErrorStatusCode`, both
internal to it. Its documentation says a status below 400 is made a 500 before a custom handler
is called; in 5.12.5 that happens inside the default handler, and before a custom one only while
a diagnostics channel is listening. A copy of a rule already described two ways drifts with the
next Fastify, and nothing would say so.

**An error handler that hands the default one a stand-in**, `Object.create(error, { message })`,
the idiom Fastify's own fallback uses. The line keeps its kind and code, since both are read
through the prototype, and the default handler sets the status. But the handler has to know
whether the reply will be a 5xx before the default handler has decided it — the same copied rule
— and whether the log names the error rightly would depend on the log and the serializer both
reading through a prototype, which nothing about either promises.

**A response schema for 5xx on every route.** Fastify serializes an error's reply with the route's
schema for its status, but hands the serializer the error's message explicitly; replacing it means
a constant in every route's schema, added through `onRoute`, for what is one hook.

**Keeping the message of an error that names its status** — `expose`, as `http-errors` and Koa
have it. `RATE_LIMIT_UNAVAILABLE` would keep its sentence. But an error from a library can name a
5xx and carry words from below it — an upstream's address — and "no words in a 5xx" is a rule a
test can hold without exceptions.

**No code in any 5xx.** Simplest, and it loses `RATE_LIMIT_UNAVAILABLE`, which 0170 and
`MIGRATIONS.md` document as the reply's for integrators.

**A sentence of our own as the message.** Words a client might match on, saying what the status
already says.

**The id checked at each route**, before the database. Four routes and a use-case in `server-core`
reach the lookup, and the storage that breaks the port's promise is the one that should keep it.
A route schema with `format: 'uuid'` answers `400`, not the `404` an unknown file is, and only on
the routes that declare it.
