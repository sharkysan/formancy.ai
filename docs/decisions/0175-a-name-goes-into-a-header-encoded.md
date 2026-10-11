# 0175 — A name goes into a header encoded, and an error's reply drops a header that cannot be written

- **Status:** accepted
- **Date:** 2026-10-11
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/attachment-names.integration.test.ts`, on real PostgreSQL: a
  file uploaded as `日本 €.pdf`, `a\u0001b.pdf`, a name with DEL in it, `café.pdf`, `a"b\r\n.pdf` and
  a lone surrogate is downloaded with `200`, its bytes, and the header that says its name —
  `attachment; filename="__ _.pdf"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%20%E2%82%AC.pdf` for the
  first — and `notes.pdf` with the header it always had; the export of a form at `line\nbreak`,
  `日本`, `a\u0001b`, `a"b` and `café` likewise. Each of the eleven failed before the change: seven as
  a `500` saying `ERR_INVALID_CHAR` and `Invalid character in header content
  ["content-disposition"]`, four on the header alone. `header-values.test.ts`: the header for ten
  names, each with the failure it prevents, and for every UTF-16 code unit between two letters and
  three code points beyond the BMP a header that reads back as the name and, from every export of
  the module, a value Node writes in printable ASCII — reverting `attachment` to the old rule fails
  all twelve of those, and all eleven integration cases; and the server's sources read through the
  TypeScript compiler, finding every argument to a call that writes a header to be of a literal type
  or made in `header-values.ts` — putting the two old template literals back fails it, naming
  `routes/files.ts` and `app.ts` at their lines, and the integration cases with it.
  `error-replies.test.ts`: a route whose header Node refuses is answered `{ "statusCode": 500,
  "error": "Internal Server Error", "message": "Internal Server Error" }` without the header, and
  the log has its `request.failed` line with `TypeError` and `ERR_INVALID_CHAR`; the same with a
  stream for the body; a `409` thrown after such a header keeps its own sentence; a fault thrown
  after a route chose `404` says `Not Found` and nothing else; and every route in the route table,
  read through Fastify's `fastify.initialization` channel, with such a header put on every request,
  and Fastify's not-found handler, answer without a word of Node's. Taking the drop out of the hook
  fails the first three cases and the sweep, on all forty answers; letting a 4xx keep a fault's
  words fails the `404` case and the sweep, on the twenty-seven answers that are not a `HEAD`'s,
  whose body Fastify empties; and an `onSend` hook added after this one that puts such a header back
  on one route's errors fails the sweep alone, naming that route's three methods.

## Context

Two routes put a name somebody else chose into `content-disposition`. `GET /f/:path/files/:id`
serves a file under the name its respondent gave it, with `"`, CR and LF taken out; the name is
kept as given and is display only ([0055](0055-files-are-claimed.md)). `GET
/f/:path/submissions/export.csv` serves a form's answers under the form's path, with nothing taken
out; `POST /forms` takes any path that is not empty. Node writes a header only when every
character of its value is a tab, printable ASCII or a byte from 0x80 to 0xFF, and throws
`ERR_INVALID_CHAR` for anything else — when the reply is written, after the route has answered.

Measured on 2026-10-11 against real PostgreSQL, through `inject` and over a socket alike: a file
named `日本 €.pdf`, `a\u0001b.pdf`, one with DEL in it, or a lone surrogate — which the database
gives back as U+FFFD — could not be downloaded, and a form at `line\nbreak`, `日本` or `a\u0001b`
could not be exported. Each was a `500` whose body was
`{"statusCode":500,"code":"ERR_INVALID_CHAR","error":"Internal Server Error","message":"Invalid character in header content [\"content-disposition\"]"}`.
A respondent's own script can put a control character in a name; the uploaders this
repository supplies send a file's own name, so a file named in Japanese on the respondent's disk
is enough. What was answered was not always right either. `é` is one of the bytes
Node accepts, and the server sent it as one byte, its Latin-1, before a stream, and as two, its
UTF-8, before a string body — measured on Node 22 with Fastify 5.12.5 — so `fetch` read `café`
on the download and `cafÃ©` on the export. A path with a quote in it ended the quoted name at the
quote.

A sweep of every header the server writes found no other built from data. The download's
`content-type` is `application/octet-stream` whatever the file was offered as, the submission
read's `cache-control` is a constant, and no route writes a `location`.

**Why 0172 did not reach it.** [0172](0172-a-5xx-says-nothing-of-what-was-thrown.md) answers a
5xx with its status's name, replacing the body in `onSend`. Here the header write failed after
`onSend`, so Fastify handled the error — and answered it with the headers the reply already had,
since its error handling takes out the content type and length and nothing else. The error's own
reply failed on the same header. A second failure goes to Fastify's last resort,
`fallbackErrorHandler` in `lib/error-handler.js` (5.12.5), which writes
`{ statusCode, code, error, message }` from the error it was given without running a hook,
trying the headers once more and then writing none. That is the residual 0172 named — "an error
thrown while an error's reply is being sent" — reached by a route's own header rather than by a
hook. And it was not only a 5xx: Fastify keeps a status of 400 or more that a reply already
had, so a route's own refusal whose header could not be written — a `401` for want of a session,
a `404` for no such form — was answered under that status with Node's code and sentence. A header
Node cannot write, put on every request, showed it on every route the server has and on Fastify's
not-found handler.

## Decision

**A header made from data is made in `server/header-values.ts`, and a route writes what it
returns.** `attachment(name)` is RFC 6266's `content-disposition`. `filename` is a quoted string
in printable ASCII, every character it cannot hold as itself made `_`: anything outside printable
ASCII, the quote that would end it, the backslash some readers take as an escape and others do
not, and the percent sign some readers decode (RFC 6266, appendix D). When that lost anything,
`filename*=UTF-8''…` follows: RFC 8187's extended value, the name's UTF-8 with every byte that is
not an attr-char written `%XX`, which RFC 6266 has a reader prefer when both are there. A name in
plain ASCII keeps the header it had. The download and the export both use it.

**An error's reply is written without a header Node would refuse.** The `onSend` hook that
withholds a 5xx's words removes from any error's reply each header `validateHeaderName` or
`validateHeaderValue` from `node:http` refuses — Node's own checks, not a copy of them — so that
the error's reply is the one written, through the hook.

**A fault answered under a 4xx says only its status.** 0172 let a 4xx keep its words because a
refusal's sentence is written for the client. That is true of an error that names its own status,
as Fastify's refusals and this server's do. One that names none, answered under a 4xx because
the reply had one when it was thrown, is a fault, and is answered as a 5xx is: the status's name,
and no code.

## Consequences

**A file is downloaded, and a form exported, whatever its name.** The exact name is in
`filename*`; `filename` beside it is for a reader that does not know `filename*`, and which of
the two a given browser saves under was not tried here.
`content-disposition` for an ordinary name is unchanged; for a Latin-1 one like `café.pdf` it
changes from the raw byte to `caf_.pdf` with the name in `filename*`, which an integrator that
read only `filename` sees.

**The name is not cleaned.** The old rule deleted `"`, CR and LF; now they, a control character
and a path separator go to the reader's browser encoded, and making a name its system can save
from them is the browser's, as it is for every download. What a given browser makes of them was
not tried.

**A long name makes a long header.** Nothing shortens a name, and the respondent chooses it up to
the request body's limit, 256 kB by default; percent-encoding writes a character outside ASCII as
six to twelve characters. A long name was a long header before, in fewer characters. How a proxy
in front of the server answers a header that long was not tried.

**A header that cannot be written is found by its route and code, not its name.** The client gets
the withheld `500`; the log has `request.failed` with `TypeError` and `ERR_INVALID_CHAR` on the
route, and does not say which header. Under a 4xx the line is `request.refused`, at `info`,
though the fault is the server's: Fastify's default handler decides which from the status, and
this change does not move it.

**A 4xx from a fault says less than it did.** An error that names no status and is answered
under a 4xx — thrown after a route chose one, or while a refusal was written — says the status's
name and nothing else. Nothing in this server chooses a 4xx and then throws, so what changes in
practice is the planted case; an error that names its own 4xx is answered as before.

**The drop holds while no `onSend` hook runs after it** that puts a header back or throws. None
does but Fastify's own on a `HEAD` route, which sets a length. The route sweep finds one that
misbehaves on the requests it makes, and no other.

**Every error's reply checks its headers**: a few calls per header, on errors only. Not measured.

## Alternatives considered

**The `content-disposition` package**, jshttp's, which Express uses — already in the lockfile,
through the MCP SDK's Express, and not a dependency of the server. It writes both parameters,
and it is a runtime dependency and a SOUP row for some twenty lines. Version 1.1.0, run on
2026-10-11, keeps a Latin-1 name as itself, `filename="café.pdf"`, which is the raw byte this
change stops sending, escapes a quote as `\"`, which RFC 6266 advises against, and keeps only the
last segment of a name with a `/` in it.

**Only replacing what Node refuses.** The header would be written, and every name outside
Latin-1 saved as underscores; the raw-byte problem would stay.

**Both parameters always.** Simpler to read, and it changes the header of every ordinary name,
which a client or a proxy rule may match on.

**Refusing such a name at the offer, or such a path at publish.** A file's name is the
respondent's: `日本.pdf` is an ordinary name in Japanese, and refusing it would refuse a
respondent for their language. A path could be refused at publish; forms exist at such paths
now, and their export has to be named either way. Not decided here.

**Dropping every header from an error's reply.** An error's reply has headers it needs — a
`429`'s `retry-after`, a limit's counts, the headers an error carries for Fastify to set. Only the
one that cannot be written is the problem.

**Dropping a header that cannot be written from every reply, not only an error's.** The first write
would never fail, and a download would go out without its `content-disposition`, inline where the
browser decides, with nothing said. A route that builds a header Node refuses is broken; a `500`
and a line at `error` say so.

**The drop as each route's own hook, added through `onRoute`.** Fastify runs a route's own hooks
after its context's, so it would run after any hook a plugin adds. But Fastify's not-found handler
is no route and would have none, the rate limit plugin adds its own through `onRoute` too, and
the order of two `onRoute` listeners is the order they were registered in. With no plugin hook to
run after, the sweep is the cheaper guard, and it fails when one appears and misbehaves.

**Answering a fault under a 4xx as a `500`.** Truer, and it would contradict the line Fastify has
already written with the 4xx, and copy Fastify's rule for an error's status, which 0172 declined
to copy.

**A guard that finds `.header(` and a template literal with a pattern.** It would know one
spelling. A value is checked by the type the compiler gives it: a literal type cannot have come
from a request or the database, whatever it is spelled as, and a call into `header-values.ts` is
held to every code unit.
